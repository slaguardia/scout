package store

import (
	"database/sql"
	"fmt"
	"strings"

	"github.com/google/uuid"
)

// companyNamespace seeds the deterministic company IDs. Stable across builds
// (derived from a fixed name), so the same identity always hashes to the same
// UUID — that's what lets the pkey double as the dedup key.
var companyNamespace = uuid.NewSHA1(uuid.NameSpaceURL, []byte("github.com/slaguardia/scout/companies"))

// Company is the minimal row used by ingest and filter.
type Company struct {
	ID           string
	Source       string
	SourceID     sql.NullString
	Name         string
	Domain       sql.NullString
	Headcount    sql.NullInt64
	FundingStage sql.NullString
	Location     sql.NullString
	Vertical     sql.NullString
	RawJSON      string
}

// CompanyID derives the deterministic primary key for a company from its
// identity: the normalized domain, or 'name:<lower(name)>' when there's no
// domain. The same company — same domain, or same name when domain-less —
// always produces the same UUID regardless of source, which is what makes the
// pkey a cross-source dedup key.
func CompanyID(domain, name string) string {
	key := strings.TrimSpace(strings.ToLower(domain))
	if key == "" {
		key = "name:" + strings.TrimSpace(strings.ToLower(name))
	}
	return uuid.NewSHA1(companyNamespace, []byte(key)).String()
}

// UpsertCompany inserts or updates a company keyed by its deterministic UUID
// (see CompanyID). A re-ingest — or the same company arriving from a different
// source — conflicts on the primary key and overwrites the row in place;
// (source, source_id) is kept only as last-writer provenance.
func (db *DB) UpsertCompany(c Company) (string, error) {
	id := CompanyID(c.Domain.String, c.Name)

	const q = `
INSERT INTO companies (id, source, source_id, name, domain, headcount, funding_stage, location, vertical, raw_json)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(id) DO UPDATE SET
    source        = excluded.source,
    source_id     = excluded.source_id,
    name          = excluded.name,
    domain        = excluded.domain,
    headcount     = excluded.headcount,
    funding_stage = excluded.funding_stage,
    location      = excluded.location,
    vertical      = excluded.vertical,
    raw_json      = excluded.raw_json,
    ingested_at   = CURRENT_TIMESTAMP;`

	if _, err := db.Exec(q,
		id, c.Source, c.SourceID, c.Name, c.Domain, c.Headcount,
		c.FundingStage, c.Location, c.Vertical, c.RawJSON,
	); err != nil {
		return "", fmt.Errorf("upsert company %q: %w", c.Name, err)
	}
	return id, nil
}

// CompanyExists reports whether a company with the given deterministic id is
// already stored. Ingest uses it to tell a fresh insert from a dedup merge
// before upserting (see CompanyID, UpsertCompany).
func (db *DB) CompanyExists(id string) (bool, error) {
	var x int
	err := db.QueryRow(`SELECT 1 FROM companies WHERE id = ?`, id).Scan(&x)
	if err == sql.ErrNoRows {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("company exists %q: %w", id, err)
	}
	return true, nil
}

// CountCompanies returns the total number of rows in the companies table.
func (db *DB) CountCompanies() (int, error) {
	var n int
	err := db.QueryRow(`SELECT COUNT(1) FROM companies`).Scan(&n)
	return n, err
}
