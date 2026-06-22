package store

import "strings"

// OutreachSource is one brain page bound to a knowledge need (experience/voice)
// for the outreach + answers pipeline, with its whole text cached locally.
type OutreachSource struct {
	Need       string `json:"need"`
	PageID     string `json:"page_id"`
	Title      string `json:"title"`
	Content    string `json:"content"`
	Version    string `json:"version"`
	ResolvedAt string `json:"resolved_at"`
}

// ListOutreachSources returns every cached source, ordered by need then title.
func (db *DB) ListOutreachSources() ([]OutreachSource, error) {
	const q = `SELECT need, page_id, title, content, version, resolved_at
FROM outreach_sources ORDER BY need, title`
	rows, err := db.Query(q)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []OutreachSource
	for rows.Next() {
		var s OutreachSource
		if err := rows.Scan(&s.Need, &s.PageID, &s.Title, &s.Content, &s.Version, &s.ResolvedAt); err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

// OutreachKnowledge concatenates the cached text of every page bound to a need
// — the whole-fetched bundle the fill step and honesty checker reason over.
// Empty string means the need has no resolved sources.
func (db *DB) OutreachKnowledge(need string) (string, error) {
	const q = `SELECT title, content FROM outreach_sources WHERE need = ? ORDER BY title`
	rows, err := db.Query(q, need)
	if err != nil {
		return "", err
	}
	defer rows.Close()
	var parts []string
	for rows.Next() {
		var title, content string
		if err := rows.Scan(&title, &content); err != nil {
			return "", err
		}
		if strings.TrimSpace(content) == "" {
			continue
		}
		if title != "" {
			parts = append(parts, "# "+title+"\n\n"+content)
		} else {
			parts = append(parts, content)
		}
	}
	if err := rows.Err(); err != nil {
		return "", err
	}
	return strings.Join(parts, "\n\n---\n\n"), nil
}

// ReplaceOutreachSources swaps the cached set for one need in a transaction
// (delete-all-for-need + insert) — the discovery/refresh write.
func (db *DB) ReplaceOutreachSources(need string, sources []OutreachSource) error {
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.Exec(`DELETE FROM outreach_sources WHERE need = ?`, need); err != nil {
		return err
	}
	const ins = `INSERT INTO outreach_sources (need, page_id, title, content, version)
VALUES (?, ?, ?, ?, ?)`
	for _, s := range sources {
		if _, err := tx.Exec(ins, need, s.PageID, s.Title, s.Content, s.Version); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// UpsertOutreachSource adds or refreshes one (need, page_id) row. Used by tests
// to seed a cached bundle; the live path replaces whole need-sets via discovery
// (ReplaceOutreachSources).
func (db *DB) UpsertOutreachSource(s OutreachSource) error {
	const q = `
INSERT INTO outreach_sources (need, page_id, title, content, version, resolved_at)
VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
ON CONFLICT(need, page_id) DO UPDATE SET
    title = excluded.title, content = excluded.content,
    version = excluded.version, resolved_at = CURRENT_TIMESTAMP`
	_, err := db.Exec(q, s.Need, s.PageID, s.Title, s.Content, s.Version)
	return err
}
