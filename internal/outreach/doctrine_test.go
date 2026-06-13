package outreach

import (
	"path/filepath"
	"strings"
	"testing"

	"github.com/slaguardia/scout/internal/store"
)

// DoctrineOrDefault: compiled-in default with no DB / an empty row, the saved
// doctrine once one is written.
func TestDoctrineOrDefault(t *testing.T) {
	if strings.TrimSpace(DefaultDoctrine) == "" {
		t.Fatal("DefaultDoctrine is empty — the embed is broken")
	}
	if got := DoctrineOrDefault(nil); got != strings.TrimSpace(DefaultDoctrine) {
		t.Errorf("nil db: want the compiled-in default, got %q…", got[:min(len(got), 60)])
	}

	db, err := store.Open(filepath.Join(t.TempDir(), "scout.db"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer db.Close()

	if got := DoctrineOrDefault(db); got != strings.TrimSpace(DefaultDoctrine) {
		t.Errorf("empty row: want the compiled-in default, got %q…", got[:min(len(got), 60)])
	}
	if err := db.PutOutreachDoctrine("my own method\n"); err != nil {
		t.Fatalf("put doctrine: %v", err)
	}
	if got := DoctrineOrDefault(db); got != "my own method" {
		t.Errorf("saved row: got %q, want the saved (trimmed) doctrine", got)
	}
	// Saving blank falls back to the default again.
	if err := db.PutOutreachDoctrine("  \n"); err != nil {
		t.Fatalf("put blank doctrine: %v", err)
	}
	if got := DoctrineOrDefault(db); got != strings.TrimSpace(DefaultDoctrine) {
		t.Errorf("blank row: want the compiled-in default back, got %q…", got[:min(len(got), 60)])
	}
}

// The fill system prompt splices the doctrine in under its header, keeping the
// compiled integrity frame around it.
func TestBuildFillSystemSplicesDoctrine(t *testing.T) {
	const doctrine = "DOCTRINE-MARKER: interpretation, not information."
	sys := buildFillSystem(doctrine)
	for _, want := range []string{
		"WRITING DOCTRINE (the user's editable method",
		doctrine,
		"NEVER invent",     // integrity stays compiled
		"SENDER PRESENCE",  // hook/closer containment stays compiled
		"PROOF GRADIENT",   // the tiers stay compiled
		`{"no_send": true`, // the JSON contract stays compiled
	} {
		if !strings.Contains(sys, want) {
			t.Errorf("fill system prompt missing %q", want)
		}
	}
}
