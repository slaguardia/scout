"""The outreach knowledge store: typed ('local') rows next to brain-synced rows."""

from __future__ import annotations

from scout.store import outreach_sources as os_store
from scout.store.outreach_sources import OutreachSource


def _brain(need, page_id, title, content):
    return OutreachSource(need=need, page_id=page_id, title=title, content=content, version="v1")


def test_replace_only_touches_brain_rows(db):
    os_store.put_local_source(db, "experience", "typed experience")
    os_store.replace_outreach_sources(db, "experience", [_brain("experience", "p1", "One", "one")])
    os_store.replace_outreach_sources(db, "experience", [_brain("experience", "p2", "Two", "two")])

    rows = os_store.list_outreach_sources(db)
    assert [(r.page_id, r.origin) for r in rows] == [("local", "local"), ("p2", "brain")]
    # An empty sync (the brain lost the page) still leaves the typed doc.
    os_store.replace_outreach_sources(db, "experience", [])
    assert os_store.outreach_knowledge(db, "experience") == "typed experience"


def test_knowledge_concatenates_typed_first_then_titled_pages(db):
    os_store.replace_outreach_sources(
        db,
        "experience",
        [_brain("experience", "p1", "Zeta", "z"), _brain("experience", "p2", "Alpha", "a")],
    )
    os_store.put_local_source(db, "experience", "typed")
    assert os_store.outreach_knowledge(db, "experience") == (
        "typed\n\n---\n\n# Alpha\n\na\n\n---\n\n# Zeta\n\nz"
    )


def test_knowledge_puts_typed_doc_before_brain_pages_regardless_of_title(db):
    # page_id 'abc' < 'local' and an empty title: every sort key except origin
    # says the brain row comes first. Only the origin term puts the typed doc first.
    os_store.replace_outreach_sources(
        db, "experience", [_brain("experience", "abc", "", "brain-untitled")]
    )
    os_store.put_local_source(db, "experience", "typed")
    assert os_store.outreach_knowledge(db, "experience") == "typed\n\n---\n\nbrain-untitled"
    assert [r.origin for r in os_store.list_outreach_sources(db)] == ["local", "brain"]


def test_local_source_round_trip_and_blank_clears(db):
    assert os_store.get_local_source(db, "voice") == ""
    os_store.put_local_source(db, "voice", "plain, warm")
    assert os_store.get_local_source(db, "voice") == "plain, warm"
    os_store.put_local_source(db, "voice", "plain, warm, specific")  # overwrite in place
    assert os_store.get_local_source(db, "voice") == "plain, warm, specific"
    assert len(os_store.list_outreach_sources(db)) == 1
    os_store.put_local_source(db, "voice", "\n  ")
    assert os_store.get_local_source(db, "voice") == ""
    assert os_store.list_outreach_sources(db) == []


def test_upsert_defaults_to_brain_origin(db):
    os_store.upsert_outreach_source(db, _brain("logistics", "p9", "Where I live", "Denver"))
    (row,) = os_store.list_outreach_sources(db)
    assert row.origin == "brain"
