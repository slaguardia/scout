"""Tests for scout.store.posting_answers."""

import pytest

from scout.store import errors, posting_answers, postings
from scout.store.companies import Company, upsert_company
from scout.store.posting_answers import (
    ANSWER_DETECTED,
    ANSWER_FAILED,
    ANSWER_GENERATING,
    ANSWER_READY,
    DetectedQuestion,
)


def _seed(db):
    cid = upsert_company(db, Company(source="test", name="Acme", domain="acme.com", raw_json="{}"))
    p = postings.add_posting(db, cid, "https://acme.com/jobs/se", "SE")
    return p.id


def test_upsert_detected_questions_idempotent(db):
    pid = _seed(db)

    q1 = DetectedQuestion(key="k1", prompt="Why us?", max_length=500)
    q2 = DetectedQuestion(key="", prompt="Tell us about a project.")
    posting_answers.upsert_detected_questions(db, pid, [q1, q2], "ok")

    answers = posting_answers.list_answers(db, pid)
    assert len(answers) == 2
    assert (
        answers[0].status == ANSWER_DETECTED
        and answers[0].prompt == "Why us?"
        and answers[0].max_length == 500
    )

    p = postings.get_posting(db, pid)
    assert p.questions_status == "ok"

    posting_answers.edit_answer(db, answers[0].id, "my edited answer")
    q3 = DetectedQuestion(key="k3", prompt="Anything else?")
    posting_answers.upsert_detected_questions(db, pid, [q1, q2, q3], "ok")
    answers = posting_answers.list_answers(db, pid)
    assert len(answers) == 3
    assert answers[0].edited == "my edited answer"

    with pytest.raises(errors.NotFound):
        posting_answers.upsert_detected_questions(db, "nope", [q1], "ok")


def test_answer_generation_lifecycle(db):
    pid = _seed(db)
    posting_answers.upsert_detected_questions(
        db,
        pid,
        [
            DetectedQuestion(key="k1", prompt="Q1"),
            DetectedQuestion(key="k2", prompt="Q2"),
        ],
        "ok",
    )

    pending = posting_answers.mark_answers_generating(db, pid)
    assert len(pending) == 2

    posting_answers.update_answer(db, pending[0].id, "answer one", ANSWER_READY, "")
    posting_answers.update_answer(db, pending[1].id, "", ANSWER_FAILED, "boom")

    pending = posting_answers.mark_answers_generating(db, pid)
    assert len(pending) == 1 and pending[0].id == posting_answers.list_answers(db, pid)[1].id

    all_a = posting_answers.list_answers(db, pid)
    posting_answers.edit_answer(db, all_a[1].id, "hand-written")
    posting_answers.update_answer(db, all_a[1].id, "", ANSWER_FAILED, "boom")
    pending = posting_answers.mark_answers_generating(db, pid)
    assert len(pending) == 0

    re = posting_answers.regenerate_answer(db, all_a[0].id)
    assert re.status == ANSWER_GENERATING and re.answer == "" and re.edited == ""


def test_delete_answer_comes_back_on_redetect(db):
    pid = _seed(db)
    q1 = DetectedQuestion(key="k1", prompt="Why us?")
    q2 = DetectedQuestion(key="k2", prompt="Tell us about a project.")
    posting_answers.upsert_detected_questions(db, pid, [q1, q2], "ok")
    all_a = posting_answers.list_answers(db, pid)
    assert len(all_a) == 2

    posting_answers.delete_answer(db, all_a[0].id)
    left = posting_answers.list_answers(db, pid)
    assert len(left) == 1 and left[0].prompt == "Tell us about a project."

    posting_answers.upsert_detected_questions(db, pid, [q1, q2], "ok")
    assert len(posting_answers.list_answers(db, pid)) == 2

    with pytest.raises(errors.NotFound):
        posting_answers.delete_answer(db, 999999)


def test_reap_stuck_answers(db):
    pid = _seed(db)
    posting_answers.upsert_detected_questions(
        db, pid, [DetectedQuestion(key="k", prompt="Q")], "ok"
    )
    posting_answers.mark_answers_generating(db, pid)
    n = posting_answers.reap_stuck_answers(db, 0)
    assert n == 1
    a = posting_answers.list_answers(db, pid)[0]
    assert a.status == ANSWER_FAILED
