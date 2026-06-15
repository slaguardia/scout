package store

import (
	"database/sql"
	"errors"
	"testing"
)

// seedPosting creates a company + one posting and returns the posting id.
func seedPosting(t *testing.T, db *DB) string {
	t.Helper()
	cid, err := db.UpsertCompany(Company{Source: "test", Name: "Acme", Domain: sql.NullString{String: "acme.com", Valid: true}, RawJSON: "{}"})
	if err != nil {
		t.Fatalf("upsert company: %v", err)
	}
	p, err := db.AddPosting(cid, "https://acme.com/jobs/se", "Solutions Engineer")
	if err != nil {
		t.Fatalf("add posting: %v", err)
	}
	return p.ID
}

func TestParseAndCurrentStage(t *testing.T) {
	if CurrentStage("") != "" {
		t.Error("empty history should have no current stage")
	}
	if CurrentStage("not json") != "" {
		t.Error("garbage history should parse to no stage")
	}
	h := `[{"stage":"applied","date":"2026-05-22"},{"stage":"interview","date":"2026-06-10"}]`
	ev := ParseStageHistory(h)
	if len(ev) != 2 || ev[0].Stage != "applied" || ev[1].Date != "2026-06-10" {
		t.Fatalf("parse = %+v", ev)
	}
	if CurrentStage(h) != "interview" {
		t.Fatalf("current = %q, want interview", CurrentStage(h))
	}
	// Blank-stage entries are dropped.
	if ev := ParseStageHistory(`[{"stage":"","date":"x"},{"stage":"applied","date":"y"}]`); len(ev) != 1 || ev[0].Stage != "applied" {
		t.Fatalf("blank-stage not dropped: %+v", ev)
	}
}

func TestAppendStageEvent(t *testing.T) {
	db := openTestDB(t)
	pid := seedPosting(t, db)

	// Append with an explicit date.
	p, err := db.AppendStageEvent(pid, "applied", "2026-05-22")
	if err != nil {
		t.Fatalf("append applied: %v", err)
	}
	if CurrentStage(p.StageHistory) != "applied" {
		t.Fatalf("current = %q after first append", CurrentStage(p.StageHistory))
	}

	// Append again advances the current stage; history is preserved.
	p, err = db.AppendStageEvent(pid, "interview", "")
	if err != nil {
		t.Fatalf("append interview: %v", err)
	}
	ev := ParseStageHistory(p.StageHistory)
	if len(ev) != 2 || ev[0].Stage != "applied" || ev[1].Stage != "interview" {
		t.Fatalf("history not preserved/advanced: %+v", ev)
	}
	if ev[1].Date == "" {
		t.Error("blank date should default to today, not stay empty")
	}

	// Validation: empty stage, bad date, unknown posting.
	if _, err := db.AppendStageEvent(pid, "  ", ""); err == nil {
		t.Error("empty stage should be rejected")
	}
	if _, err := db.AppendStageEvent(pid, "offer", "not-a-date"); err == nil {
		t.Error("bad date should be rejected")
	}
	if _, err := db.AppendStageEvent("nope", "applied", ""); !errors.Is(err, sql.ErrNoRows) {
		t.Errorf("unknown posting: want ErrNoRows, got %v", err)
	}
}

// Marking a draft sent bumps the count/date but leaves the (manual) outreach
// status untouched.
func TestMarkOutreachDraftSentLeavesStatus(t *testing.T) {
	db := openTestDB(t)
	pid := seedPosting(t, db)
	if _, err := db.UpdatePostingTracking(pid, PostingTracking{OutreachStatus: "initial contact"}); err != nil {
		t.Fatalf("set status: %v", err)
	}
	d, err := db.CreateOutreachDraft(pid)
	if err != nil {
		t.Fatalf("create draft: %v", err)
	}
	if _, err := db.MarkOutreachDraftSent(d.ID); err != nil {
		t.Fatalf("mark sent: %v", err)
	}
	p, _ := db.GetPosting(pid)
	if p.OutreachStatus != "initial contact" {
		t.Fatalf("mark-sent changed the status to %q (should stay manual)", p.OutreachStatus)
	}
	if p.OutreachCount != 1 || p.LastOutreachAt == "" {
		t.Fatalf("tracking not bumped: count=%d last=%q", p.OutreachCount, p.LastOutreachAt)
	}
}

// TestStageHistoryBackfillSQL exercises the exact backfill logic from migration
// 0050 against a replica of the pre-migration shape (applied_at + response),
// since openTestDB runs all migrations on an empty table.
func TestStageHistoryBackfillSQL(t *testing.T) {
	db := openTestDB(t)
	if _, err := db.Exec(`CREATE TABLE tt (id TEXT, applied_at TEXT, response TEXT, created_at TEXT, stage_history TEXT)`); err != nil {
		t.Fatalf("create tt: %v", err)
	}
	rows := []struct{ id, applied, response, created string }{
		{"a", "2026-05-22", "", "2026-05-01 09:00:00"},      // applied only
		{"b", "", "interview", "2026-04-15 12:00:00"},       // response only
		{"c", "2026-05-22", "offer", "2026-05-01 09:00:00"}, // both
		{"d", "", "", "2026-06-01 00:00:00"},                // neither
	}
	for _, r := range rows {
		if _, err := db.Exec(`INSERT INTO tt (id, applied_at, response, created_at) VALUES (?,?,?,?)`,
			r.id, NullString(r.applied), NullString(r.response), r.created); err != nil {
			t.Fatalf("insert %s: %v", r.id, err)
		}
	}
	const backfill = `
UPDATE tt SET stage_history = (
    SELECT json_group_array(json(j)) FROM (
        SELECT 1 AS ord, json_object('stage','applied','date',applied_at) AS j
            WHERE applied_at IS NOT NULL AND applied_at <> ''
        UNION ALL
        SELECT 2 AS ord, json_object('stage', response,
                   'date', COALESCE(NULLIF(applied_at,''), date(created_at))) AS j
            WHERE response IS NOT NULL AND response <> ''
        ORDER BY ord
    )
)
WHERE (applied_at IS NOT NULL AND applied_at <> '')
   OR (response IS NOT NULL AND response <> '');`
	if _, err := db.Exec(backfill); err != nil {
		t.Fatalf("backfill: %v", err)
	}
	get := func(id string) string {
		var s sql.NullString
		if err := db.QueryRow(`SELECT stage_history FROM tt WHERE id = ?`, id).Scan(&s); err != nil {
			t.Fatalf("get %s: %v", id, err)
		}
		return s.String
	}
	// a: applied only.
	if ev := ParseStageHistory(get("a")); len(ev) != 1 || ev[0].Stage != "applied" || ev[0].Date != "2026-05-22" {
		t.Errorf("a: %+v", ev)
	}
	// b: response only, dated to the creation date.
	if ev := ParseStageHistory(get("b")); len(ev) != 1 || ev[0].Stage != "interview" || ev[0].Date != "2026-04-15" {
		t.Errorf("b: %+v", ev)
	}
	// c: applied then response, both on the apply date, in order.
	if ev := ParseStageHistory(get("c")); len(ev) != 2 || ev[0].Stage != "applied" || ev[1].Stage != "offer" ||
		ev[0].Date != "2026-05-22" || ev[1].Date != "2026-05-22" {
		t.Errorf("c: %+v", ev)
	}
	// d: untouched (no history).
	if get("d") != "" {
		t.Errorf("d should have no history, got %q", get("d"))
	}
}
