package store

import (
	"database/sql"
	"errors"
	"fmt"
	"sort"
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

// normName folds a company name to its identity form: trimmed and lowercased
// with Go's full-Unicode rules. EVERY name-identity comparison must route through
// this — CompanyID's name key, the stored name_key column, and the reverse-fold
// lookup — so accented/non-Latin names ("Évora", "İstanbul", "ΑΘΗΝΑ") fold the
// same everywhere. (SQLite's built-in lower() folds ASCII only, so name matching
// must never be done in SQL; see DomainKeyedIDsByName.)
func normName(name string) string {
	return strings.TrimSpace(strings.ToLower(name))
}

// CompanyID derives the deterministic primary key for a company from its
// identity: the normalized domain, or 'name:<lower(name)>' when there's no
// domain. The same company — same domain, or same name when domain-less —
// always produces the same UUID regardless of source, which is what makes the
// pkey a cross-source dedup key.
func CompanyID(domain, name string) string {
	key := strings.TrimSpace(strings.ToLower(domain))
	if key == "" {
		key = "name:" + normName(name)
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
	return upsertCompany(db, id, c)
}

// execer is the subset of *sql.DB / *sql.Tx the upsert needs, so the same
// statement runs standalone or inside MergeCompany's transaction.
type execer interface {
	Exec(query string, args ...any) (sql.Result, error)
}

// upsertCompany writes one company row. name_key is the Go-folded identity name
// (see normName) so the reverse-fold lookup can match on it without SQLite's
// ASCII-only lower().
func upsertCompany(x execer, id string, c Company) error {
	const q = `
INSERT INTO companies (id, source, source_id, name, name_key, domain, headcount, funding_stage, location, vertical, raw_json)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(id) DO UPDATE SET
    source        = excluded.source,
    source_id     = excluded.source_id,
    name          = excluded.name,
    name_key      = excluded.name_key,
    domain        = excluded.domain,
    headcount     = excluded.headcount,
    funding_stage = excluded.funding_stage,
    location      = excluded.location,
    vertical      = excluded.vertical,
    raw_json      = excluded.raw_json,
    ingested_at   = CURRENT_TIMESTAMP;`

	if _, err := x.Exec(q,
		id, c.Source, c.SourceID, c.Name, normName(c.Name), c.Domain, c.Headcount,
		c.FundingStage, c.Location, c.Vertical, c.RawJSON,
	); err != nil {
		return fmt.Errorf("upsert company %q: %w", c.Name, err)
	}
	return nil
}

// BackfillCompanyBlanks fills only the columns that are currently NULL/empty on
// the stored row from c's non-empty values, leaving existing data untouched.
// Used by the reverse fold: when a domain-less arrival is recognized as a
// duplicate of an existing domain-keyed company, its richer fields (a headcount
// the stored row lacked, say) are merged in rather than discarded. name/domain/
// id are identity and never changed here.
func (db *DB) BackfillCompanyBlanks(id string, c Company) error {
	const q = `
UPDATE companies SET
    headcount     = COALESCE(headcount, ?),
    funding_stage = CASE WHEN funding_stage IS NULL OR funding_stage = '' THEN ? ELSE funding_stage END,
    location      = CASE WHEN location      IS NULL OR location      = '' THEN ? ELSE location      END,
    vertical      = CASE WHEN vertical      IS NULL OR vertical      = '' THEN ? ELSE vertical      END
WHERE id = ?;`
	if _, err := db.Exec(q, c.Headcount, c.FundingStage, c.Location, c.Vertical, id); err != nil {
		return fmt.Errorf("backfill company %q: %w", id, err)
	}
	return nil
}

// EditableCompany are the hand-editable company fields — everything the
// Add-company form collects except the website (the domain is the row's
// identity and never changes after insert).
type EditableCompany struct {
	Name         string
	Headcount    sql.NullInt64
	FundingStage sql.NullString
	Location     sql.NullString
	Vertical     sql.NullString
}

// UpdateCompanyEditable replaces the editable fields on one company (full
// replace — the edit form submits every field, blanks clear). name_key tracks
// the new name so the dedup fold keeps matching (see normName). Returns
// sql.ErrNoRows for an unknown id.
func (db *DB) UpdateCompanyEditable(id string, e EditableCompany) error {
	const q = `
UPDATE companies SET
    name = ?, name_key = ?, headcount = ?, funding_stage = ?, location = ?, vertical = ?
WHERE id = ?;`
	res, err := db.Exec(q, e.Name, normName(e.Name), e.Headcount, e.FundingStage, e.Location, e.Vertical, id)
	if err != nil {
		return fmt.Errorf("update company %q: %w", id, err)
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return sql.ErrNoRows
	}
	return nil
}

// ErrDomainTaken is returned by SetCompanyDomain when another company (a
// different name) already holds the requested domain identity. The caller maps
// it to 409 — re-keying onto it would silently merge two distinct companies.
var ErrDomainTaken = errors.New("another company already uses that website")

// SetCompanyDomain attaches or changes a company's website/domain from the web
// pane and re-keys the row onto its domain identity (CompanyID), so a later
// same-domain ingest dedups against it instead of forking a twin. The id is the
// domain-derived UUID, so re-keying necessarily changes it — the resulting id is
// returned (it equals the input id only when the identity is unchanged).
//
// domain must already be normalized + validated by the caller (see
// ingest.SetCompanyDomain). If a DIFFERENT company already holds the domain
// identity it returns ErrDomainTaken; if the SAME company holds it under both
// keys (the domain-keyed twin already exists — the reverse-fold case), oldID is
// folded into it. Returns sql.ErrNoRows for an unknown id.
func (db *DB) SetCompanyDomain(oldID, domain string) (string, error) {
	var name string
	err := db.QueryRow(`SELECT name FROM companies WHERE id = ?`, oldID).Scan(&name)
	if err == sql.ErrNoRows {
		return "", sql.ErrNoRows
	}
	if err != nil {
		return "", fmt.Errorf("set domain: lookup %q: %w", oldID, err)
	}

	newID := CompanyID(domain, name)
	if newID == oldID {
		// Same identity (re-typing the domain, or a differently-cased equal) — just
		// store the normalized value in place, no re-key.
		if _, err := db.Exec(`UPDATE companies SET domain = ? WHERE id = ?`, domain, oldID); err != nil {
			return "", fmt.Errorf("set domain %q: %w", oldID, err)
		}
		return oldID, nil
	}

	tx, err := db.Begin()
	if err != nil {
		return "", fmt.Errorf("set domain %s→%s: begin: %w", oldID, newID, err)
	}
	defer tx.Rollback()

	var targetName string
	switch e := tx.QueryRow(`SELECT name FROM companies WHERE id = ?`, newID).Scan(&targetName); {
	case e == nil:
		// A company already holds this domain identity. Same name ⇒ the same
		// company under both keys (the reverse fold): fold oldID in. Different
		// name ⇒ two identities would collapse onto one row — refuse.
		if normName(targetName) != normName(name) {
			return "", ErrDomainTaken
		}
		if err := foldChildren(tx, oldID, newID); err != nil {
			return "", fmt.Errorf("set domain %s→%s: %w", oldID, newID, err)
		}
	case errors.Is(e, sql.ErrNoRows):
		// Re-key in place: clone the row under the domain id with the new domain,
		// move children onto it, then drop the old (name-keyed) row (foldChildren
		// deletes the old parent last).
		if _, err := tx.Exec(`
INSERT INTO companies (id, source, source_id, name, name_key, domain, headcount, funding_stage, location, vertical, raw_json, ingested_at, flagged_at, reviewed_at)
SELECT ?, source, source_id, name, name_key, ?, headcount, funding_stage, location, vertical, raw_json, ingested_at, flagged_at, reviewed_at
FROM companies WHERE id = ?`, newID, domain, oldID); err != nil {
			return "", fmt.Errorf("set domain: rekey %q: %w", oldID, err)
		}
		if err := foldChildren(tx, oldID, newID); err != nil {
			return "", fmt.Errorf("set domain %s→%s: %w", oldID, newID, err)
		}
	default:
		return "", fmt.Errorf("set domain: lookup twin %q: %w", newID, e)
	}

	if err := tx.Commit(); err != nil {
		return "", fmt.Errorf("set domain %s→%s: commit: %w", oldID, newID, err)
	}
	return newID, nil
}

// UpdateCompanyNotes sets the free-form, human-only notes on a company. This is
// the ONLY writer of the notes column — no ingest/enrich/verdict path touches it
// (see migration 0030), so a re-ingest never clobbers what the user wrote. An
// empty string clears it. Returns sql.ErrNoRows for an unknown id.
func (db *DB) UpdateCompanyNotes(id, notes string) error {
	res, err := db.Exec(`UPDATE companies SET notes = ? WHERE id = ?`, NullString(notes), id)
	if err != nil {
		return fmt.Errorf("update company notes %q: %w", id, err)
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return sql.ErrNoRows
	}
	return nil
}

// FillCompanyNamePlaceholder sets the company name only when the stored name is
// still the domain placeholder (a manual add with no name defaults to the bare
// domain) or empty. A real name — typed or ingested — is never overwritten.
// Reports whether a row changed.
func (db *DB) FillCompanyNamePlaceholder(id, name string) (bool, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return false, nil
	}
	const q = `
UPDATE companies SET name = ?, name_key = ?
WHERE id = ? AND (name = '' OR name = COALESCE(domain, ''));`
	res, err := db.Exec(q, name, normName(name), id)
	if err != nil {
		return false, fmt.Errorf("fill company name %q: %w", id, err)
	}
	n, _ := res.RowsAffected()
	return n > 0, nil
}

// companyChildTables1to1 hold at most one row per company (company_id is the
// PRIMARY KEY). On a fold, newID may ALREADY have its own row (the merge can
// target an existing, enriched/scored company), so a blind re-point would hit
// the PK — newID's row is kept (the surviving identity) and oldID's dropped.
var companyChildTables1to1 = []string{"enrichment", "verdicts"}

// companyChildTablesMany hold many rows per company (company_id is non-unique),
// so both sides' rows coexist and a plain re-point can't conflict.
var companyChildTablesMany = []string{"verdict_trace", "job_postings", "verdict_override"}

// companyChildTablesUniqueEmail hold many rows per company but carry a partial
// UNIQUE(company_id, email) index (M51), so a fold must drop oldID's rows whose
// email already exists at newID before re-pointing, or the re-point collides.
var companyChildTablesUniqueEmail = []string{"contacts"}

// companyChildTables is every table whose company_id FKs companies(id). A merge
// must handle ALL of them before the old parent is deleted — a table missing
// here would have its rows silently CASCADE-deleted (or block the delete).
// TestCompanyChildTablesMatchSchema guards this against schema drift.
var companyChildTables = append(append(append([]string{},
	companyChildTables1to1...), companyChildTablesMany...), companyChildTablesUniqueEmail...)

// foldChildren re-points every child row from oldID to newID within tx, then
// deletes the old parent (children move first so a crash never strands or
// orphans them past ON DELETE CASCADE). For the 1:1 tables it first drops
// oldID's row when newID already has one, so the re-point can't violate the
// company_id primary key — this is what lets a fold target a company that was
// already enriched/scored (the overwrite path), not only a brand-new row.
func foldChildren(tx *sql.Tx, oldID, newID string) error {
	for _, table := range companyChildTables1to1 {
		if _, err := tx.Exec(
			`DELETE FROM `+table+` WHERE company_id = ? AND EXISTS (SELECT 1 FROM `+table+` WHERE company_id = ?)`,
			oldID, newID,
		); err != nil {
			return fmt.Errorf("dedup %s: %w", table, err)
		}
		if _, err := tx.Exec(
			`UPDATE `+table+` SET company_id = ? WHERE company_id = ?`, newID, oldID,
		); err != nil {
			return fmt.Errorf("repoint %s: %w", table, err)
		}
	}
	for _, table := range companyChildTablesMany {
		if _, err := tx.Exec(
			`UPDATE `+table+` SET company_id = ? WHERE company_id = ?`, newID, oldID,
		); err != nil {
			return fmt.Errorf("repoint %s: %w", table, err)
		}
	}
	// Email-unique children: drop oldID's rows whose email already lives at newID
	// (its outreach log cascades), then re-point the rest so the unique index holds.
	for _, table := range companyChildTablesUniqueEmail {
		if _, err := tx.Exec(
			`DELETE FROM `+table+` WHERE company_id = ? AND email <> '' AND email IN (SELECT email FROM `+table+` WHERE company_id = ?)`,
			oldID, newID,
		); err != nil {
			return fmt.Errorf("dedup %s: %w", table, err)
		}
		if _, err := tx.Exec(
			`UPDATE `+table+` SET company_id = ? WHERE company_id = ?`, newID, oldID,
		); err != nil {
			return fmt.Errorf("repoint %s: %w", table, err)
		}
	}
	if _, err := tx.Exec(`DELETE FROM companies WHERE id = ?`, oldID); err != nil {
		return fmt.Errorf("delete old parent: %w", err)
	}
	return nil
}

// MergeCompany collapses a domain-less company (keyed by name, oldID) into an
// already-stored domain-keyed company (newID) for the same identity, in one
// transaction. newID may already carry children — foldChildren resolves any 1:1
// conflict in newID's favor.
func (db *DB) MergeCompany(oldID, newID string) error {
	tx, err := db.Begin()
	if err != nil {
		return fmt.Errorf("merge %s→%s: begin: %w", oldID, newID, err)
	}
	defer tx.Rollback()
	if err := foldChildren(tx, oldID, newID); err != nil {
		return fmt.Errorf("merge %s→%s: %w", oldID, newID, err)
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("merge %s→%s: commit: %w", oldID, newID, err)
	}
	return nil
}

// DeleteCompany permanently removes one company and every row attached to it, in
// one transaction. It deletes each company_id child (companyChildTables — the
// same schema-guarded list the merge uses) before the parent, then the parent
// itself; posting-keyed grandchildren (outreach_drafts, posting_answers) fall
// away via ON DELETE CASCADE off job_postings (foreign keys are always ON — see
// store.Open). Doing it explicitly rather than leaning on the parent's CASCADE
// keeps the deletion honest against schema drift (TestCompanyChildTablesMatchSchema
// guards the list) and matches foldChildren. Returns sql.ErrNoRows for an unknown
// id so the caller can 404. Irreversible — there is no soft-delete.
func (db *DB) DeleteCompany(id string) error {
	tx, err := db.Begin()
	if err != nil {
		return fmt.Errorf("delete company %q: begin: %w", id, err)
	}
	defer tx.Rollback()

	for _, table := range companyChildTables {
		if _, err := tx.Exec(`DELETE FROM `+table+` WHERE company_id = ?`, id); err != nil {
			return fmt.Errorf("delete company %q: %s: %w", id, table, err)
		}
	}
	res, err := tx.Exec(`DELETE FROM companies WHERE id = ?`, id)
	if err != nil {
		return fmt.Errorf("delete company %q: %w", id, err)
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return sql.ErrNoRows
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("delete company %q: commit: %w", id, err)
	}
	return nil
}

// UpsertAndFoldName upserts the new domain-keyed company AND folds a pre-existing
// name-keyed twin (nameKey) into it in a SINGLE transaction, so a crash or a
// cross-process SQLITE_BUSY can never leave the new row committed with the twin
// un-folded (a permanent duplicate the next re-ingest wouldn't reconcile). Used
// by ingest's forward fold; nameKey must already exist.
func (db *DB) UpsertAndFoldName(domainKey string, c Company, nameKey string) error {
	tx, err := db.Begin()
	if err != nil {
		return fmt.Errorf("upsert+fold %s→%s: begin: %w", nameKey, domainKey, err)
	}
	defer tx.Rollback()
	if err := upsertCompany(tx, domainKey, c); err != nil {
		return fmt.Errorf("upsert+fold %s→%s: %w", nameKey, domainKey, err)
	}
	if err := foldChildren(tx, nameKey, domainKey); err != nil {
		return fmt.Errorf("upsert+fold %s→%s: %w", nameKey, domainKey, err)
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("upsert+fold %s→%s: commit: %w", nameKey, domainKey, err)
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

// CompanyNameByID returns the stored name for a company id and whether the row
// exists, in one query. Ingest uses it in place of CompanyExists on the
// overwrite path so it can both decide new-vs-overwrite AND notice when an
// incoming row is about to clobber a row stored under the SAME domain key but a
// DIFFERENT name (a suspicious cross-identity collision worth surfacing) —
// without paying a second lookup.
func (db *DB) CompanyNameByID(id string) (name string, exists bool, err error) {
	err = db.QueryRow(`SELECT name FROM companies WHERE id = ?`, id).Scan(&name)
	if err == sql.ErrNoRows {
		return "", false, nil
	}
	if err != nil {
		return "", false, fmt.Errorf("company name %q: %w", id, err)
	}
	return name, true, nil
}

// DomainKeyedIDsByName returns the ids of companies that carry a real domain and
// whose name matches (case-insensitive, trimmed) the given name. Ingest uses it
// to recognize a domain-LESS arrival as a duplicate of a company already stored
// WITH a domain — the reverse of MergeCompany's name→domain fold. The name match
// is the same "same name ⇒ same company" assumption the forward fold already
// makes; the caller only acts on an unambiguous single hit (a name shared by
// several domain-keyed rows is left alone).
func (db *DB) DomainKeyedIDsByName(name string) ([]string, error) {
	key := normName(name)
	if key == "" {
		return nil, nil
	}
	// Match on the Go-folded name_key column, NOT SQLite lower(name): the built-in
	// folds ASCII only, so a SQL match would miss/misjudge accented or non-Latin
	// names and disagree with the forward fold (see normName).
	rows, err := db.Query(
		`SELECT id FROM companies
		 WHERE name_key = ? AND domain IS NOT NULL AND trim(domain) <> ''`,
		key,
	)
	if err != nil {
		return nil, fmt.Errorf("domain-keyed ids by name %q: %w", name, err)
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		out = append(out, id)
	}
	return out, rows.Err()
}

// CountCompanies returns the total number of rows in the companies table.
func (db *DB) CountCompanies() (int, error) {
	var n int
	err := db.QueryRow(`SELECT COUNT(1) FROM companies`).Scan(&n)
	return n, err
}

// DistinctValues returns the sorted (case-insensitive) distinct non-empty
// values of a company column. The column name is validated against a fixed
// allow-list and never interpolated from caller input, so this can't be a SQL
// injection vector. Used to populate the Add-company dropdowns from whatever's
// currently in the set.
func (db *DB) DistinctValues(column string) ([]string, error) {
	switch column {
	case "funding_stage", "vertical": // allow-list — keep in sync with callers
	default:
		return nil, fmt.Errorf("distinct values: unsupported column %q", column)
	}
	rows, err := db.Query(`SELECT DISTINCT ` + column + ` FROM companies
WHERE ` + column + ` IS NOT NULL AND ` + column + ` <> ''
ORDER BY ` + column + ` COLLATE NOCASE`)
	if err != nil {
		return nil, fmt.Errorf("distinct %s: %w", column, err)
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var v string
		if err := rows.Scan(&v); err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	return out, rows.Err()
}

// VerticalTags returns the distinct individual vertical tags in the set:
// composite "A, B, C" cells (Crunchbase "Industries" exports whole lists into
// one cell) are split on commas, deduped case-insensitively (first spelling
// wins), and sorted. Powers the Add-dialog facet picker and the vocabulary
// steering in the capture/enrichment extraction prompts.
func (db *DB) VerticalTags() ([]string, error) {
	cells, err := db.DistinctValues("vertical")
	if err != nil {
		return nil, err
	}
	seen := map[string]bool{}
	out := []string{}
	for _, cell := range cells {
		for _, tok := range strings.Split(cell, ",") {
			tok = strings.TrimSpace(tok)
			key := strings.ToLower(tok)
			if tok == "" || seen[key] {
				continue
			}
			seen[key] = true
			out = append(out, tok)
		}
	}
	sort.Slice(out, func(i, j int) bool {
		return strings.ToLower(out[i]) < strings.ToLower(out[j])
	})
	return out, nil
}
