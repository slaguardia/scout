"""The application-answers web routes."""

from __future__ import annotations

from web_helpers import new_test_app, open_db

from scout.store import posting_answers, postings
from scout.store.outreach_sources import OutreachSource, upsert_outreach_source


# fakeAnswersRunner records the posting ids generation was kicked off for.
class FakeAnswersRunner:
    def __init__(self):
        self.started: list[str] = []

    def generate(self, posting_id: str) -> None:
        self.started.append(posting_id)


def _seed_answers_posting(db_path, cid) -> str:
    con = open_db(db_path)
    p = postings.add_posting(con, cid, "https://acme.com/careers/role", "Engineer")
    con.close()
    return p.id


def _seed_questions(db_path, pid, qs, status):
    con = open_db(db_path)
    posting_answers.upsert_detected_questions(con, pid, qs, status)
    con.close()


def _seed_experience(db_path):
    con = open_db(db_path)
    upsert_outreach_source(
        con,
        OutreachSource(
            need="experience", page_id="exp1", title="Exp", content="exp doc", version="v1"
        ),
    )
    con.close()


def _list_answers(db_path, pid):
    con = open_db(db_path)
    a = posting_answers.list_answers(con, pid)
    con.close()
    return a


def _json(client, method, path, body=""):
    headers = {"Content-Type": "application/json"} if body else {}
    return getattr(client, method)(path, content=body, headers=headers)


def test_answers_get_and_detect(tmp_path, monkeypatch):
    client, cid, db_path = new_test_app(tmp_path, monkeypatch)
    pid = _seed_answers_posting(db_path, cid)

    # Fresh posting: empty answers, never detected.
    rec = client.get(f"/api/postings/{pid}/answers")
    assert rec.status_code == 200, (rec.status_code, rec.text)
    got = rec.json()
    assert got["answers"] == [] and got["questions_status"] == ""

    # Seed questions and read them back.
    _seed_questions(
        db_path,
        pid,
        [
            posting_answers.DetectedQuestion(key="k1", prompt="Why us?", max_length=300),
            posting_answers.DetectedQuestion(key="k2", prompt="A project?"),
        ],
        "ok",
    )
    got = client.get(f"/api/postings/{pid}/answers").json()
    assert len(got["answers"]) == 2 and got["questions_status"] == "ok"

    # Unknown posting → 404.
    assert client.get("/api/postings/nope/answers").status_code == 404


def test_answers_generate_gate(tmp_path, monkeypatch):
    client, cid, db_path = new_test_app(tmp_path, monkeypatch)
    pid = _seed_answers_posting(db_path, cid)
    _seed_questions(
        db_path, pid, [posting_answers.DetectedQuestion(key="k1", prompt="Why us?")], "ok"
    )

    # No runner wired → 503.
    assert _json(client, "post", f"/api/postings/{pid}/answers").status_code == 503

    # Runner wired but no experience discovered → 412 + need=experience.
    runner = FakeAnswersRunner()
    client.app.state.scout.answers = runner
    rec = _json(client, "post", f"/api/postings/{pid}/answers")
    assert rec.status_code == 412, (rec.status_code, rec.text)
    assert rec.json()["need"] == "experience"

    # Seed the experience source → 202 + runner fired for the posting.
    _seed_experience(db_path)
    rec = _json(client, "post", f"/api/postings/{pid}/answers")
    assert rec.status_code == 202, (rec.status_code, rec.text)
    assert runner.started == [pid]


def test_answer_edit_and_regenerate(tmp_path, monkeypatch):
    client, cid, db_path = new_test_app(tmp_path, monkeypatch)
    pid = _seed_answers_posting(db_path, cid)
    _seed_questions(
        db_path, pid, [posting_answers.DetectedQuestion(key="k1", prompt="Why us?")], "ok"
    )
    aid = _list_answers(db_path, pid)[0].id
    id_path = f"/api/answers/{aid}"

    # Edit → 200, edited saved.
    rec = _json(client, "put", id_path, '{"edited":"hand-written answer"}')
    assert rec.status_code == 200, (rec.status_code, rec.text)
    assert rec.json()["edited"] == "hand-written answer"

    # Regenerate without a runner → 503.
    assert _json(client, "put", id_path, '{"regenerate":true}').status_code == 503

    # With a runner but no experience discovered → 412 (same honesty gate).
    runner = FakeAnswersRunner()
    client.app.state.scout.answers = runner
    assert _json(client, "put", id_path, '{"regenerate":true}').status_code == 412

    # Seed experience → 202, runner fired, row cleared to generating.
    _seed_experience(db_path)
    rec = _json(client, "put", id_path, '{"regenerate":true}')
    assert rec.status_code == 202, (rec.status_code, rec.text)
    a = rec.json()
    assert (
        a["status"] == posting_answers.ANSWER_GENERATING and a["edited"] == "" and a["answer"] == ""
    )
    assert runner.started == [pid]

    # Unknown answer id → 404.
    assert _json(client, "put", "/api/answers/99999", '{"edited":"x"}').status_code == 404


def test_answer_delete(tmp_path, monkeypatch):
    client, cid, db_path = new_test_app(tmp_path, monkeypatch)
    pid = _seed_answers_posting(db_path, cid)
    _seed_questions(
        db_path,
        pid,
        [
            posting_answers.DetectedQuestion(key="k1", prompt="Why us?"),
            posting_answers.DetectedQuestion(key="k2", prompt="A project?"),
        ],
        "ok",
    )
    aid = _list_answers(db_path, pid)[0].id
    id_path = f"/api/answers/{aid}"

    # DELETE → 204, the question leaves the list.
    assert client.delete(id_path).status_code == 204
    left = _list_answers(db_path, pid)
    assert len(left) == 1 and left[0].prompt == "A project?"

    # Unknown id → 404.
    assert client.delete("/api/answers/99999").status_code == 404


def test_answers_redetect(tmp_path, monkeypatch):
    client, cid, db_path = new_test_app(tmp_path, monkeypatch)
    pid = _seed_answers_posting(db_path, cid)  # non-ATS URL, no key

    # Redetect a non-ATS posting with no LLM key: honest "unsupported", stored.
    rec = _json(client, "post", f"/api/postings/{pid}/answers/redetect")
    assert rec.status_code == 200, (rec.status_code, rec.text)
    assert rec.json()["questions_status"] == "unsupported"

    assert _json(client, "post", "/api/postings/nope/answers/redetect").status_code == 404
