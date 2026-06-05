package store

import "database/sql"

// TriageRow is the joined row served by the read-only UI.
type TriageRow struct {
	CompanyID      string         `json:"company_id"`
	Name           string         `json:"name"`
	Domain         sql.NullString `json:"-"`
	DomainStr      string         `json:"domain"`
	Location       sql.NullString `json:"-"`
	LocationStr    string         `json:"location"`
	Vertical       sql.NullString `json:"-"`
	VerticalStr    string         `json:"vertical"`
	Headcount      sql.NullInt64  `json:"-"`
	HeadcountInt   int64          `json:"headcount"`
	Stage          sql.NullString `json:"-"`
	StageStr       string         `json:"stage"`
	Verdict        sql.NullString `json:"-"`
	VerdictStr     string         `json:"verdict"`
	Reason         sql.NullString `json:"-"`
	ReasonStr      string         `json:"reason"`
	WebsiteURL     sql.NullString `json:"-"`
	WebsiteURLStr  string         `json:"website_url"`
	WebsiteSummary sql.NullString `json:"-"`
	WebsiteSumStr  string         `json:"website_summary"`
	FlaggedAt      sql.NullString `json:"-"`
	Flagged        bool           `json:"flagged"` // hand-set bookmark
	ReviewedAt     sql.NullString `json:"-"`
	ReviewedAtStr  string         `json:"reviewed_at"` // last-reviewed stamp; "" = never
}

// TriageRows pulls every company joined with optional enrichment and verdict.
func (db *DB) TriageRows() ([]TriageRow, error) {
	const q = `
SELECT c.id, c.name, c.domain, c.location, c.vertical, c.headcount, c.funding_stage,
       v.verdict, v.reason,
       e.website_url, e.website_summary,
       c.flagged_at, c.reviewed_at
FROM companies c
LEFT JOIN verdicts v ON v.company_id = c.id
LEFT JOIN enrichment e ON e.company_id = c.id
ORDER BY
  CASE COALESCE(v.verdict, 'zzz')
    WHEN 'yes'   THEN 0
    WHEN 'maybe' THEN 1
    WHEN 'no'    THEN 2
    ELSE 3
  END,
  c.name`
	rows, err := db.Query(q)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []TriageRow
	for rows.Next() {
		var r TriageRow
		if err := rows.Scan(&r.CompanyID, &r.Name, &r.Domain, &r.Location, &r.Vertical, &r.Headcount, &r.Stage,
			&r.Verdict, &r.Reason, &r.WebsiteURL, &r.WebsiteSummary, &r.FlaggedAt, &r.ReviewedAt); err != nil {
			return nil, err
		}
		r.DomainStr = r.Domain.String
		r.LocationStr = r.Location.String
		r.VerticalStr = r.Vertical.String
		r.HeadcountInt = r.Headcount.Int64
		r.StageStr = r.Stage.String
		r.VerdictStr = r.Verdict.String
		r.ReasonStr = r.Reason.String
		r.WebsiteURLStr = r.WebsiteURL.String
		r.WebsiteSumStr = r.WebsiteSummary.String
		r.Flagged = r.FlaggedAt.Valid
		r.ReviewedAtStr = r.ReviewedAt.String
		out = append(out, r)
	}
	return out, rows.Err()
}
