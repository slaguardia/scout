// Package taste loads the criteria block (what Alex wants) fed to the verdict
// stage.
//
// The primary source is the brain (the concatenated episode bodies from
// /profile); see FromBrain. A local markdown file (taste.md) is the offline
// fallback for when the brain is unreachable; see LoadFile. Version is the
// first 12 hex chars of sha256(content) — it changes whenever the criteria
// change (brain learns something, or the file is edited), which re-scores
// cached verdicts on the next run.
package taste

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"os"
	"strings"
)

// Block is the resolved criteria context.
type Block struct {
	Text    string // raw criteria block fed to the LLM
	Version string // short hash for cache keys
	Source  string // 'brain:profile@<url>' (primary) or 'file:taste.md' (fallback)
}

// FromBrain builds a criteria Block from brain-sourced text — the concatenated
// faithful episode bodies (the complete record carrying Alex's gates and
// exclusions), NOT a join of extracted fact strings. source is a label like
// "brain:profile@http://127.0.0.1:8100".
func FromBrain(text, source string) *Block {
	text = strings.TrimSpace(text)
	return &Block{
		Text:    text,
		Version: Hash(text),
		Source:  source,
	}
}

// LoadFile reads taste from a local file.
func LoadFile(path string) (*Block, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read taste file: %w", err)
	}
	text := strings.TrimSpace(string(b))
	return &Block{
		Text:    text,
		Version: Hash(text),
		Source:  "file:" + path,
	}, nil
}

// Hash returns the canonical taste_version for a piece of text.
func Hash(s string) string {
	sum := sha256.Sum256([]byte(strings.TrimSpace(s)))
	return hex.EncodeToString(sum[:])[:12]
}
