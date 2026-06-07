// Package store wraps the SQLite database.
package store

import (
	"database/sql"
	"embed"
	"fmt"
	"sort"
	"strings"

	_ "modernc.org/sqlite"
)

//go:embed migrations/*.sql
var migrationsFS embed.FS

// DB is the scout database handle.
type DB struct {
	*sql.DB
}

// Open opens (or creates) the SQLite database at path and applies any pending migrations.
func Open(path string) (*DB, error) {
	// busy_timeout makes a blocked writer wait for the lock instead of failing
	// with SQLITE_BUSY immediately — WAL still allows only one writer at a time,
	// and the verdict pass runs several workers that each write concurrently.
	sqlDB, err := sql.Open("sqlite", path+"?_pragma=foreign_keys(1)&_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)")
	if err != nil {
		return nil, fmt.Errorf("open sqlite: %w", err)
	}
	db := &DB{sqlDB}
	if err := db.migrate(); err != nil {
		_ = sqlDB.Close()
		return nil, err
	}
	return db, nil
}

// Backup writes a consistent, compacted snapshot of the live database to dest
// using SQLite's `VACUUM INTO`. Unlike copying the file, this is safe to run
// while scout is serving: it captures a transactionally-consistent view and
// folds in any WAL pages, producing a single self-contained file with no
// -wal/-shm sidecars. dest must not already exist (SQLite refuses to overwrite).
func (db *DB) Backup(dest string) error {
	// VACUUM INTO can't bind parameters; quote the path by doubling single quotes.
	quoted := "'" + strings.ReplaceAll(dest, "'", "''") + "'"
	if _, err := db.Exec("VACUUM INTO " + quoted); err != nil {
		return fmt.Errorf("vacuum into %s: %w", dest, err)
	}
	return nil
}

// IntegrityCheck runs SQLite's `PRAGMA integrity_check` and returns an error if
// the database is corrupt. A healthy database reports the single row "ok".
func (db *DB) IntegrityCheck() error {
	rows, err := db.Query("PRAGMA integrity_check")
	if err != nil {
		return fmt.Errorf("integrity_check: %w", err)
	}
	defer rows.Close()
	var problems []string
	for rows.Next() {
		var s string
		if err := rows.Scan(&s); err != nil {
			return fmt.Errorf("integrity_check scan: %w", err)
		}
		if s != "ok" {
			problems = append(problems, s)
		}
	}
	if err := rows.Err(); err != nil {
		return err
	}
	if len(problems) > 0 {
		return fmt.Errorf("integrity_check failed: %s", strings.Join(problems, "; "))
	}
	return nil
}

func (db *DB) migrate() error {
	if _, err := db.Exec(`CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at DATETIME DEFAULT CURRENT_TIMESTAMP)`); err != nil {
		return fmt.Errorf("create migrations table: %w", err)
	}

	entries, err := migrationsFS.ReadDir("migrations")
	if err != nil {
		return fmt.Errorf("read migrations: %w", err)
	}
	names := make([]string, 0, len(entries))
	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(e.Name(), ".sql") {
			names = append(names, e.Name())
		}
	}
	sort.Strings(names)

	for _, name := range names {
		var applied int
		if err := db.QueryRow(`SELECT COUNT(1) FROM schema_migrations WHERE name = ?`, name).Scan(&applied); err != nil {
			return fmt.Errorf("check migration %s: %w", name, err)
		}
		if applied > 0 {
			continue
		}
		body, err := migrationsFS.ReadFile("migrations/" + name)
		if err != nil {
			return fmt.Errorf("read %s: %w", name, err)
		}
		if _, err := db.Exec(string(body)); err != nil {
			return fmt.Errorf("apply %s: %w", name, err)
		}
		if _, err := db.Exec(`INSERT INTO schema_migrations (name) VALUES (?)`, name); err != nil {
			return fmt.Errorf("record %s: %w", name, err)
		}
	}
	return nil
}
