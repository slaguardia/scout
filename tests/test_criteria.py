"""Port of internal/criteria/resolver_test.go."""
from __future__ import annotations

import json
import socket
import threading

import pytest

from scout import brainbot, criteria, taste
from scout.store import brain_profile
from tests.httpstub import http_server


# fakeDistiller stands in for the real Distiller so the resolver's cost cascade can
# be tested without a live brain corpus or an LLM call. It counts each phase so a
# test can assert which tier fired.
class FakeDistiller:
    def __init__(self, chunks=None, basis="", brief="", g_err=None, s_err=None, d_err=None):
        self.chunks = chunks or []
        self.basis = basis
        self.brief = brief
        self.g_err = g_err
        self.s_err = s_err
        self.d_err = d_err
        self._gather = 0
        self._synth = 0
        self._distill = 0

    def gather(self):
        self._gather += 1
        if self.g_err is not None:
            raise self.g_err
        return self.chunks, self.basis

    def synthesize(self, chunks):
        self._synth += 1
        if self.s_err is not None:
            raise self.s_err
        return self.brief

    def distill(self):
        self._distill += 1
        if self.d_err is not None:
            raise self.d_err
        return self.brief, self.basis

    def counts(self):
        return self._gather, self._synth, self._distill


# brainStub is a controllable brain HTTP surface for /health + /changes. It mimics
# the real contract: /changes reports changed=true unless `since` already equals
# the stub's current cursor.
class BrainStub:
    def __init__(self, cursor="", health_fail=False, changes_fail=False):
        self.cursor = cursor
        self.health_fail = health_fail
        self.changes_fail = changes_fail
        self.health_hits = 0
        self.changes_hits = 0
        self._lock = threading.Lock()

    def handle(self, req):
        if req.path == "/health":
            with self._lock:
                self.health_hits += 1
            if self.health_fail:
                return 503, {}, ""
            return 200, {"Content-Type": "application/json"}, '{"ok":true}'
        if req.path == "/changes":
            with self._lock:
                self.changes_hits += 1
            if self.changes_fail:
                return 500, {}, ""
            since = req.query.get("since", [""])[0]
            return 200, {"Content-Type": "application/json"}, json.dumps(
                {"cursor": self.cursor, "changed": since != self.cursor}
            )
        return 404, {}, "not found"


def _dead_brain_url() -> str:
    """A URL whose server is already gone, so connections to it are refused."""
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return f"http://127.0.0.1:{port}"


def _seed_cache(con, url, body, basis, cursor):
    """Write a cached brief with a known basis hash + cursor (the warm path's
    precondition)."""
    brain_profile.put_brain_profile(con, url, body, taste.hash(basis), cursor)


def _no_file(tmp_path) -> str:
    """A path to a non-existent taste.md so a test that should never reach the
    offline fallback fails loudly if it does."""
    return str(tmp_path / "none.md")


# --- Tier 0: nothing moved -> serve verbatim, no recall, no LLM ---


def test_cascade_tier0_unchanged(db, tmp_path):
    stub = BrainStub(cursor="cur-1")
    with http_server(stub.handle) as url:
        c = brainbot.new(url)
        _seed_cache(db, c.base_url, "CACHED BODY", "BASIS-X", "cur-1")  # cursor matches stub
        fd = FakeDistiller(brief="SHOULD NOT SYNTH", basis="BASIS-X")
        r = criteria.Resolver(brain=c, distiller=fd, store=db, taste_md_path=_no_file(tmp_path), ttl=3600)

        blk = r.resolve()
    assert blk.text == "CACHED BODY"
    assert fd.counts() == (0, 0, 0), "Tier 0 must do no work"
    assert stub.changes_hits == 1, "exactly one cheap Tier 0 call"
    cp = brain_profile.get_brain_profile(db, c.base_url)
    assert cp.verified_age_seconds >= 0, "Tier 0 should stamp verified_at, not leave it NULL"


# --- Tier 1: brain moved but our basis didn't -> serve verbatim, no LLM ---


def test_cascade_tier1_basis_unchanged(db, tmp_path):
    stub = BrainStub(cursor="cur-2")  # differs from the cache's stored cursor
    with http_server(stub.handle) as url:
        c = brainbot.new(url)
        _seed_cache(db, c.base_url, "CACHED BODY", "BASIS-X", "cur-OLD")
        cp0 = brain_profile.get_brain_profile(db, c.base_url)
        fd = FakeDistiller(brief="SHOULD NOT SYNTH", basis="BASIS-X")  # SAME basis as cached
        r = criteria.Resolver(brain=c, distiller=fd, store=db, taste_md_path=_no_file(tmp_path), ttl=3600)

        blk = r.resolve()
    assert blk.text == "CACHED BODY", "Tier 1 absorb"
    assert fd.counts()[:2] == (1, 0), "Tier 1: want 1 gather, 0 synth"
    assert blk.version == cp0.content_hash, "version must not change on a Tier 1 absorb"
    cp1 = brain_profile.get_brain_profile(db, c.base_url)
    assert cp1.cursor == "cur-2", "cursor must advance so the next resolve is Tier 0"
    assert cp1.content_hash == cp0.content_hash, "Tier 1 must not rewrite content_hash"


# --- Tier 2: the basis actually changed -> synthesize, bump version ---


def test_cascade_tier2_basis_changed(db, tmp_path):
    stub = BrainStub(cursor="cur-3")
    with http_server(stub.handle) as url:
        c = brainbot.new(url)
        _seed_cache(db, c.base_url, "OLD BODY", "BASIS-X", "cur-OLD")
        cp0 = brain_profile.get_brain_profile(db, c.base_url)
        fd = FakeDistiller(brief="NEW BRIEF", basis="BASIS-Y")  # DIFFERENT basis
        r = criteria.Resolver(brain=c, distiller=fd, store=db, taste_md_path=_no_file(tmp_path), ttl=3600)

        blk = r.resolve()
    assert "NEW BRIEF" in blk.text
    assert fd.counts()[:2] == (1, 1), "Tier 2: want 1 gather, 1 synth"
    assert blk.version != cp0.content_hash, "version must bump on a real basis change"
    assert blk.version == taste.hash("BASIS-Y")
    cp1 = brain_profile.get_brain_profile(db, c.base_url)
    assert "NEW BRIEF" in cp1.body and cp1.content_hash == taste.hash("BASIS-Y") and cp1.cursor == "cur-3"


# --- Tier 1 gather hiccup: keep the good cached brief, don't advance the cursor ---


def test_cascade_tier1_gather_fails(db, tmp_path):
    stub = BrainStub(cursor="cur-2")  # differs from cache → changed=true
    with http_server(stub.handle) as url:
        c = brainbot.new(url)
        _seed_cache(db, c.base_url, "CACHED BODY", "BASIS-X", "cur-OLD")
        cp0 = brain_profile.get_brain_profile(db, c.base_url)
        fd = FakeDistiller(g_err=RuntimeError("recall hiccup"))
        r = criteria.Resolver(brain=c, distiller=fd, store=db, taste_md_path=_no_file(tmp_path), ttl=3600)

        blk = r.resolve()
    assert blk.text == "CACHED BODY"
    assert fd.counts()[:2] == (1, 0)
    cp1 = brain_profile.get_brain_profile(db, c.base_url)
    assert cp1.cursor == cp0.cursor, "cursor must NOT advance on a gather failure"
    assert cp1.content_hash == cp0.content_hash


# --- Tier 2 synthesis failure: serve the last-good brief, leave the cache intact ---


def test_cascade_tier2_synth_fails(db, tmp_path):
    stub = BrainStub(cursor="cur-3")
    with http_server(stub.handle) as url:
        c = brainbot.new(url)
        _seed_cache(db, c.base_url, "OLD BODY", "BASIS-X", "cur-OLD")
        cp0 = brain_profile.get_brain_profile(db, c.base_url)
        # changed=true + a NEW basis reaches Tier 2, but synthesis fails.
        fd = FakeDistiller(basis="BASIS-Y", s_err=RuntimeError("llm boom"))
        r = criteria.Resolver(brain=c, distiller=fd, store=db, taste_md_path=_no_file(tmp_path), ttl=3600)

        blk = r.resolve()
    assert blk.text == "OLD BODY"
    assert fd.counts()[:2] == (1, 1)
    cp1 = brain_profile.get_brain_profile(db, c.base_url)
    assert cp1.body == cp0.body and cp1.content_hash == cp0.content_hash and cp1.cursor == cp0.cursor


# --- Unreachable brain: serve the cached brief within the TTL ceiling ---


def test_cascade_brain_unreachable_serves_cache(db, tmp_path):
    url = _dead_brain_url()
    _seed_cache(db, url, "CACHED BODY", "BASIS-X", "cur-1")  # verified now → within ceiling
    fd = FakeDistiller(brief="UNUSED", basis="BASIS-X")
    r = criteria.Resolver(brain=brainbot.new(url), distiller=fd, store=db, taste_md_path=_no_file(tmp_path), ttl=3600)

    blk = r.resolve()
    assert blk.text == "CACHED BODY"
    assert fd.counts() == (0, 0, 0), "an unreachable brain must do no distill work"


# --- Unreachable brain past the ceiling: fall to taste.md ---


def test_cascade_brain_unreachable_past_ceiling_uses_taste(db, tmp_path):
    url = _dead_brain_url()
    _seed_cache(db, url, "STALE CACHED", "BASIS-X", "cur-1")
    # Age verified_at past the TTL ceiling so the cache is too stale to trust.
    db.execute(
        "UPDATE brain_profile_cache SET verified_at = datetime('now','-10 hours'), "
        "fetched_at = datetime('now','-10 hours') WHERE source_url = ?",
        (url,),
    )
    md = tmp_path / "taste.md"
    md.write_text("LOCAL FALLBACK")
    r = criteria.Resolver(brain=brainbot.new(url), distiller=FakeDistiller(), store=db, taste_md_path=str(md), ttl=3600)

    blk = r.resolve()
    assert blk.text == "LOCAL FALLBACK"


# --- Cold path then warm path: distill once, then zero synthesis ---


def test_cold_then_warm_zero_synthesis(db, tmp_path):
    stub = BrainStub(cursor="cur-fresh")
    with http_server(stub.handle) as url:
        c = brainbot.new(url)
        fd = FakeDistiller(brief="DISTILLED BRIEF", basis="BASIS-X")
        r = criteria.Resolver(brain=c, distiller=fd, store=db, taste_md_path=_no_file(tmp_path), ttl=3600)

        # Resolve #1: cold path → one full distill, cursor stored.
        blk1 = r.resolve()
        assert "DISTILLED BRIEF" in blk1.text
        cp = brain_profile.get_brain_profile(db, c.base_url)
        assert cp is not None and cp.cursor == "cur-fresh"

        # Resolve #2: warm path, no brain edit → Tier 0 hit, zero further distill.
        blk2 = r.resolve()
    assert blk2.text == blk1.text
    assert fd.counts() == (0, 0, 1), "exactly 1 distill (cold), 0 gather/synth across two resolves"


# --- No brain at all: taste.md fallback ---


def test_resolve_falls_back_to_taste_md(db, tmp_path):
    md = tmp_path / "taste.md"
    md.write_text("LOCAL FALLBACK")
    # Hard-unreachable brain, no cache → cold path fails → taste.md.
    r = criteria.Resolver(brain=brainbot.new(_dead_brain_url()), distiller=FakeDistiller(brief="unused"),
                          store=db, taste_md_path=str(md), ttl=3600)

    blk = r.resolve()
    assert blk.text == "LOCAL FALLBACK"
    assert blk.source == "file:" + str(md)


# --- Refresh: unconditional full distill, stores the cursor ---


def test_refresh_stores_cursor(db, tmp_path):
    stub = BrainStub(cursor="cur-refresh")
    with http_server(stub.handle) as url:
        c = brainbot.new(url)
        # Even with an already-current cache, Refresh re-distills unconditionally.
        _seed_cache(db, c.base_url, "OLD BODY", "BASIS-X", "cur-refresh")
        fd = FakeDistiller(brief="REFRESHED BRIEF", basis="BASIS-Z")
        r = criteria.Resolver(brain=c, distiller=fd, store=db, taste_md_path=_no_file(tmp_path), ttl=3600)

        blk = r.refresh()
        assert "REFRESHED BRIEF" in blk.text
        assert fd.counts()[2] == 1, "Refresh must do exactly one full distill"
        cp = brain_profile.get_brain_profile(db, c.base_url)
    assert cp.cursor == "cur-refresh" and cp.content_hash == taste.hash("BASIS-Z")


def test_refresh_errors_when_brain_disabled(db):
    # No brain client at all.
    r = criteria.Resolver(brain=None, store=db, taste_md_path="taste.md", ttl=3600)
    with pytest.raises(criteria.ErrBrainUnavailable):
        r.refresh()
    # Brain configured but no distiller wired — also unavailable, no crash.
    with http_server(BrainStub(cursor="x").handle) as url:
        r2 = criteria.Resolver(brain=brainbot.new(url), store=db, taste_md_path="taste.md", ttl=3600)
        with pytest.raises(criteria.ErrBrainUnavailable):
            r2.refresh()
