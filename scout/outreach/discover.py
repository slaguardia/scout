"""Brain knowledge discovery + change-aware auto-sync. Port of
internal/outreach/discover.go.

A knowledge Need is a general, method-level question the outreach pipeline asks of
the brain. Discovery maps each need to the brain pages that answer it; the pages'
whole text is the knowledge the fill step and honesty checker reason over.
"""
from __future__ import annotations

import json
import sqlite3
from dataclasses import dataclass, field
from typing import Callable

from scout import anthropic, brainbot
from scout.store import outreach_sources, settings

from .jdfetch import trunc
from .jsonutil import extract_json_object


@dataclass
class Need:
    """One method-level knowledge need. hard means empty → drafting blocked;
    voice/logistics degrade. desc tells the discovery agent what satisfies it."""

    key: str = ""
    hard: bool = False
    desc: str = ""


# KnowledgeNeeds is the fixed list. Experience is hard because it is the honesty
# checker's ground truth; voice and logistics degrade gracefully.
KNOWLEDGE_NEEDS = [
    Need("experience", True,
         "the user's professional experience: roles, durations, projects, team scope, "
         "skills, achievements, credentials, clearances"),
    Need("voice", False, "the user's writing voice, tone, and style"),
    Need("logistics", False,
         "the user's application logistics / biographical facts: current location (city, "
         "state, country), work authorization or visa status, citizenship, availability or "
         "start date, salary or compensation expectations, willingness to relocate, and "
         "portfolio/profile links"),
]


class ErrNoExperience(Exception):
    """Raised by discover() when no brain page is relevant to the (hard)
    experience need — outreach cannot run without an experience ground truth, so
    this is a loud, blocking error, never a silent empty bundle."""

    def __init__(self) -> None:
        super().__init__(
            "no brain page relevant to experience — outreach needs an experience source; "
            "add experience to the brain and re-discover"
        )


@dataclass
class SourcePage:
    """One resolved page in a DiscoveryResult (id + title, no content)."""

    page_id: str = ""
    title: str = ""


@dataclass
class NeedResult:
    """What discovery resolved for one need."""

    need: str = ""
    hard: bool = False
    pages: list[SourcePage] = field(default_factory=list)


@dataclass
class DiscoveryResult:
    """The full outcome of a discovery pass."""

    needs: list[NeedResult] = field(default_factory=list)


# discoverySystem instructs the (cheap) discovery model to map needs to brain page
# ids — and, critically, to return EMPTY for a need with no relevant page rather
# than reaching for an off-topic one.
DISCOVERY_SYSTEM = """You select which of a user's knowledge-base pages are relevant to job-search OUTREACH, grouped by NEED.

You are given the page MAP (one line per page: id | title | path) and a list of NEEDS. For each need, return the ids of the pages whose title and path indicate they genuinely cover that need.

CRITICAL RULE: Walk the whole map. If NO page is genuinely relevant to a need, return an EMPTY list for that need. NEVER pick an off-topic page just to avoid returning empty — a wrong "experience" page silently corrupts every email and defeats the honesty check. Returning [] for a need the knowledge base does not cover is the correct, expected answer.

Return ONLY a JSON object with exactly one key per need, each an array of page ids (possibly empty), e.g. {"experience": ["id1","id2"], "voice": [], "logistics": []}."""


def discover(
    brain: brainbot.Client,
    client: anthropic.Client,
    con: sqlite3.Connection,
    model: str,
) -> DiscoveryResult:
    """Run the discovery pass: read the brain /map, have the model select pages per
    need, whole-fetch each selected page via /doc, and cache the result in
    outreach_sources (replacing the prior set per need). Persists everything it
    finds, then raises ErrNoExperience if the hard experience need came back empty
    (the caller surfaces it; the draft gate independently enforces it)."""
    if model == "":
        model = anthropic.DEFAULT_MODEL  # Haiku — discovery is cheap title-matching
    m = brain.map()
    valid: dict[str, brainbot.MapSource] = {}
    listing: list[str] = []
    for s in m.sources:
        valid[s.id] = s
        listing.append(f"{s.id} | {s.title} | {s.path}\n")

    need_lines = "".join(f"- {n.key}: {n.desc}\n" for n in KNOWLEDGE_NEEDS)
    user = f"NEEDS:\n{need_lines}\nMAP (id | title | path):\n{''.join(listing)}"

    resp = client.send(anthropic.Request(
        model=model,
        system=DISCOVERY_SYSTEM,
        max_tokens=1000,
        messages=[anthropic.Message("user", user)],
    ))
    cleaned = extract_json_object(resp.text())
    picks = json.loads(cleaned)

    result = DiscoveryResult()
    for need in KNOWLEDGE_NEEDS:
        sources: list[outreach_sources.OutreachSource] = []
        pages: list[SourcePage] = []
        seen: set[str] = set()
        for id in (picks.get(need.key) or []):
            if id not in valid or id in seen:  # ignore ids the model invented
                continue
            seen.add(id)
            try:
                doc = brain.doc(id)
            except Exception:  # noqa: BLE001 - a listed-but-unfetchable page: skip, don't fail the pass
                continue
            sources.append(outreach_sources.OutreachSource(
                need=need.key, page_id=id, title=doc.title, content=doc.text, version=doc.version))
            pages.append(SourcePage(page_id=id, title=doc.title))
        outreach_sources.replace_outreach_sources(con, need.key, sources)
        result.needs.append(NeedResult(need=need.key, hard=need.hard, pages=pages))

    for n in result.needs:
        if n.hard and len(n.pages) == 0:
            raise ErrNoExperience()
    return result


def ensure_knowledge(
    brain: brainbot.Client | None,
    client: anthropic.Client,
    con: sqlite3.Connection,
    model: str,
    log: Callable[[str], None] | None,
) -> None:
    """Keep the cached outreach knowledge in sync with the brain, automatically —
    the change-aware replacement for the old manual "Refresh sources" button. It
    asks the brain's cheap GET /changes whether anything moved since the cursor
    stored at the last discovery and only re-runs the (Haiku) discovery pass when
    the brain actually changed.

    Best-effort by design: when the brain is unreachable or the cheap check fails
    it leaves the last-good cache in place and returns, so drafting proceeds against
    whatever is cached (the hard-experience gate is enforced separately, at draft
    time). It raises only when the brain reported a change but the re-discovery
    itself failed for an unexpected reason; ErrNoExperience is a successful pass
    that found no experience page, and still advances the cursor."""
    if brain is None or not brain.enabled():
        return  # offline → serve the local cache (taste.md fallback handles a cold one)

    def logf(s: str) -> None:
        if log is not None:
            log(s)

    cursor = settings.get_setting(con, settings.OUTREACH_CURSOR_SETTING)
    try:
        cr = brain.changes(cursor)
    except Exception as e:  # noqa: BLE001 - best-effort; serve the cache
        logf(f"outreach: knowledge change-check unreachable ({e}); serving cached knowledge")
        return
    if not cr.changed:
        # Nothing moved: re-stamp the cursor (it can advance trivially) and serve
        # the cache verbatim — no LLM, no refetch.
        settings.set_setting(con, settings.OUTREACH_CURSOR_SETTING, cr.cursor)
        return
    # Changed (or cold) → re-discover whole pages from the brain.
    try:
        discover(brain, client, con, model)
    except ErrNoExperience:
        pass  # a successful pass that found no experience page — still advance the cursor
    except Exception as e:  # noqa: BLE001 - surface a real re-discovery failure
        raise RuntimeError(f"re-discover outreach knowledge: {e}")
    # Store the cursor as of this discovery so the next check goes warm.
    settings.set_setting(con, settings.OUTREACH_CURSOR_SETTING, cr.cursor)
    logf("outreach: knowledge synced from brain (changed)")
