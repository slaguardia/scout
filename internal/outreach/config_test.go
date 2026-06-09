package outreach

import (
	"path/filepath"
	"strings"
	"testing"

	"github.com/slaguardia/scout/internal/store"
)

func TestRenderSubject(t *testing.T) {
	cases := []struct {
		name, format, sender, role, want string
	}{
		{"default with role", DefaultSubjectFormat, "Alex", "Backend Engineer", "[Name] | Alex intro — Backend Engineer"},
		{"default no role collapses the separator", DefaultSubjectFormat, "Alex", "", "[Name] | Alex intro"},
		{"default no role trims whitespace role", DefaultSubjectFormat, "Alex", "   ", "[Name] | Alex intro"},
		{"custom format", "{sender} -> you, re {role}", "Sam", "SRE", "Sam -> you, re SRE"},
		{"custom no role", "{sender} re {role}", "Sam", "", "Sam re"},
		{"no role token", "hello from {sender}", "Sam", "", "hello from Sam"},
		{"degenerate double token, no role", "x {role} y {role}", "Sam", "", "x y"},
		{"degenerate double token, with role", "x {role} y {role}", "Sam", "SRE", "x SRE y SRE"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := renderSubject(c.format, c.sender, c.role); got != c.want {
				t.Errorf("renderSubject(%q,%q,%q) = %q, want %q", c.format, c.sender, c.role, got, c.want)
			}
		})
	}
}

func TestConfigValidate(t *testing.T) {
	ok := DefaultConfig()
	if err := ok.Validate(); err != nil {
		t.Fatalf("default config invalid: %v", err)
	}

	bad := []struct {
		name string
		cfg  Config
	}{
		{"zero min", Config{WordMin: 0, WordMax: 100, SubjectFormat: "x", Structure: DefaultStructure()}},
		{"max below min", Config{WordMin: 100, WordMax: 50, SubjectFormat: "x", Structure: DefaultStructure()}},
		{"empty subject", Config{WordMin: 1, WordMax: 10, SubjectFormat: "  ", Structure: DefaultStructure()}},
		{"no slots", Config{WordMin: 1, WordMax: 10, SubjectFormat: "x", Structure: []StructureSlot{}}},
		{"bad model source", Config{WordMin: 1, WordMax: 10, SubjectFormat: "x", Structure: []StructureSlot{{Kind: SlotModel, Source: "P9"}}}},
		{"unknown locked block", Config{WordMin: 1, WordMax: 10, SubjectFormat: "x", Structure: []StructureSlot{{Kind: SlotLocked, Block: "NOPE"}}}},
		{"derived locked block", Config{WordMin: 1, WordMax: 10, SubjectFormat: "x", Structure: []StructureSlot{{Kind: SlotLocked, Block: "EXPERIENCE_CARD"}}}},
		{"experience doc in body", Config{WordMin: 1, WordMax: 10, SubjectFormat: "x", Structure: []StructureSlot{{Kind: SlotLocked, Block: "PAST_EXPERIENCE_FULL"}}}},
		{"unknown kind", Config{WordMin: 1, WordMax: 10, SubjectFormat: "x", Structure: []StructureSlot{{Kind: "weird"}}}},
	}
	for _, c := range bad {
		t.Run(c.name, func(t *testing.T) {
			if err := c.cfg.Validate(); err == nil {
				t.Errorf("expected %s to be rejected", c.name)
			}
		})
	}
}

func TestHardBlocksFollowStructure(t *testing.T) {
	// Default structure renders P2_LOCKED -> it is hard alongside the experience
	// doc.
	hard := HardBlocks(DefaultConfig())
	for _, want := range []string{"PAST_EXPERIENCE_FULL", "P2_LOCKED"} {
		if !contains(hard, want) {
			t.Errorf("default hard blocks %v missing %s", hard, want)
		}
	}

	// A structure with no locked slot -> only the experience doc is hard.
	noLocked := Config{
		WordMin: 75, WordMax: 125, SubjectFormat: DefaultSubjectFormat,
		Structure: []StructureSlot{{Kind: SlotModel, Source: "P1"}, {Kind: SlotModel, Source: "P3"}},
	}
	hard = HardBlocks(noLocked)
	if len(hard) != 1 || hard[0] != "PAST_EXPERIENCE_FULL" {
		t.Errorf("no-locked structure hard blocks = %v, want [PAST_EXPERIENCE_FULL] only", hard)
	}
	if len(noLocked.LockedBlocks()) != 0 {
		t.Errorf("no-locked structure reports locked blocks: %v", noLocked.LockedBlocks())
	}
}

func TestAssembleEmailFollowsStructure(t *testing.T) {
	snd := Sender{SubjectName: "Alex", Signature: "Thanks,\nAlex"}
	model := map[string]string{"P1": "para one", "P3": "para three"}
	locked := map[string]string{"P2_LOCKED": "frozen creds"}

	// Default order: P1, P2_LOCKED, P3.
	email := assembleEmail(snd, DefaultConfig(), "SRE", model, locked)
	if !strings.HasPrefix(email, "Subject: [Name] | Alex intro — SRE\n\nHi [Name],") {
		t.Errorf("subject/greeting wrong:\n%s", email)
	}
	if i1, i2, i3 := strings.Index(email, "para one"), strings.Index(email, "frozen creds"), strings.Index(email, "para three"); !(i1 < i2 && i2 < i3) {
		t.Errorf("default order broken (p1=%d p2=%d p3=%d):\n%s", i1, i2, i3, email)
	}

	// Reordered: P3, locked, P1 — the body must follow the config.
	reordered := DefaultConfig()
	reordered.Structure = []StructureSlot{
		{Kind: SlotModel, Source: "P3"},
		{Kind: SlotLocked, Block: "P2_LOCKED"},
		{Kind: SlotModel, Source: "P1"},
	}
	email = assembleEmail(snd, reordered, "SRE", model, locked)
	if i3, i1 := strings.Index(email, "para three"), strings.Index(email, "para one"); !(i3 < i1) {
		t.Errorf("reorder not honored (p3=%d p1=%d):\n%s", i3, i1, email)
	}

	// No locked slot -> the locked content is absent entirely.
	noLocked := DefaultConfig()
	noLocked.Structure = []StructureSlot{{Kind: SlotModel, Source: "P1"}, {Kind: SlotModel, Source: "P3"}}
	email = assembleEmail(snd, noLocked, "SRE", model, locked)
	if strings.Contains(email, "frozen creds") {
		t.Errorf("locked content leaked into a no-locked structure:\n%s", email)
	}
}

func TestLoadSaveConfigRoundTrip(t *testing.T) {
	db := openTestDB(t)

	// Absent row -> defaults.
	cfg, err := LoadConfig(db)
	if err != nil {
		t.Fatal(err)
	}
	if cfg.WordMin != 75 || cfg.WordMax != 125 || cfg.SubjectFormat != DefaultSubjectFormat || len(cfg.Structure) != 3 {
		t.Fatalf("absent config not defaulted: %+v", cfg)
	}

	// Round-trip a custom config.
	custom := Config{
		WordMin: 50, WordMax: 90, SubjectFormat: "{sender}: {role}",
		Structure: []StructureSlot{
			{Kind: SlotModel, Source: "P3"},
			{Kind: SlotLocked, Block: "P2_LOCKED"},
			{Kind: SlotModel, Source: "P1"},
		},
	}
	if err := SaveConfig(db, custom); err != nil {
		t.Fatalf("save: %v", err)
	}
	got, err := LoadConfig(db)
	if err != nil {
		t.Fatal(err)
	}
	if got.WordMin != 50 || got.WordMax != 90 || got.SubjectFormat != "{sender}: {role}" {
		t.Fatalf("scalar round-trip lost: %+v", got)
	}
	if len(got.Structure) != 3 || got.Structure[0].Source != "P3" || got.Structure[2].Source != "P1" {
		t.Fatalf("structure round-trip lost: %+v", got.Structure)
	}

	// SaveConfig rejects an invalid config.
	if err := SaveConfig(db, Config{WordMin: 0, WordMax: 0, SubjectFormat: "x", Structure: DefaultStructure()}); err == nil {
		t.Error("SaveConfig accepted an invalid word window")
	}
}

func TestLoadConfigFallsBackOnGarbageStructure(t *testing.T) {
	db := openTestDB(t)
	// A corrupt stored structure (hand-edited / older schema) must degrade to
	// the default structure, never leave the engine with something unrenderable.
	if err := db.PutOutreachConfig(store.OutreachConfig{
		WordMin: 80, WordMax: 120, SubjectFormat: "x {role}", Structure: "not json at all",
	}); err != nil {
		t.Fatal(err)
	}
	cfg, err := LoadConfig(db)
	if err != nil {
		t.Fatal(err)
	}
	if len(cfg.Structure) != 3 {
		t.Errorf("garbage structure not defaulted: %+v", cfg.Structure)
	}
	if cfg.WordMin != 80 || cfg.WordMax != 120 {
		t.Errorf("valid scalar fields dropped on structure fallback: %+v", cfg)
	}
}

func TestLintRespectsConfiguredWindow(t *testing.T) {
	body := strings.TrimSpace(strings.Repeat("plain honest words about the work. ", 4)) // ~24 words
	tight := Config{WordMin: 1, WordMax: 1000, SubjectFormat: "x", Structure: DefaultStructure()}
	if fs := Lint(body, nil, tight); codes(fs)["word_count"] {
		t.Errorf("24 words flagged under a 1-1000 window: %+v", fs)
	}
	narrow := Config{WordMin: 100, WordMax: 200, SubjectFormat: "x", Structure: DefaultStructure()}
	if fs := Lint(body, nil, narrow); !codes(fs)["word_count"] {
		t.Errorf("24 words NOT flagged under a 100-200 window")
	}
}

// contains reports whether xs contains s.
func contains(xs []string, s string) bool {
	for _, x := range xs {
		if x == s {
			return true
		}
	}
	return false
}

// openTestDB opens a throwaway migrated DB.
func openTestDB(t *testing.T) *store.DB {
	t.Helper()
	db, err := store.Open(filepath.Join(t.TempDir(), "cfg.db"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	return db
}
