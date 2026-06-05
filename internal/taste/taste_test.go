package taste

import "testing"

func TestFromBrain(t *testing.T) {
	text := "  The user wants AI infra roles.\n\nHard no: crypto, legal tech.  "
	b := FromBrain(text, "brain:brief@http://127.0.0.1:8100")
	if b.Text != "The user wants AI infra roles.\n\nHard no: crypto, legal tech." {
		t.Fatalf("Text not trimmed: %q", b.Text)
	}
	if b.Source != "brain:brief@http://127.0.0.1:8100" {
		t.Fatalf("Source = %q", b.Source)
	}
	if b.Version != Hash(b.Text) {
		t.Fatalf("Version = %q, want Hash(text) = %q", b.Version, Hash(b.Text))
	}
}

func TestFromBrainVersionTracksContent(t *testing.T) {
	// When the brain learns something new, the text changes → version changes
	// → verdicts re-score. This is the intended behavior.
	a := FromBrain("criteria v1", "brain")
	b := FromBrain("criteria v1 plus a new rule", "brain")
	if a.Version == b.Version {
		t.Fatal("different criteria must produce different versions")
	}
}
