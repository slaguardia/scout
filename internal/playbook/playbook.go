// Package playbook loads the verdict agent's operating manual.
//
// The playbook is the *how* of triage — procedural instructions for making
// the call (handling ambiguity, weak signal, tie-breaking) — as opposed to
// taste (the *what*: the user's preferences) and the brain (memory).
//
// It lives in the DB (a singleton row) so a dashboard save can't clobber it and
// git never touches it, same as the outreach template. An empty/absent row
// means "use the compiled-in default" (DefaultPlaybook, embedded below). The
// playbook only augments the system prompt; it never changes the hard
// JSON-output contract (that stays in Go).
package playbook

import (
	_ "embed"
	"strings"

	"github.com/slaguardia/scout/internal/store"
)

// DefaultPlaybook is the compiled-in starting playbook (the shipped judging
// procedure), used until the user saves their own. Kept as a reviewable
// markdown file and embedded so the default is a single source of truth.
//
//go:embed default.md
var DefaultPlaybook string

// ContentOrDefault returns the user's saved playbook, or the compiled-in default
// when none is saved (or on a read error — scoring never blocks on this).
func ContentOrDefault(db *store.DB) string {
	if db != nil {
		if c, err := db.GetPlaybook(); err == nil && strings.TrimSpace(c) != "" {
			return strings.TrimSpace(c)
		}
	}
	return strings.TrimSpace(DefaultPlaybook)
}
