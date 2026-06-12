package outreach

import (
	_ "embed"
	"strings"

	"github.com/slaguardia/scout/internal/store"
)

// The outreach writing doctrine is the user's editable METHOD — what makes a
// hook deep instead of shallow, show-don't-tell, the recitation test, the ask,
// the length target. It is spliced into the fill prompt (how to write) and the
// judge prompt (the rubric drafts are graded against). The mechanics stay in
// Go regardless of what it says: the honesty check, the never-invent rule, the
// no-send path, and the JSON contracts.
//
// It lives in the DB (a singleton row) so a dashboard save can't clobber it and
// git never touches it, exactly like the playbook and the email template.

// DefaultDoctrine is the compiled-in starting doctrine, used until the user
// saves their own. Kept as a reviewable markdown file and embedded so the
// default is a single source of truth.
//
//go:embed doctrine_default.md
var DefaultDoctrine string

// DoctrineOrDefault returns the user's saved doctrine, or the compiled-in
// default when none is saved (or on a read error — a draft never blocks on this).
func DoctrineOrDefault(db *store.DB) string {
	if db != nil {
		if c, err := db.GetOutreachDoctrine(); err == nil && strings.TrimSpace(c) != "" {
			return strings.TrimSpace(c)
		}
	}
	return strings.TrimSpace(DefaultDoctrine)
}
