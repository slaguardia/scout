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
	return id, db.UpsertCompanyWithID(id, c)
}

// UpsertCompanyWithID upserts a company under an already-computed deterministic
// id (see CompanyID). Ingest computes the id once — to check existence and to
// drive cross-source dedup — and passes it straight through, so neither the
// hash nor the existence lookup is repeated per row.
func (db *DB) UpsertCompanyWithID(id string, c Company) error {
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
		return fmt.Errorf("upsert company %q: %w", c.Name, err)
	}
	return nil
}

// MergeCompany collapses a domain-less company (keyed by name, oldID) into the
// domain-keyed company (newID) that later arrived for the same identity. It
// re-points every child row from oldID to newID and deletes the old parent — in
// one transaction so a crash never strands children or orphans them past the
// ON DELETE CASCADE. Children move BEFORE the delete for the same reason.
// Caller guarantees newID already exists (upserted) and has no children yet, so
// the PK-on-company_id tables (enrichment, verdicts) can't conflict.
func (db *DB) MergeCompany(oldID, newID string) error {
	tx, err := db.Begin()
	if err != nil {
		return fmt.Errorf("merge %s→%s: begin: %w", oldID, newID, err)
	}
	defer tx.Rollback()

	for _, table := range []string{"enrichment", "verdicts", "verdict_trace", "job_postings"} {
		if _, err := tx.Exec(
			`UPDATE `+table+` SET company_id = ? WHERE company_id = ?`, newID, oldID,
		); err != nil {
			return fmt.Errorf("merge %s→%s: repoint %s: %w", oldID, newID, table, err)
		}
	}
	if _, err := tx.Exec(`DELETE FROM companies WHERE id = ?`, oldID); err != nil {
		return fmt.Errorf("merge %s→%s: delete old parent: %w", oldID, newID, err)
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("merge %s→%s: commit: %w", oldID, newID, err)
	}
	return nil
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
