"""Package criteria resolves the user's criteria block (what the user wants) for
the verdict stage.

A typed criteria doc (Settings → Knowledge → Criteria, the `criteria_doc`
singleton) wins outright: a non-empty doc is served as-is and the brain is not
consulted at all. With no typed doc, the brain's distilled company-fit brief is
resolved through a locally-cached change-propagation cost cascade rather than a
dumb TTL — each tier only pays for the next when something genuinely changed:

  - Warm path (a cached brief WITH a stored cursor):
    Tier 0 — ask the brain whether anything moved since the stored cursor.
      Nothing moved → serve the cached brief verbatim (one cheap call, no LLM),
      just re-stamping verified_at.
    Tier 1 — something moved → re-run the recall gather and compare the basis. An
      unchanged basis → still serve verbatim, no LLM.
    Tier 2 — the basis actually changed → re-synthesize, store the new brief +
      basis + cursor, and bump the version.
  - Cold path (no cache, or a pre-cursor row): a full distill, stored WITH the
    current cursor so the next resolve goes warm.
  - Fallback: when the brain is unreachable, serve the last cached brief while it
    is within the TTL ceiling.

Nothing anywhere — no typed doc, no brain (or a brain that can't be reached
with no usable cache) — raises ErrNoCriteria: scoring against empty criteria is
never silently allowed.
"""

from __future__ import annotations

import hashlib
import sqlite3
import threading
from collections.abc import Callable
from dataclasses import dataclass
from typing import Protocol

from scout.brainbot import Chunk, Client
from scout.store import brain_profile, criteria_doc
from scout.store.brain_profile import BrainProfile

# HEALTH_TIMEOUT bounds the liveness probe before a (potentially slow)
# distillation. The brainbot client also applies its own client-level timeout.
HEALTH_TIMEOUT = 5.0  # seconds

# LOCAL_SOURCE labels a block served from the typed criteria doc.
LOCAL_SOURCE = "local:criteria"


@dataclass
class Block:
    """The resolved criteria context. version is the first 12 hex chars of
    sha256(text) — it changes whenever the criteria change (the doc is edited,
    or the brain learns something), which re-scores cached verdicts."""

    text: str = ""  # raw criteria block fed to the LLM
    version: str = ""  # short hash for cache keys
    source: str = ""  # 'local:criteria' or 'brain:brief@<url>'


def hash_text(s: str) -> str:
    """The canonical criteria version for a piece of text."""
    return hashlib.sha256(s.strip().encode()).hexdigest()[:12]


def from_text(text: str, source: str) -> Block:
    """Build a criteria Block from prose. source is a label like
    "brain:brief@http://127.0.0.1:8100" or LOCAL_SOURCE; the text is opaque."""
    text = text.strip()
    return Block(text=text, version=hash_text(text), source=source)


class ErrBrainUnavailable(Exception):
    """Raised by Resolver.refresh when the brain isn't configured."""


class ErrNoCriteria(Exception):
    """Raised by Resolver.resolve when there are no criteria anywhere to score
    against — no typed doc and nothing usable from the brain."""

    def __init__(self, detail: str = "") -> None:
        msg = (
            "no criteria on file — type them in Settings → Knowledge → Criteria, "
            "or connect a brain with company-fit pages"
        )
        if detail:
            msg += f" ({detail})"
        super().__init__(msg)


class BriefSource(Protocol):
    """Produces the user's criteria from the brain, split into the cost cascade's
    two phases so the resolver can gate the expensive LLM step on what actually
    changed.

      - gather runs the brain read fan-out (recall + dedup, NO LLM) and returns
        (chunks, basis). basis is the stable version key over prompts + content.
      - synthesize runs the LLM step over a prior gather's chunks → brief.
      - distill is the whole pipeline (gather → synthesize), used by the cold path,
        refresh(), and `scout distill`.

    Contract: a non-empty brief is a successful distillation. The resolver treats
    EVERY error (raised) and an empty brief as a signal to fall back."""

    def gather(self) -> tuple[list[Chunk], str]: ...
    def synthesize(self, chunks: list[Chunk]) -> str: ...
    def distill(self) -> tuple[str, str]: ...


def _brain_source(url: str) -> str:
    """The stable criteria source label. It does NOT vary with cache-vs-live."""
    return "brain:brief@" + url


def _block_from_cache(cp: BrainProfile, url: str) -> Block:
    """Build a criteria block from a cached row. The version is keyed off the
    stored stable basis hash (content_hash), NOT the brief body."""
    blk = from_text(cp.body, _brain_source(url))
    blk.version = cp.content_hash
    return blk


@dataclass
class Resolver:
    """Resolves criteria: the typed doc, else the TTL-cached distilled brief."""

    brain: Client | None = None  # optional; None/disabled → typed doc only
    distiller: BriefSource | None = None  # produces the brief; None → typed doc only
    store: sqlite3.Connection | None = None  # holds the typed doc + the brief cache
    ttl: float = 0.0  # cache freshness window, seconds; <= 0 means always refetch
    # log, if set, receives one human-readable line per resolution decision.
    log: Callable[[str], None] | None = None

    def _log(self, fmt: str, *args) -> None:
        if self.log is not None:
            self.log(fmt % args if args else fmt)

    def _brain_enabled(self) -> bool:
        """Requires both a reachable-configured brain client and a distiller.
        Missing either means the brain is never consulted."""
        return self.brain is not None and self.brain.enabled() and self.distiller is not None

    def local(self) -> str:
        """The typed criteria doc, or "" when none is saved."""
        if self.store is None:
            return ""
        return criteria_doc.get_criteria_doc(self.store).strip()

    def resolve(self) -> Block:
        """Return the current criteria block: the typed doc when there is one,
        otherwise the brain's brief via the cost cascade. Raises ErrNoCriteria
        when neither yields anything."""
        local = self.local()
        if local != "":
            return from_text(local, LOCAL_SOURCE)

        if not self._brain_enabled():
            raise ErrNoCriteria("no brain configured")

        url = self.brain.base_url
        cp = brain_profile.get_brain_profile(self.store, url)
        has_cache = cp is not None and cp.body.strip() != ""

        # Warm path: a cached brief WITH a stored cursor → run the cascade.
        if has_cache and cp.cursor != "":
            try:
                return self._cascade(url, cp)
            except Exception as err:  # noqa: BLE001 - any cascade failure → no criteria
                self._log("criteria: %s; no criteria available", err)
                raise ErrNoCriteria(str(err)) from err

        # Cold path: no cache, or a pre-cursor row → full distill, stored WITH
        # the current cursor so the next resolve takes the warm path.
        try:
            blk = self._fetch_and_cache(url)
            self._log("criteria: cold distill from %s (cursor stored)", url)
            return blk
        except Exception as err:  # noqa: BLE001 - couldn't refresh; try the cache
            if has_cache and self._within_ceiling(cp):
                self._log(
                    "criteria: %s; serving cached brief within ttl ceiling (verified %s)",
                    err,
                    _verified_ago(cp),
                )
                return _block_from_cache(cp, url)
            self._log("criteria: %s; no usable cache — no criteria available", err)
            raise ErrNoCriteria(str(err)) from err

    def _cascade(self, url: str, cp: BrainProfile) -> Block:
        """Run the change-propagation cost cascade for a cached brief that has a
        stored cursor. Returns the cached brief verbatim unless a real basis change
        forces a fresh synthesis; raises only when the brain can't be reached for
        Tier 0 AND the cached brief is past the TTL ceiling."""
        # Tier 0: did anything in the brain move since we last confirmed-current?
        try:
            cr = self.brain.changes(cp.cursor)
        except Exception as err:  # noqa: BLE001 - brain unreachable for the change signal
            if self._within_ceiling(cp):
                self._log(
                    "criteria: Tier 0 unreachable (%s); serving cached brief within ttl ceiling (verified %s)",
                    err,
                    _verified_ago(cp),
                )
                return _block_from_cache(cp, url)
            raise RuntimeError(
                f"brain change-signal unreachable at {url} and cached brief past ttl ceiling: {err}"
            )
        if not cr.changed:
            # Tier 0 hit: nothing moved. Stamp confirmed-current; serve verbatim.
            self._touch(url, cr.cursor)
            self._log(
                "criteria: Tier 0 — brain unchanged since cursor; cached brief served verbatim"
            )
            return _block_from_cache(cp, url)

        # changed=True → Tier 1: re-run the recall gather and compare the basis.
        try:
            chunks, basis = self.distiller.gather()
        except Exception as err:  # noqa: BLE001 - a recall hiccup mid-gather → keep the cache
            self._log("criteria: Tier 1 gather failed (%s); serving cached brief", err)
            return _block_from_cache(cp, url)
        fresh_version = hash_text(basis)
        if fresh_version == cp.content_hash:
            # Tier 1 absorb: the coarse cursor advanced but OUR basis is unchanged.
            self._touch(url, cr.cursor)
            self._log("criteria: Tier 1 — basis unchanged; cursor advanced, brief served verbatim")
            return _block_from_cache(cp, url)

        # Tier 2: the company-fit-relevant content actually changed → synthesize.
        try:
            brief = self.distiller.synthesize(chunks)
        except Exception as err:  # noqa: BLE001 - synthesis failed → serve last-good
            self._log("criteria: Tier 2 synthesis failed (%s); serving cached brief", err)
            return _block_from_cache(cp, url)
        brief = brief.strip()
        if brief == "":
            self._log("criteria: Tier 2 produced an empty brief; serving cached brief")
            return _block_from_cache(cp, url)
        try:
            brain_profile.put_brain_profile(self.store, url, brief, fresh_version, cr.cursor)
        except Exception as perr:  # noqa: BLE001 - a cache write must not block scoring
            self._log("criteria: cache write failed: %s", perr)
        self._log("criteria: Tier 2 — basis changed; re-distilled (version %s)", fresh_version)
        blk = from_text(brief, _brain_source(url))
        blk.version = fresh_version
        return blk

    def _touch(self, url: str, cursor: str) -> None:
        """Record "confirmed unchanged as of now" (cursor + verified_at), logging a
        write failure rather than failing the resolve."""
        try:
            brain_profile.touch_brain_profile(self.store, url, cursor)
        except Exception as err:  # noqa: BLE001
            self._log("criteria: verified-stamp write failed: %s", err)

    def _within_ceiling(self, cp: BrainProfile) -> bool:
        """Whether a cached brief is still fresh enough to serve when the brain
        can't be reached to verify it. A non-positive TTL means "no ceiling"."""
        if self.ttl <= 0:
            return True
        age = cp.verified_age_seconds
        if age < 0:
            age = cp.age_seconds
        return age < self.ttl

    def refresh(self) -> Block:
        """Force a live brain fetch, update the cache, and return the new brain
        block (which the typed doc, if any, still overrides at resolve time). It
        raises (rather than silently falling back) so a manual refresh can report
        brain trouble to the caller."""
        if not self._brain_enabled():
            raise ErrBrainUnavailable("brain not configured")
        return self._fetch_and_cache(self.brain.base_url)

    def cached(self) -> BrainProfile | None:
        """The cached profile row for the configured brain, or None."""
        if not self._brain_enabled():
            return None
        return brain_profile.get_brain_profile(self.store, self.brain.base_url)

    def _fetch_and_cache(self, url: str) -> Block:
        """Health-check the brain, capture the current change cursor, distill the
        criteria brief, write the cache (best-effort), and return the block. The
        cold path and the refresh() path — an UNCONDITIONAL full distill. Raises on
        an unreachable brain or an empty (healthy-but-no-criteria) brain."""
        try:
            self.brain.health()
        except Exception as herr:  # noqa: BLE001
            raise RuntimeError(f"brain unreachable at {url}: {herr}")
        # Capture the brain's cursor BEFORE distilling so the stored cursor reflects
        # the state the brief was built from. An empty `since` always reports
        # changed=True; we only want the cursor. A read failure is non-fatal.
        cursor = ""
        try:
            cr = self.brain.changes("")
            cursor = cr.cursor
        except Exception as cerr:  # noqa: BLE001
            self._log(
                "criteria: cursor read failed during distill (%s); storing empty cursor", cerr
            )
        brief, basis = self.distiller.distill()
        brief = brief.strip()
        if brief == "":
            raise RuntimeError(f"brain at {url} is healthy but has no criteria captured yet")
        # Version off the stable basis, not the brief prose.
        version = hash_text(basis)
        try:
            brain_profile.put_brain_profile(self.store, url, brief, version, cursor)
        except Exception as err:  # noqa: BLE001 - a cache-write failure shouldn't block scoring
            self._log("criteria: cache write failed: %s", err)
        blk = from_text(brief, _brain_source(url))
        blk.version = version
        return blk


def _verified_ago(cp: BrainProfile) -> str:
    """Render a cached row's confirmed-current age for logs."""
    if cp.verified_age_seconds < 0:
        return "never"
    return f"{cp.verified_age_seconds}s ago"


def reconcile_loop(stop: threading.Event, interval: float, reconcile: Callable[[], None]) -> None:
    """Periodically invoke reconcile until stop is set, so the cached company-fit
    brief converges to the brain's truth on its own — no manual refresh. It fires
    once after a short startup delay, then every interval. A non-positive interval
    or None reconcile disables the loop. (With a typed criteria doc in place each
    pass is a cheap local read — resolve() returns before any brain call.)

    There is no per-pass timeout or cancellation propagated into reconcile; the web
    layer, its only consumer, does not need one."""
    if interval <= 0 or reconcile is None:
        return
    startup_delay = 15.0  # let the server finish coming up
    if stop.wait(startup_delay):
        return
    while True:
        reconcile()
        if stop.wait(interval):
            return
