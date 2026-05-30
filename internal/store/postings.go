package store

import (
	"database/sql"
	"fmt"
	"strings"

	"github.com/google/uuid"
)

// Posting is a link to a job/role posting found at a company. One-to-many:
// a company can have any number of postings. Flattened + JSON-tagged for
// direct serialization in the company detail payload and the add endpoint.
// company_id is the company's deterministic TEXT uuid (see CompanyID).
type Posting struct {
	ID        string `json:"id"`
	CompanyID string `json:"company_id"`
	URL       string `json:"url"`
	Title     string `json:"title"` // "" when null
	CreatedAt string `json:"created_at"`
}

// AddPosting inserts a posting for a company and returns the created row.
// Inputs are trimmed; an empty url is rejected with a validation error.
// Returns sql.ErrNoRows if the company doesn't exist.
func (db *DB) AddPosting(companyID, url, title string) (Posting, error) {
	url = strings.TrimSpace(url)
	title = strings.TrimSpace(title)
	if url == "" {
		return Posting{}, fmt.Errorf("url required")
	}

	// Ensure the company exists (mirrors the guard in other store writes).
	exists, err := db.CompanyExists(companyID)
	if err != nil {
		return Posting{}, err
	}
	if !exists {
		return Posting{}, sql.ErrNoRows
	}

	titleVal := sql.NullString{String: title, Valid: title != ""}
	id := uuid.NewString()
	const q = `INSERT INTO job_postings (id, company_id, url, title) VALUES (?, ?, ?, ?)`
	if _, err := db.Exec(q, id, companyID, url, titleVal); err != nil {
		return Posting{}, fmt.Errorf("insert posting for company %s: %w", companyID, err)
	}

	var p Posting
	const sel = `SELECT id, company_id, url, COALESCE(title, ''), created_at
	             FROM job_postings WHERE id = ?`
	if err := db.QueryRow(sel, id).Scan(&p.ID, &p.CompanyID, &p.URL, &p.Title, &p.CreatedAt); err != nil {
		return Posting{}, fmt.Errorf("read back posting %s: %w", id, err)
	}
	return p, nil
}

// ListPostings returns a company's postings, newest first. Returns an empty
// (non-nil) slice when there are none, so callers serialize [] not null.
func (db *DB) ListPostings(companyID string) ([]Posting, error) {
	const q = `SELECT id, company_id, url, COALESCE(title, ''), created_at
	           FROM job_postings WHERE company_id = ?
	           ORDER BY created_at DESC, rowid DESC`
	rows, err := db.Query(q, companyID)
	if err != nil {
		return nil, fmt.Errorf("list postings for company %s: %w", companyID, err)
	}
	defer rows.Close()

	out := []Posting{}
	for rows.Next() {
		var p Posting
		if err := rows.Scan(&p.ID, &p.CompanyID, &p.URL, &p.Title, &p.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}
