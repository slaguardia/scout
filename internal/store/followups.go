package store

import (
	"fmt"
	"strconv"
)

// FollowUpIntervalSetting is the settings key holding the follow-up cadence in
// whole days. DefaultFollowUpIntervalDays applies when it is unset or unparseable.
const (
	FollowUpIntervalSetting     = "follow_up_interval_days"
	DefaultFollowUpIntervalDays = 7
)

// FollowUpIntervalDays returns the configured follow-up cadence in days, falling
// back to the default (7) when the setting is unset or holds a non-positive /
// unparseable value — so a corrupt row never breaks the queue.
func (db *DB) FollowUpIntervalDays() (int, error) {
	v, err := db.GetSetting(FollowUpIntervalSetting)
	if err != nil {
		return 0, err
	}
	n, perr := strconv.Atoi(v)
	if perr != nil || n < 1 {
		return DefaultFollowUpIntervalDays, nil
	}
	return n, nil
}

// SetFollowUpIntervalDays stores the follow-up cadence. days must be a positive
// integer; a non-positive value is rejected with an error prefixed "days " so
// the web layer can map it to a 400.
func (db *DB) SetFollowUpIntervalDays(days int) error {
	if days < 1 {
		return fmt.Errorf("days must be a positive integer")
	}
	return db.SetSetting(FollowUpIntervalSetting, strconv.Itoa(days))
}

// FollowUpDue is one posting overdue for a follow-up: the fields the queue view
// needs, plus DaysOverdue — whole days past the cadence due date (0 = due today,
// the boundary). It is distinct from "days since last outreach" (derivable from
// LastOutreachAt), so the view can show both the contact date and how far past
// the cadence the nudge is.
type FollowUpDue struct {
	PostingID      string `json:"posting_id"`
	CompanyID      string `json:"company_id"`
	Company        string `json:"company"`
	Title          string `json:"title"`
	URL            string `json:"url"`
	LastOutreachAt string `json:"last_outreach_at"`
	DaysOverdue    int    `json:"days_overdue"`
	Contacts       string `json:"contacts"`
}

// ListFollowUpsDue returns the postings overdue for a follow-up under the current
// cadence: outreach_status = 'awaiting', a recorded last_outreach_at at or before
// (today - interval), and no application response yet (which also excludes
// rejected — there is no separate hidden flag). Most-overdue first (oldest
// last_outreach_at), then a stable rowid tiebreak. Returns an empty (non-nil)
// slice when nothing is due, so callers serialize [] not null.
func (db *DB) ListFollowUpsDue() ([]FollowUpDue, error) {
	interval, err := db.FollowUpIntervalDays()
	if err != nil {
		return nil, err
	}
	// The threshold is date('now', '-N days'); a string comparison of two
	// 'YYYY-MM-DD' values is correct. days_since is whole days (both julianday
	// operands are midnight-aligned); DaysOverdue = days_since - interval is
	// computed in Go below so it tracks the same interval used for the gate.
	const q = `
SELECT p.id, p.company_id, c.name, COALESCE(p.title, ''), p.url,
       COALESCE(p.last_outreach_at, ''),
       CAST(julianday(date('now')) - julianday(p.last_outreach_at) AS INTEGER) AS days_since,
       COALESCE(p.contacts, '')
FROM job_postings p
JOIN companies c ON c.id = p.company_id
WHERE p.outreach_status = 'awaiting'
  AND p.last_outreach_at IS NOT NULL
  AND p.last_outreach_at <= date('now', '-' || ? || ' days')
  AND COALESCE(p.response, '') = ''
ORDER BY p.last_outreach_at ASC, p.rowid ASC`
	rows, err := db.Query(q, interval)
	if err != nil {
		return nil, fmt.Errorf("list follow-ups due: %w", err)
	}
	defer rows.Close()

	out := []FollowUpDue{}
	for rows.Next() {
		var f FollowUpDue
		var daysSince int
		if err := rows.Scan(&f.PostingID, &f.CompanyID, &f.Company, &f.Title, &f.URL,
			&f.LastOutreachAt, &daysSince, &f.Contacts); err != nil {
			return nil, err
		}
		f.DaysOverdue = daysSince - interval
		out = append(out, f)
	}
	return out, rows.Err()
}
