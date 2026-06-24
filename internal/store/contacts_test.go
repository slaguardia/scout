package store

import (
	"database/sql"
	"errors"
	"testing"
	"time"
)

func TestContactsAndOutreachLog(t *testing.T) {
	db := openTestDB(t)
	cid, err := db.UpsertCompany(Company{Source: "test", Name: "Acme", Domain: sql.NullString{String: "acme.com", Valid: true}, RawJSON: "{}"})
	if err != nil {
		t.Fatalf("upsert company: %v", err)
	}
	p, err := db.AddPosting(cid, "https://acme.com/jobs/se", "SE")
	if err != nil {
		t.Fatalf("AddPosting: %v", err)
	}

	jobRow := func() JobRow {
		rows, err := db.ListJobRows()
		if err != nil || len(rows) != 1 {
			t.Fatalf("ListJobRows: n=%d err=%v", len(rows), err)
		}
		return rows[0]
	}

	// Email is lowercased and unique per company; a name or email is required.
	jane, err := db.CreateContact(cid, ContactInput{Name: "Jane", Role: "Recruiter", Email: "Jane@Acme.com"})
	if err != nil {
		t.Fatalf("CreateContact: %v", err)
	}
	if jane.Email != "jane@acme.com" {
		t.Errorf("email not lowercased: %q", jane.Email)
	}
	if _, err := db.CreateContact(cid, ContactInput{}); err == nil {
		t.Error("empty contact should be rejected")
	}
	if _, err := db.CreateContact(cid, ContactInput{Email: "jane@acme.com"}); !errors.Is(err, ErrDuplicateContact) {
		t.Errorf("dup email: want ErrDuplicateContact, got %v", err)
	}
	bob, err := db.CreateContact(cid, ContactInput{Name: "Bob", Email: "bob@acme.com"})
	if err != nil {
		t.Fatalf("CreateContact bob: %v", err)
	}
	if cs, err := db.ListContacts(cid); err != nil || len(cs) != 2 {
		t.Fatalf("ListContacts: n=%d err=%v", len(cs), err)
	}

	// Dates relative to now so the test is robust to the system clock.
	past := time.Now().AddDate(0, 0, -10).Format("2006-01-02")

	// Log a send to Jane with an overdue follow-up; log to Bob auto-armed (future).
	e1, err := db.LogOutreach(p.ID, jane.ID, OutreachInput{SentAt: past, FollowupDueAt: past})
	if err != nil {
		t.Fatalf("LogOutreach jane: %v", err)
	}
	if e1.FollowupDueAt != past || e1.FollowupDoneAt != "" {
		t.Errorf("entry follow-up: %+v", e1)
	}
	if _, err := db.LogOutreach(p.ID, bob.ID, OutreachInput{}); err != nil {
		t.Fatalf("LogOutreach bob: %v", err)
	}

	// Derived count = 2; only Jane's follow-up is due (Bob's auto-arm is future).
	if r := jobRow(); r.OutreachCount != 2 {
		t.Errorf("derived count = %d, want 2", r.OutreachCount)
	}
	if r := jobRow(); r.FollowupsDue != 1 {
		t.Errorf("followups_due = %d, want 1 (Jane overdue, Bob future)", r.FollowupsDue)
	}

	// Marking Jane's follow-up done drops it from "due".
	if _, err := db.UpdateOutreachEntry(e1.ID, OutreachEntryEdit{Note: "intro sent", FollowupDueAt: past, Done: true}); err != nil {
		t.Fatalf("UpdateOutreachEntry: %v", err)
	}
	if r := jobRow(); r.FollowupsDue != 0 {
		t.Errorf("after done, followups_due = %d, want 0", r.FollowupsDue)
	}

	// A newer overdue send to Jane re-arms (supersedes the done one).
	if _, err := db.LogOutreach(p.ID, jane.ID, OutreachInput{SentAt: past, FollowupDueAt: past}); err != nil {
		t.Fatalf("re-log jane: %v", err)
	}
	if r := jobRow(); r.FollowupsDue != 1 {
		t.Errorf("after re-log, followups_due = %d, want 1", r.FollowupsDue)
	}

	// The posting's send log lists all three; delete one.
	if entries, err := db.ListOutreachForPosting(p.ID); err != nil || len(entries) != 3 {
		t.Fatalf("ListOutreachForPosting: n=%d err=%v", len(entries), err)
	}
	if err := db.DeleteOutreachEntry(e1.ID); err != nil {
		t.Fatalf("DeleteOutreachEntry: %v", err)
	}
	if entries, _ := db.ListOutreachForPosting(p.ID); len(entries) != 2 {
		t.Errorf("after delete, entries = %d, want 2", len(entries))
	}

	// Archiving Bob removes him from the active list (his log rows are kept).
	if err := db.ArchiveContact(bob.ID); err != nil {
		t.Fatalf("ArchiveContact: %v", err)
	}
	if cs, _ := db.ListContacts(cid); len(cs) != 1 {
		t.Errorf("after archive, contacts = %d, want 1", len(cs))
	}

	// An unknown / wrong-company contact can't be logged against this posting.
	if _, err := db.LogOutreach(p.ID, "no-such-contact", OutreachInput{}); err == nil {
		t.Error("LogOutreach with unknown contact should error")
	}
}

// backfillContacts is the verbatim INSERT from migration 0051 — exercised here
// against seeded legacy data (the migration itself runs on empty fresh DBs).
const backfillContacts = `INSERT OR IGNORE INTO contacts (id, company_id, name, role, email)
SELECT lower(hex(randomblob(16))), company_id, '', MIN(role), email
FROM (
    SELECT p.company_id AS company_id,
           COALESCE(json_extract(e.value, '$.position'), '') AS role,
           lower(json_extract(e.value, '$.email')) AS email
    FROM job_postings p
    JOIN json_each(CASE WHEN json_valid(p.contacts) AND json_type(p.contacts) = 'array'
                        THEN p.contacts ELSE '[]' END) e
    WHERE COALESCE(json_extract(e.value, '$.email'), '') <> ''
)
GROUP BY company_id, email`

func TestContactsBackfill(t *testing.T) {
	db := openTestDB(t)
	cid, err := db.UpsertCompany(Company{Source: "test", Name: "Acme", Domain: sql.NullString{String: "acme.com", Valid: true}, RawJSON: "{}"})
	if err != nil {
		t.Fatalf("upsert company: %v", err)
	}
	p, err := db.AddPosting(cid, "https://acme.com/jobs/se", "SE")
	if err != nil {
		t.Fatalf("AddPosting: %v", err)
	}
	p2, _ := db.AddPosting(cid, "https://acme.com/jobs/pm", "PM")

	// Migration 0051 drops job_postings.contacts after backfilling; re-add it as
	// test scaffolding to reconstruct the pre-migration state, then seed it
	// directly (a JSON-array blob with a mixed-case email + an email-less entry
	// that's skipped, and on p2 a legacy free-form string that must NOT crash).
	if _, err := db.Exec(`ALTER TABLE job_postings ADD COLUMN contacts TEXT`); err != nil {
		t.Fatalf("re-add contacts column: %v", err)
	}
	blob := `[{"position":"Recruiter","email":"R@Acme.com"},{"position":"","email":"cto@acme.com"},{"position":"no email"}]`
	if _, err := db.Exec(`UPDATE job_postings SET contacts = ? WHERE id = ?`, blob, p.ID); err != nil {
		t.Fatalf("seed contacts blob: %v", err)
	}
	if _, err := db.Exec(`UPDATE job_postings SET contacts = ? WHERE id = ?`, "jane@legacy.com, Bob", p2.ID); err != nil {
		t.Fatalf("seed legacy contacts: %v", err)
	}

	if _, err := db.Exec(backfillContacts); err != nil {
		t.Fatalf("backfill: %v", err)
	}

	cs, err := db.ListContacts(cid)
	if err != nil {
		t.Fatalf("ListContacts: %v", err)
	}
	if len(cs) != 2 {
		t.Fatalf("backfilled %d contacts, want 2 (recruiter + cto; email-less and legacy-string skipped): %+v", len(cs), cs)
	}
	byEmail := map[string]Contact{}
	for _, c := range cs {
		byEmail[c.Email] = c
	}
	if c, ok := byEmail["r@acme.com"]; !ok || c.Role != "Recruiter" {
		t.Errorf("recruiter not backfilled with lowercased email: %+v", cs)
	}
	if _, ok := byEmail["cto@acme.com"]; !ok {
		t.Errorf("cto not backfilled: %+v", cs)
	}
	// Idempotent: re-running adds nothing (INSERT OR IGNORE + unique index).
	if _, err := db.Exec(backfillContacts); err != nil {
		t.Fatalf("re-backfill: %v", err)
	}
	if cs, _ := db.ListContacts(cid); len(cs) != 2 {
		t.Errorf("backfill not idempotent: %d contacts", len(cs))
	}
}

func TestLogOutreachSeedsReplyStatus(t *testing.T) {
	db := openTestDB(t)
	cid, err := db.UpsertCompany(Company{Source: "test", Name: "Acme", Domain: sql.NullString{String: "acme.com", Valid: true}, RawJSON: "{}"})
	if err != nil {
		t.Fatalf("upsert company: %v", err)
	}
	p, err := db.AddPosting(cid, "https://acme.com/jobs/se", "SE")
	if err != nil {
		t.Fatalf("AddPosting: %v", err)
	}
	jane, err := db.CreateContact(cid, ContactInput{Email: "jane@acme.com"})
	if err != nil {
		t.Fatalf("CreateContact: %v", err)
	}

	// The first logged send seeds the reply status to the first configured label.
	if _, err := db.LogOutreach(p.ID, jane.ID, OutreachInput{}); err != nil {
		t.Fatalf("LogOutreach: %v", err)
	}
	got, err := db.readPosting(p.ID)
	if err != nil {
		t.Fatalf("readPosting: %v", err)
	}
	if got.OutreachStatus != DefaultOutreachStatuses[0] {
		t.Fatalf("reply status not seeded: got %q, want %q", got.OutreachStatus, DefaultOutreachStatuses[0])
	}

	// A hand-set status is never overwritten by a later send.
	if _, err := db.UpdatePostingTracking(p.ID, PostingTracking{OutreachStatus: "replied"}); err != nil {
		t.Fatalf("set status: %v", err)
	}
	if _, err := db.LogOutreach(p.ID, jane.ID, OutreachInput{}); err != nil {
		t.Fatalf("LogOutreach 2: %v", err)
	}
	if got, _ = db.readPosting(p.ID); got.OutreachStatus != "replied" {
		t.Errorf("hand-set status overwritten by a send: got %q", got.OutreachStatus)
	}
}

func TestFollowupAlertsGatedByStatus(t *testing.T) {
	db := openTestDB(t)
	cid, err := db.UpsertCompany(Company{Source: "test", Name: "Acme", Domain: sql.NullString{String: "acme.com", Valid: true}, RawJSON: "{}"})
	if err != nil {
		t.Fatalf("upsert company: %v", err)
	}
	p, err := db.AddPosting(cid, "https://acme.com/jobs/se", "SE")
	if err != nil {
		t.Fatalf("AddPosting: %v", err)
	}
	jane, err := db.CreateContact(cid, ContactInput{Email: "jane@acme.com"})
	if err != nil {
		t.Fatalf("CreateContact: %v", err)
	}
	due := func() int {
		rows, err := db.ListJobRows()
		if err != nil || len(rows) != 1 {
			t.Fatalf("ListJobRows: n=%d err=%v", len(rows), err)
		}
		return rows[0].FollowupsDue
	}

	// An overdue follow-up while awaiting (auto-seeded "initial contact") alerts.
	past := time.Now().AddDate(0, 0, -10).Format("2006-01-02")
	if _, err := db.LogOutreach(p.ID, jane.ID, OutreachInput{SentAt: past, FollowupDueAt: past}); err != nil {
		t.Fatalf("LogOutreach: %v", err)
	}
	if due() != 1 {
		t.Fatalf("awaiting: followups_due = %d, want 1", due())
	}

	// A reply silences the alert (status moves off the awaiting phase).
	if _, err := db.UpdatePostingTracking(p.ID, PostingTracking{OutreachStatus: "replied"}); err != nil {
		t.Fatalf("set replied: %v", err)
	}
	if due() != 0 {
		t.Errorf("after reply: followups_due = %d, want 0 (alerts silenced)", due())
	}

	// Back to the awaiting phase → the alert returns.
	if _, err := db.UpdatePostingTracking(p.ID, PostingTracking{OutreachStatus: DefaultOutreachStatuses[0]}); err != nil {
		t.Fatalf("reset status: %v", err)
	}
	if due() != 1 {
		t.Errorf("back to awaiting: followups_due = %d, want 1", due())
	}
}

func TestOutreachBodyPersists(t *testing.T) {
	db := openTestDB(t)
	cid, err := db.UpsertCompany(Company{Source: "test", Name: "Acme", Domain: sql.NullString{String: "acme.com", Valid: true}, RawJSON: "{}"})
	if err != nil {
		t.Fatalf("upsert company: %v", err)
	}
	p, err := db.AddPosting(cid, "https://acme.com/jobs/se", "SE")
	if err != nil {
		t.Fatalf("AddPosting: %v", err)
	}
	jane, err := db.CreateContact(cid, ContactInput{Email: "jane@acme.com"})
	if err != nil {
		t.Fatalf("CreateContact: %v", err)
	}

	// The sent email body is recorded and round-trips through the list.
	e, err := db.LogOutreach(p.ID, jane.ID, OutreachInput{Body: "Hi Jane, intro re SE", Note: "first touch"})
	if err != nil {
		t.Fatalf("LogOutreach: %v", err)
	}
	if e.Body != "Hi Jane, intro re SE" {
		t.Fatalf("body not stored: %q", e.Body)
	}
	if entries, _ := db.ListOutreachForPosting(p.ID); len(entries) != 1 || entries[0].Body != "Hi Jane, intro re SE" {
		t.Fatalf("body not in list: %+v", entries)
	}

	// A follow-up date edit carries the body unchanged (full-state edit).
	upd, err := db.UpdateOutreachEntry(e.ID, OutreachEntryEdit{Body: e.Body, Note: e.Note, FollowupDueAt: e.FollowupDueAt})
	if err != nil {
		t.Fatalf("UpdateOutreachEntry: %v", err)
	}
	if upd.Body != "Hi Jane, intro re SE" {
		t.Errorf("body wiped on edit: %q", upd.Body)
	}
}

func TestFollowupTemplateSingleton(t *testing.T) {
	db := openTestDB(t)
	if c, _ := db.GetFollowupTemplate(); c != "" {
		t.Errorf("fresh follow-up template should be empty (default applied by handler), got %q", c)
	}
	if err := db.PutFollowupTemplate("Hi {{contact_name}}"); err != nil {
		t.Fatalf("PutFollowupTemplate: %v", err)
	}
	// Keyed apart from the email template — neither clobbers the other.
	if err := db.PutOutreachTemplate("email body"); err != nil {
		t.Fatalf("PutOutreachTemplate: %v", err)
	}
	if c, _ := db.GetFollowupTemplate(); c != "Hi {{contact_name}}" {
		t.Errorf("follow-up template clobbered: %q", c)
	}
	if c, _ := db.GetOutreachTemplate(); c != "email body" {
		t.Errorf("email template wrong: %q", c)
	}
}
