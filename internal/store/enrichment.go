package store

import (
	"database/sql"
	"fmt"
)

// EnrichmentTarget is a company that still needs (or could refresh) enrichment.
type EnrichmentTarget struct {
	CompanyID int64
	Name      string
	Domain    string
}

// Enrichment is the cached about-page record.
type Enrichment struct {
	CompanyID      int64
	WebsiteURL     sql.NullString
	WebsiteSummary sql.NullString
	FetchStatus    string
	FetchError     sql.NullString
	FetchedAt      sql.NullString
}

// EnrichmentTargets returns companies that need enrichment. A company is considered
// "needs enrichment" if it has no enrichment row, OR companies.ingested_at is newer
// than enrichment.fetched_at (re-ingest invalidates the cache).
// If force is true, every company with a non-empty domain is returned.
func (db *DB) EnrichmentTargets(force bool) ([]EnrichmentTarget, error) {
	q := `
SELECT c.id, c.name, COALESCE(c.domain, '')
FROM companies c
LEFT JOIN enrichment e ON e.company_id = c.id
WHERE COALESCE(c.domain, '') <> ''
  AND (? OR e.company_id IS NULL OR datetime(c.ingested_at) > datetime(e.fetched_at))`
	rows, err := db.Query(q, force)
	if err != nil {
		return nil, fmt.Errorf("select enrichment targets: %w", err)
	}
	defer rows.Close()

	var out []EnrichmentTarget
	for rows.Next() {
		var t EnrichmentTarget
		if err := rows.Scan(&t.CompanyID, &t.Name, &t.Domain); err != nil {
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
		return fmt.Errorf("upsert enrichment %d: %w", e.CompanyID, err)
	}
	return nil
}

// GetEnrichment returns the cached enrichment for a company, if any.
func (db *DB) GetEnrichment(companyID int64) (*Enrichment, error) {
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
