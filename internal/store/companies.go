package store

import (
	"database/sql"
	"fmt"
)

// Company is the minimal row used by ingest and filter.
type Company struct {
	ID           int64
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

// UpsertCompany inserts or updates a company keyed by (source, source_id).
// If source_id is empty it falls back to (source, lower(name)) to dedupe.
func (db *DB) UpsertCompany(c Company) (int64, error) {
	// We use INSERT ... ON CONFLICT on (source, source_id). When source_id is empty,
	// we synthesize one from the name so the unique index still works.
	syntheticID := c.SourceID.String
	if !c.SourceID.Valid || syntheticID == "" {
		syntheticID = "name:" + c.Name
		c.SourceID = sql.NullString{String: syntheticID, Valid: true}
	}

	const q = `
INSERT INTO companies (source, source_id, name, domain, headcount, funding_stage, location, vertical, raw_json)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(source, source_id) DO UPDATE SET
    name          = excluded.name,
    domain        = excluded.domain,
    headcount     = excluded.headcount,
    funding_stage = excluded.funding_stage,
    location      = excluded.location,
    vertical      = excluded.vertical,
    raw_json      = excluded.raw_json,
    ingested_at   = CURRENT_TIMESTAMP
RETURNING id;`

	var id int64
	err := db.QueryRow(q,
		c.Source, c.SourceID, c.Name, c.Domain, c.Headcount,
		c.FundingStage, c.Location, c.Vertical, c.RawJSON,
	).Scan(&id)
	if err != nil {
		return 0, fmt.Errorf("upsert company %q: %w", c.Name, err)
	}

	// Ensure a status row exists. Idempotent.
	if _, err := db.Exec(`INSERT OR IGNORE INTO status (company_id, state) VALUES (?, 'new')`, id); err != nil {
		return 0, fmt.Errorf("seed status for %q: %w", c.Name, err)
	}
	return id, nil
}

// CountCompanies returns the total number of rows in the companies table.
func (db *DB) CountCompanies() (int, error) {
	var n int
	err := db.QueryRow(`SELECT COUNT(1) FROM companies`).Scan(&n)
	return n, err
}
