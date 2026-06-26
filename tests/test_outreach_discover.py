"""Port of internal/outreach/discover_test.go — brain knowledge discovery + the
change-aware EnsureKnowledge sync."""
from __future__ import annotations

import pytest

from scout import anthropic, brainbot
from scout.outreach import ErrNoExperience, discover, ensure_knowledge
from scout.store import outreach_sources, settings
from tests.httpstub import http_server
from tests.outreach_fakes import FakeAnthropic, FakeBrain


def _doc(id, title, path, version, text):
    return {"id": id, "title": title, "path": path, "version": version, "text": text}


# Discovery selects the relevant pages per need, whole-fetches them, and caches the
# text — and ignores an off-topic page the model didn't pick.
def test_discover_selects_and_caches(db):
    fb = FakeBrain({
        "exp": _doc("exp", "Past Experience", "Career/Past Experience", "v1", "Five years at Globex, forward-deployed."),
        "voice": _doc("voice", "Voice & Style", "Writing/Voice", "v2", "Plain, tight sentences."),
        "junk": _doc("junk", "Grocery list", "Home", "v3", "milk, eggs"),
    })
    fa = FakeAnthropic(['{"experience":["exp"],"voice":["voice"]}'])
    with http_server(fb.handle) as burl, http_server(fa.handle) as aurl:
        brain = brainbot.new(burl)
        client = anthropic.Client(api_key="k", endpoint=aurl)
        discover(brain, client, db, "test-model")
    assert fa.errors == []
    assert "Globex" in outreach_sources.outreach_knowledge(db, "experience")
    assert "Plain" in outreach_sources.outreach_knowledge(db, "voice")


# An empty experience selection is a loud, blocking error — never a silent empty
# bundle. Voice still caches.
def test_discover_fails_loud_when_no_experience(db):
    fb = FakeBrain({"voice": _doc("voice", "Voice", "x", "v1", "plain")})
    fa = FakeAnthropic(['{"experience":[],"voice":["voice"]}'])
    with http_server(fb.handle) as burl, http_server(fa.handle) as aurl:
        brain = brainbot.new(burl)
        client = anthropic.Client(api_key="k", endpoint=aurl)
        with pytest.raises(ErrNoExperience):
            discover(brain, client, db, "test-model")
    assert outreach_sources.outreach_knowledge(db, "voice") != "", "voice should still cache"


# The model may not invent ids: an id absent from the map is ignored, which (for
# experience) surfaces as ErrNoExperience rather than a bogus cache.
def test_discover_ignores_hallucinated_ids(db):
    fb = FakeBrain({"voice": _doc("voice", "Voice", "x", "v1", "plain")})
    fa = FakeAnthropic(['{"experience":["does-not-exist"],"voice":["voice"]}'])
    with http_server(fb.handle) as burl, http_server(fa.handle) as aurl:
        brain = brainbot.new(burl)
        client = anthropic.Client(api_key="k", endpoint=aurl)
        with pytest.raises(ErrNoExperience):
            discover(brain, client, db, "test-model")


# EnsureKnowledge is change-aware: a cold cache discovers, an unchanged brain serves
# the cache with no re-discovery, and a moved cursor re-discovers and re-stamps.
def test_ensure_knowledge_change_aware(db):
    fb = FakeBrain({
        "exp": _doc("exp", "Past Experience", "Career/Past Experience", "v1", "Five years at Globex."),
        "voice": _doc("voice", "Voice", "Writing/Voice", "v1", "Plain."),
    }, cursor="c1")
    fa = FakeAnthropic([
        '{"experience":["exp"],"voice":["voice"],"logistics":[]}',  # cold discovery
        '{"experience":["exp"],"voice":["voice"],"logistics":[]}',  # after the change
    ])
    with http_server(fb.handle) as burl, http_server(fa.handle) as aurl:
        brain = brainbot.new(burl)
        client = anthropic.Client(api_key="k", endpoint=aurl)

        # Cold: empty cursor → Changed=true → discover, stamp cursor.
        ensure_knowledge(brain, client, db, "test-model", None)
        assert "Globex" in outreach_sources.outreach_knowledge(db, "experience")
        assert settings.get_setting(db, settings.OUTREACH_CURSOR_SETTING) == "c1"
        assert fa.calls == 1

        # Unchanged: cursor matches → serve cache, no re-discovery.
        ensure_knowledge(brain, client, db, "test-model", None)
        assert fa.calls == 1, "unchanged brain re-discovered"

        # Changed: brain cursor moves → re-discover, re-stamp.
        fb.cursor = "c2"
        ensure_knowledge(brain, client, db, "test-model", None)
        assert fa.calls == 2
        assert settings.get_setting(db, settings.OUTREACH_CURSOR_SETTING) == "c2"

    assert fa.errors == []
