package store

import (
	"database/sql"
	"fmt"
	"strings"
)

// EnrichmentTarget is a company that still needs (or could refresh) enrichment.
// The fact columns ride along so the fact-extraction pass can see which fields
// are still blank without a second query per company.
type EnrichmentTarget struct {
	CompanyID    string
	Name         string
	Domain       string
	Headcount    int64 // 0 = unknown
	FundingStage string
	Location     string
	Vertical     string
}

// Enrichment is the cached about-page record.
type Enrichment struct {
	CompanyID      string
	WebsiteURL     sql.NullString
	WebsiteSummary sql.NullString
	FetchStatus    string
	FetchError     sql.NullString
	FetchedAt      sql.NullString
}

// EnrichmentTargets returns companies that need enrichment. A company is considered
// "needs enrichment" if it has no enrichment row, OR companies.ingested_at is newer
// than enrichment.fetched_at (re-ingest invalidates the cache).
// If force is true, every company with a non-empty domain is returned. If
// onlyBlanks, only companies with no enrichment row at all are returned — the
// re-ingest refresh clause is skipped. force wins over onlyBlanks.
// If companyIDs is non-empty, exactly those companies (with a domain) are
// returned regardless of freshness — a targeted run is always a re-fetch, so
// force/onlyBlanks are ignored.
func (db *DB) EnrichmentTargets(force, onlyBlanks bool, companyIDs []string) ([]EnrichmentTarget, error) {
	q := `
SELECT c.id, c.name, COALESCE(c.domain, ''),
       COALESCE(c.headcount, 0), COALESCE(c.funding_stage, ''),
       COALESCE(c.location, ''), COALESCE(c.vertical, '')
FROM companies c
LEFT JOIN enrichment e ON e.company_id = c.id
WHERE COALESCE(c.domain, '') <> ''
  AND (? OR e.company_id IS NULL OR (NOT ? AND datetime(c.ingested_at) > datetime(e.fetched_at)))`
	args := []any{force, onlyBlanks}
	if len(companyIDs) > 0 {
		ph := make([]string, len(companyIDs))
		args = []any{true, false} // targeted implies force
		for i, id := range companyIDs {
			ph[i] = "?"
			args = append(args, id)
		}
		q += "\n  AND c.id IN (" + strings.Join(ph, ",") + ")"
	}
	rows, err := db.Query(q, args...)
	if err != nil {
		return nil, fmt.Errorf("select enrichment targets: %w", err)
	}
	defer rows.Close()

	var out []EnrichmentTarget
	for rows.Next() {
		var t EnrichmentTarget
		if err := rows.Scan(&t.CompanyID, &t.Name, &t.Domain,
			&t.Headcount, &t.FundingStage, &t.Location, &t.Vertical); err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

// UpsertEnrichment inserts or replaces an enrichment row.
func (db *DB) UpsertEnrichment(e Enrichment) error {
	const q = `
INSERT INTO enrichment (company_id, website_url, website_summary, fetch_status, fetch_error, fetched_at)
VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
ON CONFLICT(company_id) DO UPDATE SET
    website_url     = excluded.website_url,
    website_summary = excluded.website_summary,
    fetch_status    = excluded.fetch_status,
    fetch_error     = excluded.fetch_error,
    fetched_at      = CURRENT_TIMESTAMP;`
	_, err := db.Exec(q, e.CompanyID, e.WebsiteURL, e.WebsiteSummary, e.FetchStatus, e.FetchError)
	if err != nil {
		return fmt.Errorf("upsert enrichment %s: %w", e.CompanyID, err)
	}
	return nil
}

// GetEnrichment returns the cached enrichment for a company, if any.
func (db *DB) GetEnrichment(companyID string) (*Enrichment, error) {
	const q = `
SELECT company_id, website_url, website_summary, fetch_status, fetch_error, fetched_at
FROM enrichment WHERE company_id = ?`
	var e Enrichment
	err := db.QueryRow(q, companyID).Scan(&e.CompanyID, &e.WebsiteURL, &e.WebsiteSummary, &e.FetchStatus, &e.FetchError, &e.FetchedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &e, nil
}

// NullString is a small helper for callers outside the store package.
func NullString(s string) sql.NullString {
	if s == "" {
		return sql.NullString{}
	}
	return sql.NullString{String: s, Valid: true}
}
