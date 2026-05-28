// Package playbook loads the verdict agent's operating manual.
//
// The playbook is the *how* of triage — procedural instructions for making
// the call (handling ambiguity, weak signal, tie-breaking) — as opposed to
// taste (the *what*: Alex's preferences) and the brain (memory). It's a
// repo-local, version-controlled markdown file, editable without recompiling.
//
// A missing playbook file is not an error: the verdict stage falls back to a
// built-in rubric. The playbook only augments the system prompt; it never
// changes the hard JSON-output contract (that stays in Go).
package playbook

import (
	"errors"
	"fmt"
	"io/fs"
	"os"
	"strings"
)

// Load reads the playbook markdown at path. Returns "" (no error) if the file
// doesn't exist, so callers can treat the playbook as optional.
func Load(path string) (string, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return "", nil
		}
		return "", fmt.Errorf("read playbook: %w", err)
	}
	return strings.TrimSpace(string(b)), nil
}
