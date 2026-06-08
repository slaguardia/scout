package store

import (
	"database/sql"
	"fmt"
	"strings"
)

// PostingAnswer statuses. detected: question found, no answer yet. generating:
// the engine is drafting. ready: drafted + honesty-passed. needs_review: drafted
// but the honesty checker flagged it (kept, not shipped silently). failed: the
// draft pass errored.
const (
	AnswerDetected    = "detected"
	AnswerGenerating  = "generating"
	AnswerReady       = "ready"
	AnswerNeedsReview = "needs_review"
	AnswerFailed      = "failed"
)

// DetectedQuestion is one essay question a capture-side resolver found on a
// posting's application form, in the shape the store ingests. It is kept
// store-local (rather than importing capture.AppQuestion) so the store never
// imports capture — capture imports the store, and the reverse would cycle.
type DetectedQuestion struct {
	Key       string // ATS field id/path; "" when unknown
	Prompt    string // the question text shown to the applicant
	MaxLength int    // char limit when the ATS declares one; 0 = unknown
}

// PostingAnswer is one application-form question plus its drafted answer. The
// display value is Edited when non-empty, else Answer (mirrors outreach's
// draft/edited split).
type PostingAnswer struct {
	ID         int64  `json:"id"`
	PostingID  string `json:"posting_id"`
	QKey       string `json:"q_key"`
	Prompt     string `json:"prompt"`
	MaxLength  int    `json:"max_length"`
	Answer     string `json:"answer"`
	Edited     string `json:"edited"`
	Status     string `json:"status"`
	FailReason string `json:"fail_reason"`
	CreatedAt  string `json:"created_at"`
	UpdatedAt  string `json:"updated_at"`
}

const answerCols = `id, posting_id, q_key, prompt, max_length, answer, edited,
status, fail_reason, created_at, updated_at`

func scanAnswer(row interface{ Scan(...any) error }) (PostingAnswer, error) {
	var a PostingAnswer
	err := row.Scan(&a.ID, &a.PostingID, &a.QKey, &a.Prompt, &a.MaxLength,
		&a.Answer, &a.Edited, &a.Status, &a.FailReason, &a.CreatedAt, &a.UpdatedAt)
	return a, err
}

// UpsertDetectedQuestions records a detection pass: it inserts any newly-found
// questions and stamps the posting's questions_status/questions_at — without
// ever touching an existing question's answer/edited/status. That "insert new,
// leave existing untouched" upsert (on the UNIQUE(posting_id, q_key, prompt)
// index) is what makes re-detection safe to run repeatedly. An empty qs with a
// non-"ok" status (none/unsupported/fetch error) just records the status.
// Returns sql.ErrNoRows when the posting doesn't exist.
func (db *DB) UpsertDetectedQuestions(postingID string, qs []DetectedQuestion, status string) error {
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	var exists int
	if err := tx.QueryRow(`SELECT COUNT(1) FROM job_postings WHERE id = ?`, postingID).Scan(&exists); err != nil {
		return err
	}
	if exists == 0 {
		return sql.ErrNoRows
	}

	for _, q := range qs {
		prompt := strings.TrimSpace(q.Prompt)
		if prompt == "" {
			continue // a question with no prompt is not answerable — skip it
		}
		ml := q.MaxLength
		if ml < 0 {
			ml = 0
		}
		if _, err := tx.Exec(
			`INSERT INTO posting_answers (posting_id, q_key, prompt, max_length)
			 VALUES (?, ?, ?, ?)
			 ON CONFLICT(posting_id, q_key, prompt) DO NOTHING`,
			postingID, strings.TrimSpace(q.Key), prompt, ml); err != nil {
			return fmt.Errorf("insert detected question: %w", err)
		}
	}

	if _, err := tx.Exec(
		`UPDATE job_postings SET questions_status = ?, questions_at = CURRENT_TIMESTAMP WHERE id = ?`,
		status, postingID); err != nil {
		return fmt.Errorf("set questions_status: %w", err)
	}
	return tx.Commit()
}

// ListAnswers returns a posting's questions+answers in form order (oldest id
// first). Returns an empty (non-nil) slice when there are none.
func (db *DB) ListAnswers(postingID string) ([]PostingAnswer, error) {
	rows, err := db.Query(`SELECT `+answerCols+` FROM posting_answers
WHERE posting_id = ? ORDER BY id ASC`, postingID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []PostingAnswer{}
	for rows.Next() {
		a, err := scanAnswer(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

// GetAnswer returns one answer row, or (nil, nil) when absent.
func (db *DB) GetAnswer(id int64) (*PostingAnswer, error) {
	a, err := scanAnswer(db.QueryRow(`SELECT `+answerCols+` FROM posting_answers WHERE id = ?`, id))
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &a, nil
}

// MarkAnswersGenerating flips every not-yet-answered question on the posting
// (no generated answer, no user edit, status detected/failed) to `generating`
// and returns the full set now in flight — including any rows left in
// `generating` by an interrupted run, so a re-run resumes them. The caller (the
// generation engine) drafts each returned row.
func (db *DB) MarkAnswersGenerating(postingID string) ([]PostingAnswer, error) {
	if _, err := db.Exec(`UPDATE posting_answers SET status = ?, fail_reason = '', updated_at = CURRENT_TIMESTAMP
WHERE posting_id = ? AND edited = '' AND answer = '' AND status IN (?, ?)`,
		AnswerGenerating, postingID, AnswerDetected, AnswerFailed); err != nil {
		return nil, err
	}
	rows, err := db.Query(`SELECT `+answerCols+` FROM posting_answers
WHERE posting_id = ? AND status = ? ORDER BY id ASC`, postingID, AnswerGenerating)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []PostingAnswer{}
	for rows.Next() {
		a, err := scanAnswer(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

// UpdateAnswer records a generation outcome for one question: the answer text
// plus the new status (ready/needs_review/failed) and any fail reason.
func (db *DB) UpdateAnswer(id int64, answer, status, failReason string) error {
	res, err := db.Exec(`UPDATE posting_answers SET answer = ?, status = ?, fail_reason = ?, updated_at = CURRENT_TIMESTAMP
WHERE id = ?`, answer, status, failReason, id)
	if err != nil {
		return err
	}
	return mustAffect(res)
}

// EditAnswer stores the user's inline edit (wins over the generated answer) and
// returns the refreshed row. An empty string clears the edit, reverting the
// display to the generated answer.
func (db *DB) EditAnswer(id int64, edited string) (PostingAnswer, error) {
	res, err := db.Exec(`UPDATE posting_answers SET edited = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, edited, id)
	if err != nil {
		return PostingAnswer{}, err
	}
	if err := mustAffect(res); err != nil {
		return PostingAnswer{}, err
	}
	return scanAnswer(db.QueryRow(`SELECT `+answerCols+` FROM posting_answers WHERE id = ?`, id))
}

// RegenerateAnswer clears one question for a fresh single-question draft: it
// drops the generated answer AND the user's edit and flips the row to
// `generating`, returning it so the engine can redraft just this one. The edit
// is intentionally discarded — clicking Regenerate is a request for a new
// answer, the per-question equivalent of outreach's "Draft again".
func (db *DB) RegenerateAnswer(id int64) (PostingAnswer, error) {
	res, err := db.Exec(`UPDATE posting_answers SET answer = '', edited = '', fail_reason = '', status = ?, updated_at = CURRENT_TIMESTAMP
WHERE id = ?`, AnswerGenerating, id)
	if err != nil {
		return PostingAnswer{}, err
	}
	if err := mustAffect(res); err != nil {
		return PostingAnswer{}, err
	}
	return scanAnswer(db.QueryRow(`SELECT `+answerCols+` FROM posting_answers WHERE id = ?`, id))
}

// ReapStuckAnswers fails any answer stuck in `generating` longer than
// olderThanMinutes (0 = all). A row only stays generating while a goroutine is
// live; after a restart it is orphaned and the panel polls it forever. Called
// at serve startup, mirroring ReapStuckOutreachDrafts.
func (db *DB) ReapStuckAnswers(olderThanMinutes int) (int64, error) {
	res, err := db.Exec(`UPDATE posting_answers SET
status = ?, fail_reason = 'interrupted — scout restarted mid-run', updated_at = CURRENT_TIMESTAMP
WHERE status = ? AND updated_at <= datetime('now', ?)`,
		AnswerFailed, AnswerGenerating, fmt.Sprintf("-%d minutes", olderThanMinutes))
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}
