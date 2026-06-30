"""The draft queue, the gates, the sources peek, the pipeline-prompts editor,
regenerate, and a real end-to-end run driven by the fake Anthropic FIFO server.
"""

from __future__ import annotations

import time

import httpx
from web_helpers import new_test_app, open_db

from scout import anthropic
from scout.outreach import Engine, stage_by_key, stages
from scout.store import contacts, outreach_drafts, outreach_template, postings
from scout.store.contacts import ContactInput
from scout.store.db import connect
from scout.store.outreach_sources import OutreachSource, upsert_outreach_source
from tests.httpstub import http_server
from tests.outreach_fakes import FakeAnthropic

SEED_TEMPLATE = (
    "Subject: [Name] | intro — {{role}}\n\nHi [Name],\n\n"
    "{{hook: one true thing about {{company}}}}\n\nI spent five years at Globex.\n\nThanks,\nAlex"
)


# fakeOutreachRunner records draft ids without running anything.
class FakeOutreachRunner:
    def __init__(self):
        self.started: list[int] = []
        self.skips: list[bool] = []

    def draft(self, draft_id: int, skip_research: bool = False) -> None:
        self.started.append(draft_id)
        self.skips.append(skip_research)


def _seed_outreach_ready(db_path, cid) -> str:
    """A DB template + a discovered experience + voice bundle + a posting."""
    con = open_db(db_path)
    outreach_template.put_outreach_template(con, SEED_TEMPLATE)
    for src in [
        OutreachSource(
            need="experience",
            page_id="exp1",
            title="Past Experience",
            content="Five years at Globex, forward-deployed.",
            version="v1",
        ),
        OutreachSource(
            need="voice",
            page_id="voice1",
            title="Voice & Style",
            content="Plain, tight sentences.",
            version="v1",
        ),
    ]:
        upsert_outreach_source(con, src)
    p = postings.add_posting(con, cid, "https://acme.com/jobs/fde", "FDE")
    con.close()
    return p.id


def _set_result(
    db_path, did, status, research, hook, draft, lint, violations, critique, fail_reason
):
    con = open_db(db_path)
    outreach_drafts.set_outreach_draft_result(
        con, did, status, research, hook, draft, lint, violations, critique, fail_reason
    )
    con.close()


def _job_rows(db_path):
    con = open_db(db_path)
    rows = postings.list_job_rows(con)
    con.close()
    return rows


def _post(client, path, body=""):
    headers = {"Content-Type": "application/json"} if body else {}
    return client.post(path, content=body, headers=headers)


def _put(client, path, body):
    return client.put(path, content=body, headers={"Content-Type": "application/json"})


def test_outreach_draft_queue(tmp_path, monkeypatch):
    client, cid, db_path = new_test_app(tmp_path, monkeypatch)
    runner = FakeOutreachRunner()
    client.app.state.scout.outreach = runner
    pid = _seed_outreach_ready(db_path, cid)

    # Start a draft: 202, runner fired, status researching, nothing degraded.
    rec = _post(client, f"/api/postings/{pid}/outreach")
    assert rec.status_code == 202, (rec.status_code, rec.text)
    started = rec.json()
    assert started["degraded"] == []
    d = started["draft"]
    assert d["status"] == outreach_drafts.DRAFT_RESEARCHING
    assert runner.started == [d["id"]]

    # Default start does not skip research.
    assert d["skip_research"] is False
    assert runner.skips == [False]

    # Second start while active: 409.
    assert _post(client, f"/api/postings/{pid}/outreach").status_code == 409
    # Unknown posting: 404.
    assert _post(client, "/api/postings/nope/outreach").status_code == 404

    # List shows the draft.
    rec = client.get(f"/api/postings/{pid}/outreach")
    assert len(rec.json()["drafts"]) == 1

    # Pipeline finishes -> user edits (no lint in the template model).
    _set_result(
        db_path,
        d["id"],
        outreach_drafts.DRAFT_AWAITING_REVIEW,
        "{}",
        "",
        "draft text",
        "[]",
        "",
        "",
        "",
    )
    id_path = f"/api/outreach/drafts/{d['id']}"
    rec = _put(client, id_path, '{"edited":"my edited email"}')
    assert rec.status_code == 200, (rec.status_code, rec.text)
    edited = rec.json()
    assert edited["edited"] == "my edited email" and edited["lint"] == "[]"

    # Mark sent: the draft flips; the derived count is NOT bumped (M51).
    rec = _post(client, id_path + "/sent")
    assert rec.status_code == 200, (rec.status_code, rec.text)
    sent = rec.json()
    assert sent["status"] == outreach_drafts.DRAFT_SENT and sent["sent_at"] != ""
    rows = _job_rows(db_path)
    assert len(rows) == 1 and rows[0].outreach_count == 0

    # After terminal status a new draft may start.
    assert _post(client, f"/api/postings/{pid}/outreach").status_code == 202


def test_mark_sent_with_contact_logs_and_arms(tmp_path, monkeypatch):
    # Mark-sent with a contact_id logs the send (filling [Recipient]), arms the
    # follow-up, and seeds outreach_status — so a manual send is tracked like a
    # Gmail send instead of being a bare status flip.
    client, cid, db_path = new_test_app(tmp_path, monkeypatch)
    runner = FakeOutreachRunner()
    client.app.state.scout.outreach = runner
    pid = _seed_outreach_ready(db_path, cid)

    con = open_db(db_path)
    d = outreach_drafts.create_outreach_draft(con, pid)
    outreach_drafts.set_outreach_draft_result(
        con, d.id, outreach_drafts.DRAFT_AWAITING_REVIEW, "{}", "",
        "Hi [Recipient],\n\nbody.\n\nThanks,\nAlex", "[]", "", "", "",
    )
    c = contacts.create_contact(
        con, cid, ContactInput(name="Dana Lee", role="Recruiter", email="dana@acme.com")
    )
    con.close()

    r = _post(client, f"/api/outreach/drafts/{d.id}/sent", f'{{"contact_id":"{c.id}"}}')
    assert r.status_code == 200, r.text
    assert r.json()["status"] == outreach_drafts.DRAFT_SENT

    con = open_db(db_path)
    rows = con.execute(
        "SELECT contact_id, body, followup_due_at FROM outreach_log WHERE posting_id=?", (pid,)
    ).fetchall()
    status = con.execute(
        "SELECT COALESCE(outreach_status,'') FROM job_postings WHERE id=?", (pid,)
    ).fetchone()[0]
    con.close()
    assert len(rows) == 1
    assert rows[0][0] == c.id
    assert "Hi Dana," in rows[0][1]  # [Recipient] -> the contact's first name
    assert rows[0][2]  # follow-up armed
    assert status != ""  # outreach_status seeded


def test_mark_sent_without_contact_does_not_log(tmp_path, monkeypatch):
    # Back-compat: no contact_id -> a bare status flip, nothing logged.
    client, cid, db_path = new_test_app(tmp_path, monkeypatch)
    client.app.state.scout.outreach = FakeOutreachRunner()
    pid = _seed_outreach_ready(db_path, cid)
    con = open_db(db_path)
    d = outreach_drafts.create_outreach_draft(con, pid)
    outreach_drafts.set_outreach_draft_result(
        con, d.id, outreach_drafts.DRAFT_AWAITING_REVIEW, "{}", "", "body", "[]", "", "", "",
    )
    con.close()
    assert _post(client, f"/api/outreach/drafts/{d.id}/sent").status_code == 200
    con = open_db(db_path)
    n = con.execute("SELECT COUNT(*) FROM outreach_log WHERE posting_id=?", (pid,)).fetchone()[0]
    con.close()
    assert n == 0


def test_outreach_start_gates(tmp_path, monkeypatch):
    client, cid, db_path = new_test_app(tmp_path, monkeypatch)
    con = open_db(db_path)
    p = postings.add_posting(con, cid, "https://acme.com/jobs/x", "X")
    con.close()
    pid = p.id

    # No engine wired: 503.
    assert _post(client, f"/api/postings/{pid}/outreach").status_code == 503
    client.app.state.scout.outreach = FakeOutreachRunner()

    # The template always exists, so it is never a gate. With no experience: 412.
    rec = _post(client, f"/api/postings/{pid}/outreach")
    assert rec.status_code == 412, (rec.status_code, rec.text)
    assert rec.json()["need"] == "experience"

    # Experience present, no voice: 202 with voice degraded.
    con = open_db(db_path)
    upsert_outreach_source(
        con,
        OutreachSource(
            need="experience", page_id="exp1", title="Exp", content="5y Globex", version="v1"
        ),
    )
    con.close()
    rec = _post(client, f"/api/postings/{pid}/outreach")
    assert rec.status_code == 202, (rec.status_code, rec.text)
    assert "voice" in rec.json()["degraded"]


def test_outreach_sources_endpoint(tmp_path, monkeypatch):
    client, _cid, db_path = new_test_app(tmp_path, monkeypatch)
    con = open_db(db_path)
    for src in [
        OutreachSource(
            need="experience", page_id="exp1", title="Past Experience", content="x", version="v1"
        ),
        OutreachSource(need="voice", page_id="voice1", title="Voice", content="y", version="v1"),
    ]:
        upsert_outreach_source(con, src)
    con.close()

    rec = client.get("/api/outreach/sources")
    assert rec.status_code == 200
    assert len(rec.json()["sources"]) == 2


def test_outreach_end_to_end(tmp_path, monkeypatch):
    """Drive the REAL stack the way the panel does: POST start fires the async
    engine (scripted LLM: research → fill → humanize → honesty), poll the queue
    until the draft lands in review, then edit + send it."""
    client, cid, db_path = new_test_app(tmp_path, monkeypatch)
    pid = _seed_outreach_ready(db_path, cid)

    fake = FakeAnthropic(
        [
            '{"company":"Acme","what_they_do":"infra","customer":"enterprises","stage":"B","headcount_est":"80",'
            '"role":{"title":"FDE","jd_quotes":["x"]},"hooks":[{"type":"jd","quote":"x",'
            '"source_url":"https://a.invalid","context":"c"}],"thesis":"t","implication":"i",'
            '"signals_read":["s"],"disambiguation":"","confidence":"high"}',
            '{"fills":{"hook":"You ship into customer environments, like my forward-deployed work."}}',
            '{"hook":"You ship into customer environments, like my forward-deployed work."}',
            '{"verdict":"pass","violations":[]}',
            '{"depth":"deep","proof_tier":"direct","weaknesses":[],"experience_gaps":"","feedback":""}',
        ]
    )

    # An httpx client whose transport always fails — keeps the JD pre-fetch offline.
    def _offline(request):
        raise httpx.ConnectError("offline test")

    offline_http = httpx.Client(transport=httpx.MockTransport(_offline))

    with http_server(fake.handle) as base:
        ac = anthropic.Client(api_key="test-key", endpoint=base)
        client.app.state.scout.outreach = Engine(con=connect(db_path), client=ac, http=offline_http)

        rec = _post(client, f"/api/postings/{pid}/outreach")
        assert rec.status_code == 202, (rec.status_code, rec.text)

        d = None
        deadline = time.time() + 10
        while True:
            drafts = client.get(f"/api/postings/{pid}/outreach").json()["drafts"]
            assert drafts, "no drafts yet"
            d = drafts[0]
            if d["status"] != outreach_drafts.DRAFT_RESEARCHING:
                break
            assert time.time() < deadline, "draft stuck researching"
            time.sleep(0.05)

        assert d["status"] == outreach_drafts.DRAFT_AWAITING_REVIEW, (d["status"], d["fail_reason"])
        for want in [
            "You ship into customer environments",  # filled hole
            "I spent five years at Globex.",  # verbatim prose
            "Subject: [Name] | intro — FDE",  # {{role}} resolved
            "Thanks,\nAlex",
        ]:
            assert want in d["draft"], f"assembled draft missing {want!r}:\n{d['draft']}"

        # Edit, then send.
        id_path = f"/api/outreach/drafts/{d['id']}"
        assert _put(client, id_path, '{"edited":"my edited email"}').status_code == 200
        assert _post(client, id_path + "/sent").status_code == 200

    assert fake.errors == []
    rows = _job_rows(db_path)
    assert rows[0].outreach_draft_status == outreach_drafts.DRAFT_SENT


def test_outreach_needs_work_editable(tmp_path, monkeypatch):
    client, cid, db_path = new_test_app(tmp_path, monkeypatch)
    client.app.state.scout.outreach = FakeOutreachRunner()
    pid = _seed_outreach_ready(db_path, cid)

    rec = _post(client, f"/api/postings/{pid}/outreach")
    assert rec.status_code == 202, (rec.status_code, rec.text)
    did = rec.json()["draft"]["id"]

    critique = '{"depth":"medium","proof_tier":"adjacent","weaknesses":["thin hook"],"experience_gaps":"","attempts":2}'
    _set_result(
        db_path,
        did,
        outreach_drafts.DRAFT_NEEDS_WORK,
        "{}",
        "",
        "flagged draft",
        "[]",
        "",
        critique,
        "",
    )

    id_path = f"/api/outreach/drafts/{did}"
    rec = _put(client, id_path, '{"edited":"my sharper rewrite"}')
    assert rec.status_code == 200, (rec.status_code, rec.text)
    d = rec.json()
    assert d["edited"] == "my sharper rewrite" and d["critique"] == critique

    # Sendable, like any reviewable draft.
    assert _post(client, id_path + "/sent").status_code == 200
    # Sent now — locked.
    assert _put(client, id_path, '{"edited":"too late"}').status_code == 409


def test_outreach_prompts_endpoint(tmp_path, monkeypatch):
    client, _cid, _db_path = new_test_app(tmp_path, monkeypatch)

    # List: every stage present, all enabled by default, fill not skippable.
    rec = client.get("/api/outreach-prompts")
    assert rec.status_code == 200
    prompts = rec.json()["prompts"]
    assert len(prompts) == len(stages())
    for p in prompts:
        assert p["enabled"], f"stage {p['stage']} should default enabled"
        assert (p["stage"] == "fill") != p["skippable"]

    # Per-stage GET falls back to the compiled default.
    rec = client.get("/api/outreach-prompts/humanizer")
    body = rec.json()
    st = stage_by_key("humanizer")
    assert body["kind"] == "outreach-prompts/humanizer"
    assert body["content"] == st.default and not body["is_overridden"]

    # PUT an override and disable the stage.
    assert (
        _put(
            client, "/api/outreach-prompts/humanizer", '{"content":"my humanizer","enabled":false}'
        ).status_code
        == 200
    )
    body = client.get("/api/outreach-prompts/humanizer").json()
    assert body["content"] == "my humanizer" and not body["enabled"] and body["is_overridden"]

    # Reset reverts content but leaves the stage disabled.
    assert _put(client, "/api/outreach-prompts/humanizer", '{"reset":true}').status_code == 200
    body = client.get("/api/outreach-prompts/humanizer").json()
    assert body["content"] == st.default and not body["is_overridden"] and not body["enabled"]

    # The fill stage ignores a disable toggle.
    _put(client, "/api/outreach-prompts/fill", '{"content":"x","enabled":false}')
    assert client.get("/api/outreach-prompts/fill").json()["enabled"]

    # Unknown stage → 404.
    assert client.get("/api/outreach-prompts/nope").status_code == 404


def test_outreach_regenerate(tmp_path, monkeypatch):
    client, cid, db_path = new_test_app(tmp_path, monkeypatch)
    runner = FakeOutreachRunner()
    client.app.state.scout.outreach = runner
    pid = _seed_outreach_ready(db_path, cid)

    # First draft, drive it to awaiting_review.
    rec = _post(client, f"/api/postings/{pid}/outreach")
    assert rec.status_code == 202
    first_id = rec.json()["draft"]["id"]
    _set_result(
        db_path,
        first_id,
        outreach_drafts.DRAFT_AWAITING_REVIEW,
        "{}",
        "",
        "draft text",
        "[]",
        "",
        "",
        "",
    )

    # Plain re-POST conflicts; regenerate succeeds with a new researching draft.
    assert _post(client, f"/api/postings/{pid}/outreach").status_code == 409
    rec = _post(client, f"/api/postings/{pid}/outreach?regenerate=1")
    assert rec.status_code == 202, (rec.status_code, rec.text)
    regen = rec.json()["draft"]
    assert regen["id"] != first_id and regen["status"] == outreach_drafts.DRAFT_RESEARCHING
    assert runner.started == [first_id, regen["id"]]

    # History: the original is superseded, the new one researching.
    drafts = client.get(f"/api/postings/{pid}/outreach").json()["drafts"]
    assert len(drafts) == 2
    assert (
        drafts[0]["id"] == regen["id"] and drafts[0]["status"] == outreach_drafts.DRAFT_RESEARCHING
    )
    assert drafts[1]["id"] == first_id and drafts[1]["status"] == outreach_drafts.DRAFT_SUPERSEDED
    assert drafts[1]["draft"] == "draft text"


def test_outreach_skip_research_persisted(tmp_path, monkeypatch):
    client, cid, db_path = new_test_app(tmp_path, monkeypatch)
    runner = FakeOutreachRunner()
    client.app.state.scout.outreach = runner
    pid = _seed_outreach_ready(db_path, cid)

    # ?research=0 persists the skip flag on the row and passes it to the runner so
    # the panel's progress bar can drop the Research node across polls/reloads.
    rec = _post(client, f"/api/postings/{pid}/outreach?research=0")
    assert rec.status_code == 202, (rec.status_code, rec.text)
    assert rec.json()["draft"]["skip_research"] is True
    assert runner.skips == [True]
    # Survives a re-fetch (the panel polls this row, not the in-memory flag).
    drafts = client.get(f"/api/postings/{pid}/outreach").json()["drafts"]
    assert drafts[0]["skip_research"] is True


def test_outreach_cancel_running_draft(tmp_path, monkeypatch):
    client, cid, db_path = new_test_app(tmp_path, monkeypatch)
    runner = FakeOutreachRunner()
    client.app.state.scout.outreach = runner
    pid = _seed_outreach_ready(db_path, cid)

    # Start a draft; the fake runner leaves it in researching.
    rec = _post(client, f"/api/postings/{pid}/outreach")
    assert rec.status_code == 202
    did = rec.json()["draft"]["id"]
    # A second start is blocked while it's researching.
    assert _post(client, f"/api/postings/{pid}/outreach").status_code == 409

    # Cancel deletes the running draft and frees the slot.
    rec = _post(client, f"/api/outreach/drafts/{did}/cancel")
    assert rec.status_code == 200
    assert rec.json()["cancelled"] is True
    assert client.get(f"/api/postings/{pid}/outreach").json()["drafts"] == []
    # A fresh draft can now start.
    assert _post(client, f"/api/postings/{pid}/outreach").status_code == 202

    # Cancelling an already-gone draft is a no-op, not an error.
    rec = _post(client, f"/api/outreach/drafts/{did}/cancel")
    assert rec.status_code == 200 and rec.json()["cancelled"] is False


def test_outreach_delete_draft(tmp_path, monkeypatch):
    client, cid, db_path = new_test_app(tmp_path, monkeypatch)
    runner = FakeOutreachRunner()
    client.app.state.scout.outreach = runner
    pid = _seed_outreach_ready(db_path, cid)

    # Start a draft and drive it to awaiting_review, then delete it from history.
    rec = _post(client, f"/api/postings/{pid}/outreach")
    did = rec.json()["draft"]["id"]
    _set_result(
        db_path, did, outreach_drafts.DRAFT_AWAITING_REVIEW, "{}", "", "body", "[]", "", "", ""
    )
    rec = client.delete(f"/api/outreach/drafts/{did}")
    assert rec.status_code == 200 and rec.json()["deleted"] is True
    assert client.get(f"/api/postings/{pid}/outreach").json()["drafts"] == []
    # Deleting again is a no-op, not an error.
    rec = client.delete(f"/api/outreach/drafts/{did}")
    assert rec.status_code == 200 and rec.json()["deleted"] is False
