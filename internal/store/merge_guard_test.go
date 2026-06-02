package store

import (
	"sort"
	"testing"
)

// companyChildTables is hand-maintained and drives MergeCompany / foldChildren.
// If a future migration adds a table whose company_id FKs companies(id) but the
// list isn't updated, the merge's parent DELETE would silently CASCADE-delete
// those rows (or block). This test derives the truth from the live schema and
// fails if the list drifts.
func TestCompanyChildTablesMatchSchema(t *testing.T) {
	db := openTestDB(t)

	rows, err := db.Query(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`)
	if err != nil {
		t.Fatal(err)
	}
	var tables []string
	for rows.Next() {
		var n string
		if err := rows.Scan(&n); err != nil {
			t.Fatal(err)
		}
		tables = append(tables, n)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		t.Fatal(err)
	}

	var referencing []string
	for _, table := range tables {
		fk, err := db.Query(`PRAGMA foreign_key_list(` + table + `)`)
		if err != nil {
			t.Fatal(err)
		}
		for fk.Next() {
			// PRAGMA foreign_key_list columns: id, seq, table, from, to, on_update, on_delete, match
			var id, seq int
			var refTable, from, to, onUpdate, onDelete, match string
			if err := fk.Scan(&id, &seq, &refTable, &from, &to, &onUpdate, &onDelete, &match); err != nil {
				fk.Close()
				t.Fatal(err)
			}
			if refTable == "companies" && from == "company_id" {
				referencing = append(referencing, table)
				break
			}
		}
		fk.Close()
	}

	got := append([]string(nil), referencing...)
	want := append([]string(nil), companyChildTables...)
	sort.Strings(got)
	sort.Strings(want)
	if len(got) != len(want) {
		t.Fatalf("company_id child tables in schema = %v, but companyChildTables = %v — update the list (and MergeCompany)", got, want)
	}
	for i := range got {
		if got[i] != want[i] {
			t.Fatalf("company_id child tables in schema = %v, but companyChildTables = %v", got, want)
		}
	}
}
