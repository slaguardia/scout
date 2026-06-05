package store

import (
	"database/sql"
	"fmt"
)

// OutreachPin binds one position of a block slot to a brain document id.
// ApprovedVersion is set only for locked-tier blocks: the upstream version the
// user approved; a sync that sees anything else halts the block.
type OutreachPin struct {
	Block           string `json:"block"`
	Position        int    `json:"position"`
	PageID          string `json:"page_id"`
	ApprovedVersion string `json:"approved_version"`
}

// OutreachBlock is one assembled, cached context block. Broken non-empty means
// the block is unusable (pinned doc 404, locked version drift) and outreach
// drafting must not run with it; the text says why.
type OutreachBlock struct {
	Block      string `json:"block"`
	Content    string `json:"content"`
	Version    string `json:"version"`
	Broken     string `json:"broken"`
	FetchedAt  string `json:"fetched_at"`
	AgeSeconds int64  `json:"age_seconds"`
}

// ListOutreachPins returns all pins ordered by (block, position).
func (db *DB) ListOutreachPins() ([]OutreachPin, error) {
	rows, err := db.Query(`SELECT block, position, page_id, approved_version
FROM outreach_pins ORDER BY block, position`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var pins []OutreachPin
	for rows.Next() {
		var p OutreachPin
		if err := rows.Scan(&p.Block, &p.Position, &p.PageID, &p.ApprovedVersion); err != nil {
			return nil, err
		}
		pins = append(pins, p)
	}
	return pins, rows.Err()
}

// SetOutreachPin replaces the pin list for one block atomically. An empty
// pageIDs unpins the block (and drops its cached content).
func (db *DB) SetOutreachPin(block string, pageIDs []string, approvedVersion string) error {
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.Exec(`DELETE FROM outreach_pins WHERE block = ?`, block); err != nil {
		return err
	}
	for i, id := range pageIDs {
		if _, err := tx.Exec(`INSERT INTO outreach_pins (block, position, page_id, approved_version)
VALUES (?, ?, ?, ?)`, block, i, id, approvedVersion); err != nil {
			return fmt.Errorf("pin %s[%d]: %w", block, i, err)
		}
	}
	if len(pageIDs) == 0 {
		if _, err := tx.Exec(`DELETE FROM outreach_blocks WHERE block = ?`, block); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// GetOutreachBlock returns one cached block, or (nil, nil) when absent.
func (db *DB) GetOutreachBlock(block string) (*OutreachBlock, error) {
	const q = `
SELECT block, content, version, broken, fetched_at,
       CAST(strftime('%s','now') - strftime('%s', fetched_at) AS INTEGER) AS age_seconds
FROM outreach_blocks WHERE block = ?`
	var b OutreachBlock
	err := db.QueryRow(q, block).Scan(&b.Block, &b.Content, &b.Version, &b.Broken, &b.FetchedAt, &b.AgeSeconds)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &b, nil
}

// ListOutreachBlocks returns every cached block, ordered by name.
func (db *DB) ListOutreachBlocks() ([]OutreachBlock, error) {
	rows, err := db.Query(`
SELECT block, content, version, broken, fetched_at,
       CAST(strftime('%s','now') - strftime('%s', fetched_at) AS INTEGER) AS age_seconds
FROM outreach_blocks ORDER BY block`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []OutreachBlock
	for rows.Next() {
		var b OutreachBlock
		if err := rows.Scan(&b.Block, &b.Content, &b.Version, &b.Broken, &b.FetchedAt, &b.AgeSeconds); err != nil {
			return nil, err
		}
		out = append(out, b)
	}
	return out, rows.Err()
}

// PutOutreachBlock upserts a healthy assembled block (clears broken).
func (db *DB) PutOutreachBlock(block, content, version string) error {
	const q = `
INSERT INTO outreach_blocks (block, content, version, broken, fetched_at)
VALUES (?, ?, ?, '', CURRENT_TIMESTAMP)
ON CONFLICT(block) DO UPDATE SET
    content    = excluded.content,
    version    = excluded.version,
    broken     = '',
    fetched_at = CURRENT_TIMESTAMP`
	_, err := db.Exec(q, block, content, version)
	return err
}

// MarkOutreachBlockBroken records why a block is unusable without touching any
// previously cached content (the stale text stays visible for diagnosis, but
// Broken gates its use).
func (db *DB) MarkOutreachBlockBroken(block, why string) error {
	const q = `
INSERT INTO outreach_blocks (block, content, version, broken, fetched_at)
VALUES (?, '', '', ?, CURRENT_TIMESTAMP)
ON CONFLICT(block) DO UPDATE SET
    broken     = excluded.broken,
    fetched_at = CURRENT_TIMESTAMP`
	_, err := db.Exec(q, block, why)
	return err
}
