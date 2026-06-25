package store

import (
	"database/sql"
	"errors"
	"path/filepath"
	"testing"
)

func answersTestDB(t *testing.T) (*DB, string) {
	t.Helper()
	db, err := Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	cid, err := db.UpsertCompany(Company{Source: "test", Name: "Acme",
		Domain: sql.NullString{String: "acme.com", Valid: true}, RawJSON: "{}"})
	if err != nil {
		t.Fatalf("seed company: %v", err)
	}
	p, err := db.AddPosting(cid, "https://acme.com/jobs/se", "SE")
	if err != nil {
		t.Fatalf("seed posting: %v", err)
	}
	return db, p.ID
}

func TestUpsertDetectedQuestionsIdempotent(t *testing.T) {
	db, pid := answersTestDB(t)

	q1 := DetectedQuestion{Key: "k1", Prompt: "Why us?", MaxLength: 500}
	q2 := DetectedQuestion{Key: "", Prompt: "Tell us about a project."}
	if err := db.UpsertDetectedQuestions(pid, []DetectedQuestion{q1, q2}, "ok"); err != nil {
		t.Fatalf("upsert: %v", err)
	}

	answers, err := db.ListAnswers(pid)
	if err != nil {
		t.Fatal(err)
	}
	if len(answers) != 2 {
		t.Fatalf("want 2 answers, got %d", len(answers))
	}
	if answers[0].Status != AnswerDetected || answers[0].Prompt != "Why us?" || answers[0].MaxLength != 500 {
		t.Errorf("unexpected first answer: %+v", answers[0])
	}

	// The posting carries the detection status.
	p, _ := db.GetPosting(pid)
	if p.QuestionsStatus != "ok" {
		t.Errorf("questions_status = %q, want ok", p.QuestionsStatus)
	}

	// Edit the first answer, then re-detect with the same two plus a new one:
	// the edit survives, and only the new question is added.
	if _, err := db.EditAnswer(answers[0].ID, "my edited answer"); err != nil {
		t.Fatalf("edit: %v", err)
	}
	q3 := DetectedQuestion{Key: "k3", Prompt: "Anything else?"}
	if err := db.UpsertDetectedQuestions(pid, []DetectedQuestion{q1, q2, q3}, "ok"); err != nil {
		t.Fatalf("re-upsert: %v", err)
	}
	answers, _ = db.ListAnswers(pid)
	if len(answers) != 3 {
		t.Fatalf("after re-detect want 3, got %d", len(answers))
	}
	if answers[0].Edited != "my edited answer" {
		t.Errorf("re-detection clobbered the edit: %+v", answers[0])
	}

	// Unknown posting → ErrNoRows.
	if err := db.UpsertDetectedQuestions("nope", []DetectedQuestion{q1}, "ok"); !errors.Is(err, sql.ErrNoRows) {
		t.Errorf("unknown posting: want ErrNoRows, got %v", err)
	}
}

func TestAnswerGenerationLifecycle(t *testing.T) {
	db, pid := answersTestDB(t)
	if err := db.UpsertDetectedQuestions(pid, []DetectedQuestion{
		{Key: "k1", Prompt: "Q1"},
		{Key: "k2", Prompt: "Q2"},
	}, "ok"); err != nil {
		t.Fatal(err)
	}

	// Mark generating → both detected rows flip and come back.
	pending, err := db.MarkAnswersGenerating(pid)
	if err != nil {
		t.Fatal(err)
	}
	if len(pending) != 2 {
		t.Fatalf("want 2 pending, got %d", len(pending))
	}

	// Finish one ready, fail the other.
	if err := db.UpdateAnswer(pending[0].ID, "answer one", AnswerReady, ""); err != nil {
		t.Fatal(err)
	}
	if err := db.UpdateAnswer(pending[1].ID, "", AnswerFailed, "boom"); err != nil {
		t.Fatal(err)
	}

	// Re-mark: the ready row is NOT re-grabbed; the failed (blank) one is.
	pending, _ = db.MarkAnswersGenerating(pid)
	if len(pending) != 1 || pending[0].ID != answersByID(t, db, pid)[1].ID {
		t.Fatalf("want only the failed row re-grabbed, got %d", len(pending))
	}

	// A user edit also protects a row from re-generation.
	all := answersByID(t, db, pid)
	if _, err := db.EditAnswer(all[1].ID, "hand-written"); err != nil {
		t.Fatal(err)
	}
	if err := db.UpdateAnswer(all[1].ID, "", AnswerFailed, "boom"); err != nil {
		// edited but failed: edited != '' still guards it from re-generation
		t.Fatal(err)
	}
	pending, _ = db.MarkAnswersGenerating(pid)
	if len(pending) != 0 {
		t.Fatalf("edited rows must not regenerate, got %d pending", len(pending))
	}

	// Regenerate clears the row (answer + edit) back to generating.
	re, err := db.RegenerateAnswer(all[0].ID)
	if err != nil {
		t.Fatal(err)
	}
	if re.Status != AnswerGenerating || re.Answer != "" || re.Edited != "" {
		t.Errorf("regenerate did not clear the row: %+v", re)
	}
}

func TestDeleteAnswerComesBackOnRedetect(t *testing.T) {
	db, pid := answersTestDB(t)
	q1 := DetectedQuestion{Key: "k1", Prompt: "Why us?"}
	q2 := DetectedQuestion{Key: "k2", Prompt: "Tell us about a project."}
	if err := db.UpsertDetectedQuestions(pid, []DetectedQuestion{q1, q2}, "ok"); err != nil {
		t.Fatal(err)
	}
	all := answersByID(t, db, pid)
	if len(all) != 2 {
		t.Fatalf("want 2, got %d", len(all))
	}

	// Delete the first → it leaves the list.
	if err := db.DeleteAnswer(all[0].ID); err != nil {
		t.Fatalf("delete: %v", err)
	}
	if left := answersByID(t, db, pid); len(left) != 1 || left[0].Prompt != "Tell us about a project." {
		t.Fatalf("after delete want only Q2, got %+v", left)
	}

	// Re-detecting the same questions brings the deleted one back.
	if err := db.UpsertDetectedQuestions(pid, []DetectedQuestion{q1, q2}, "ok"); err != nil {
		t.Fatal(err)
	}
	if got := answersByID(t, db, pid); len(got) != 2 {
		t.Fatalf("re-detect did not restore the deleted question: %d rows", len(got))
	}

	// Unknown id → ErrNoRows.
	if err := db.DeleteAnswer(999999); !errors.Is(err, sql.ErrNoRows) {
		t.Errorf("delete unknown: want ErrNoRows, got %v", err)
	}
}

func TestReapStuckAnswers(t *testing.T) {
	db, pid := answersTestDB(t)
	if err := db.UpsertDetectedQuestions(pid, []DetectedQuestion{{Key: "k", Prompt: "Q"}}, "ok"); err != nil {
		t.Fatal(err)
	}
	if _, err := db.MarkAnswersGenerating(pid); err != nil {
		t.Fatal(err)
	}
	n, err := db.ReapStuckAnswers(0)
	if err != nil {
		t.Fatal(err)
	}
	if n != 1 {
		t.Fatalf("reaped %d, want 1", n)
	}
	a := answersByID(t, db, pid)[0]
	if a.Status != AnswerFailed {
		t.Errorf("status = %q, want failed", a.Status)
	}
}

func answersByID(t *testing.T, db *DB, pid string) []PostingAnswer {
	t.Helper()
	a, err := db.ListAnswers(pid)
	if err != nil {
		t.Fatal(err)
	}
	return a
}
