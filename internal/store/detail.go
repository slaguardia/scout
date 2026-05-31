package store

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
)

// CompanyDetail is the payload for GET /api/companies/:id.
// Fields are flattened and JSON-tagged for direct serialization.
type CompanyDetail struct {
	CompanyID    string            `json:"company_id"`
	Name         string            `json:"name"`
	Source       string            `json:"source"`
	SourceID     string            `json:"source_id"`
	Domain       string            `json:"domain"`
	Headcount    int64             `json:"headcount"`
	FundingStage string            `json:"funding_stage"`
	Location     string            `json:"location"`
	Vertical     string            `json:"vertical"`
	IngestedAt   string            `json:"ingested_at"`
	RawJSON      map[string]string `json:"raw_json"`

	HasVerdict   bool   `json:"has_verdict"`
	Verdict      string `json:"verdict"`
	Reason       string `json:"reason"`
	TasteVersion string `json:"taste_version"`
	Model        string `json:"model"`
	ScoredAt     string `json:"scored_at"`

	HasEnrichment  bool   `json:"has_enrichment"`
	WebsiteURL     string `json:"website_url"`
	WebsiteSummary string `json:"website_summary"`
	FetchStatus    string `json:"fetch_status"`
	FetchError     string `json:"fetch_error"`
	FetchedAt      string `json:"fetched_at"`

	Postings []Posting `json:"postings"`
}

// GetCompanyDetail returns the full joined detail for one company.
// Returns nil, nil if not found.
func (db *DB) GetCompanyDetail(companyID string) (*CompanyDetail, error) {
	const q = `
SELECT c.id, c.name, c.source, COALESCE(c.source_id, ''),
       COALESCE(c.domain, ''), COALESCE(c.headcount, 0),
       COALESCE(c.funding_stage, ''), COALESCE(c.location, ''),
       COALESCE(c.vertical, ''), c.ingested_at, c.raw_json,
       v.verdict, v.reason, v.taste_version, v.model, v.scored_at,
       e.website_url, e.website_summary, e.fetch_status, e.fetch_error, e.fetched_at
FROM companies c
LEFT JOIN verdicts   v ON v.company_id = c.id
LEFT JOIN enrichment e ON e.company_id = c.id
WHERE c.id = ?`

	var d CompanyDetail
	var rawJSON string
	var verdict, reason, tasteVersion, model, scoredAt sql.NullString
	var websiteURL, websiteSummary, fetchStatus, fetchError, fetchedAt sql.NullString

	err := db.QueryRow(q, companyID).Scan(
		&d.CompanyID, &d.Name, &d.Source, &d.SourceID,
		&d.Domain, &d.Headcount, &d.FundingStage, &d.Location, &d.Vertical,
		&d.IngestedAt, &rawJSON,
		&verdict, &reason, &tasteVersion, &model, &scoredAt,
		&websiteURL, &websiteSummary, &fetchStatus, &fetchError, &fetchedAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	d.RawJSON = parseRawJSON(rawJSON)
	if verdict.Valid {
		d.HasVerdict = true
		d.Verdict = verdict.String
		d.Reason = reason.String
		d.TasteVersion = tasteVersion.String
		d.Model = model.String
		d.ScoredAt = scoredAt.String
	}
	if websiteURL.Valid || websiteSummary.Valid || fetchStatus.Valid {
		d.HasEnrichment = true
		d.WebsiteURL = websiteURL.String
		d.WebsiteSummary = websiteSummary.String
		d.FetchStatus = fetchStatus.String
		d.FetchError = fetchError.String
		d.FetchedAt = fetchedAt.String
	}

	// Postings are one-to-many, so they ride a second query rather than the
	// join above. A failure here shouldn't sink the whole detail payload, but
	// log it so a real DB error isn't silently masked by an empty slice.
	if postings, err := db.ListPostings(companyID); err == nil {
		d.Postings = postings
	} else {
		fmt.Fprintf(os.Stderr, "list postings %s: %v\n", companyID, err)
		d.Postings = []Posting{}
	}

	return &d, nil
}

// parseRawJSON turns the stored raw_json column (an object of header->value)
// into a map. We tolerate any shape on disk — if it doesn't parse cleanly,
// the caller gets an empty map.
func parseRawJSON(s string) map[string]string {
	out := map[string]string{}
	if s == "" {
		return out
	}
	// Try object-of-strings first (the ingest shape).
	var m1 map[string]string
	if err := json.Unmarshal([]byte(s), &m1); err == nil {
		return m1
	}
	// Fallback: any object, stringify values.
	var m2 map[string]any
	if err := json.Unmarshal([]byte(s), &m2); err == nil {
		for k, v := range m2 {
			out[k] = fmt.Sprintf("%v", v)
		}
	}
	return out
}

// Stats is the payload for GET /api/stats.
type Stats struct {
	TotalCompanies    int            `json:"total_companies"`
	EnrichedOK        int            `json:"enriched_ok"`
	Scored            int            `json:"scored"`
	Unscored          int            `json:"unscored"`
	ByVerdict         map[string]int `json:"by_verdict"`
	FetchStatus       map[string]int `json:"fetch_status"`
	CurrentTaste      string         `json:"current_taste"`       // version hash, e.g. "b4cd783174d6"
	TasteSource       string         `json:"taste_source"`        // "file:taste.md" or "brainbot:<url>" or "" if unknown
	StaleVerdicts     int            `json:"stale_verdicts"`      // verdicts whose taste_version != CurrentTaste
	TasteVersionsSeen []string       `json:"taste_versions_seen"` // distinct taste_versions present in verdicts
}

// GetStats computes the sidebar payload. currentTasteVersion may be empty
// (e.g. taste.md unreadable at serve start); when empty, StaleVerdicts is 0.
func (db *DB) GetStats(currentTasteVersion, currentTasteSource string) (*Stats, error) {
	s := &Stats{
		ByVerdict:    map[string]int{},
		FetchStatus:  map[string]int{},
		CurrentTaste: currentTasteVersion,
		TasteSource:  currentTasteSource,
	}

	if err := db.QueryRow(`SELECT COUNT(1) FROM companies`).Scan(&s.TotalCompanies); err != nil {
		return nil, err
	}
	if err := db.QueryRow(`SELECT COUNT(1) FROM enrichment WHERE fetch_status = 'ok'`).Scan(&s.EnrichedOK); err != nil {
		return nil, err
	}
	if err := db.QueryRow(`SELECT COUNT(1) FROM verdicts`).Scan(&s.Scored); err != nil {
		return nil, err
	}
	s.Unscored = s.TotalCompanies - s.Scored
	if s.Unscored < 0 {
		s.Unscored = 0
	}

	if err := scanHist(db, `SELECT verdict, COUNT(1) FROM verdicts GROUP BY verdict`, s.ByVerdict); err != nil {
		return nil, err
	}
	if err := scanHist(db, `SELECT fetch_status, COUNT(1) FROM enrichment GROUP BY fetch_status`, s.FetchStatus); err != nil {
		return nil, err
	}

	rows, err := db.Query(`SELECT DISTINCT taste_version FROM verdicts ORDER BY taste_version`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var v string
		if err := rows.Scan(&v); err != nil {
			return nil, err
		}
		s.TasteVersionsSeen = append(s.TasteVersionsSeen, v)
		if currentTasteVersion != "" && v != currentTasteVersion {
			// Count stale below in a single query for accuracy; we'll overwrite.
		}
	}
	if currentTasteVersion != "" {
		if err := db.QueryRow(
			`SELECT COUNT(1) FROM verdicts WHERE taste_version != ?`,
			currentTasteVersion,
		).Scan(&s.StaleVerdicts); err != nil {
			return nil, err
		}
	}

	return s, nil
}

func scanHist(db *DB, q string, dst map[string]int) error {
	rows, err := db.Query(q)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var k string
		var n int
		if err := rows.Scan(&k, &n); err != nil {
			return err
		}
		dst[k] = n
	}
	return rows.Err()
}

// GetCompanyName looks up name + domain by ID. Used by the brain proxy route.
func (db *DB) GetCompanyName(companyID string) (name, domain string, err error) {
	err = db.QueryRow(
		`SELECT name, COALESCE(domain, '') FROM companies WHERE id = ?`,
		companyID,
	).Scan(&name, &domain)
	if err == sql.ErrNoRows {
		return "", "", sql.ErrNoRows
	}
	return name, domain, err
}
