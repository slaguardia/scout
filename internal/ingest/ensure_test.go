package ingest

import (
	"path/filepath"
	"strings"
	"testing"

	"github.com/slaguardia/scout/internal/store"
)

func openEnsureDB(t *testing.T) *store.DB {
	t.Helper()
	db, err := store.Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	return db
}

func TestEnsureCompanyCreatesAndResolves(t *testing.T) {
	db := openEnsureDB(t)

	// Fresh domain-keyed create.
	id, created, err := EnsureCompany(db, CapturedCompany{
		Name: "Acme", Domain: "acme.com", Vertical: "AI infra", SourceURL: "https://acme.com/about",
	})
	if err != nil || !created {
		t.Fatalf("create: id=%q created=%v err=%v", id, created, err)
	}
	if id != store.CompanyID("acme.com", "Acme") {
		t.Errorf("unexpected id %q", id)
	}

	// Same identity again → resolves, no second create, row untouched.
	id2, created, err := EnsureCompany(db, CapturedCompany{Name: "Acme Inc", Domain: "acme.com"})
	if err != nil || created || id2 != id {
		t.Errorf("resolve existing: id=%q created=%v err=%v", id2, created, err)
	}

	// A capture must NOT overwrite the stored row (sparse capture vs rich CSV).
	name, _, err := db.CompanyNameByID(id)
	if err != nil || name != "Acme" {
		t.Errorf("existing row was touched: name=%q err=%v", name, err)
	}
}

func TestEnsureCompanyNameKeyed(t *testing.T) {
	db := openEnsureDB(t)

	// No domain → name-keyed row.
	id, created, err := EnsureCompany(db, CapturedCompany{Name: "Stealth Co"})
	if err != nil || !created {
		t.Fatalf("name-keyed create: created=%v err=%v", created, err)
	}
	if id != store.CompanyID("", "Stealth Co") {
		t.Errorf("expected name key, got %q", id)
	}

	// Domain-less capture of a company already stored WITH a domain resolves to
	// the existing domain-keyed row (the reverse fold) instead of duplicating.
	want, _, err := EnsureCompany(db, CapturedCompany{Name: "Acme", Domain: "acme.com"})
	if err != nil {
		t.Fatalf("seed acme: %v", err)
	}
	got, created, err := EnsureCompany(db, CapturedCompany{Name: "Acme"})
	if err != nil || created || got != want {
		t.Errorf("reverse fold: id=%q (want %q) created=%v err=%v", got, want, created, err)
	}

	// Neither name nor usable domain → validation error.
	if _, _, err := EnsureCompany(db, CapturedCompany{Domain: "linkedin.com"}); err == nil ||
		!strings.Contains(err.Error(), "company") {
		t.Errorf("want company validation error, got %v", err)
	}
}

func TestEnsureCompanyFoldsNameTwin(t *testing.T) {
	db := openEnsureDB(t)

	// Name-keyed twin first (e.g. from a domain-less CSV row)...
	twin, _, err := EnsureCompany(db, CapturedCompany{Name: "Acme"})
	if err != nil {
		t.Fatalf("twin: %v", err)
	}
	// ...then a capture arrives with the domain: the twin folds in, and the
	// company is reported as already-known (created=false).
	id, created, err := EnsureCompany(db, CapturedCompany{Name: "Acme", Domain: "acme.com"})
	if err != nil || created {
		t.Fatalf("fold: created=%v err=%v", created, err)
	}
	if exists, _ := db.CompanyExists(twin); exists {
		t.Error("name-keyed twin survived the fold")
	}
	if exists, _ := db.CompanyExists(id); !exists {
		t.Error("domain-keyed row missing after fold")
	}
}
