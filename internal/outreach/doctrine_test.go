package outreach

import (
	"path/filepath"
	"strings"
	"testing"

	"github.com/slaguardia/scout/internal/store"
)

// stagePrompt: the compiled-in default with no DB / an empty override, the saved
// override once one is written, the default again when the override is blanked.
func TestStagePromptOrDefault(t *testing.T) {
	rs, ok := StageByKey("researcher")
	if !ok || strings.TrimSpace(rs.Default) == "" {
		t.Fatal("researcher stage missing or its default prompt is empty")
	}

	// No DB → compiled-in default.
	if got := (&Engine{}).stagePrompt("researcher"); got != rs.Default {
		t.Errorf("nil db: want the compiled-in default, got %q…", got[:min(len(got), 60)])
	}

	db, err := store.Open(filepath.Join(t.TempDir(), "scout.db"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer db.Close()
	e := &Engine{DB: db}

	if got := e.stagePrompt("researcher"); got != rs.Default {
		t.Errorf("empty override: want the compiled-in default, got %q…", got[:min(len(got), 60)])
	}
	if err := db.PutPromptOverride("researcher", "my own researcher prompt\n"); err != nil {
		t.Fatalf("put override: %v", err)
	}
	if got := e.stagePrompt("researcher"); got != "my own researcher prompt" {
		t.Errorf("saved override: got %q, want the saved (trimmed) prompt", got)
	}
	if err := db.PutPromptOverride("researcher", "  \n"); err != nil {
		t.Fatalf("blank override: %v", err)
	}
	if got := e.stagePrompt("researcher"); got != rs.Default {
		t.Errorf("blank override: want the compiled-in default back, got %q…", got[:min(len(got), 60)])
	}
}

// The Writer (fill) default folds the writing method into the compiled integrity
// The warm Writer default carries its register, the integrity rules, and the
// JSON contract — all self-contained.
func TestFillSystemDefaultIsWarmAndSelfContained(t *testing.T) {
	for _, want := range []string{
		"warm, human cold email",   // the register
		"NEVER invent",             // integrity
		"manufacture a connection", // the anti-fabrication rule
		`{"no_send": true`,         // the JSON contract
		`{"fills":`,                // the JSON contract
	} {
		if !strings.Contains(fillSystemDefault, want) {
			t.Errorf("fill default prompt missing %q", want)
		}
	}
}
