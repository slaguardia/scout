// Package taste loads the narrative taste block used by the verdict stage.
//
// Source of truth at M3 is a local markdown file (taste.md). At M5 this is
// replaced by a live fetch from brainbot. Version is the first 12 hex chars of
// sha256(content), used to invalidate cached verdicts when taste changes.
package taste

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"os"
	"strings"
)

// Block is the resolved taste context.
type Block struct {
	Text    string // raw narrative block fed to the LLM
	Version string // short hash for cache keys
	Source  string // 'file:taste.md' or 'brainbot:<url>'
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
