package brainbot

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/slaguardia/scout/internal/store"
)

// CaptureVerdicts writes every pending verdict back to the brain via /capture
// as a natural-language sentence, then records it as sent (keyed on the
// decision content, so re-running with no verdict changes is a no-op). Shared
// by `scout episodes` (CLI) and the UI episodes job.
//
// capture is slow (decompose + extract, ~seconds, ~1¢ each), so this ships
// sequentially and emits one progress line per verdict. emit may be nil.
func CaptureVerdicts(ctx context.Context, db *store.DB, c *Client, emit func(string)) (sent, failed int, err error) {
	if emit == nil {
		emit = func(string) {}
	}
	if !c.Enabled() {
		return 0, 0, errors.New("brainbot: not configured")
	}
	pending, err := db.PendingEpisodes()
	if err != nil {
		return 0, 0, err
	}
	if len(pending) == 0 {
		emit("no pending verdicts")
		return 0, 0, nil
	}
	for _, v := range pending {
		if ctx.Err() != nil {
			return sent, failed, ctx.Err()
		}
		name, domain, e := db.GetCompanyName(v.CompanyID)
		if e != nil {
			failed++
			emit(fmt.Sprintf("lookup %d failed: %v", v.CompanyID, e))
			continue
		}
		emit(fmt.Sprintf("capturing %s (%s)…", name, v.Verdict))
		text := VerdictSentence(name, domain, v.Verdict, v.Reason, verdictDate(v))
		if e := c.Capture(ctx, text); e != nil {
			failed++
			emit(fmt.Sprintf("capture %s failed: %v", name, e))
			continue
		}
		if e := db.MarkEpisodeSent(v.CompanyID, store.VerdictHash(v.Verdict, v.Reason)); e != nil {
			failed++
			emit(fmt.Sprintf("mark %s failed: %v", name, e))
			continue
		}
		sent++
		emit(fmt.Sprintf("captured %s (%s)", name, v.Verdict))
	}
	return sent, failed, nil
}

// VerdictSentence renders a verdict as third-person natural language naming
// Alex, so the brain attributes the memory to him. e.g.
//
//	Alex's scout tool verdicted Acme (acme.com) as "no" on 2026-05-28. Reason: crypto wallet (excluded).
func VerdictSentence(name, domain, verdict, reason, date string) string {
	var b strings.Builder
	fmt.Fprintf(&b, "Alex's scout tool verdicted %s", name)
	if domain != "" {
		fmt.Fprintf(&b, " (%s)", domain)
	}
	fmt.Fprintf(&b, " as %q on %s.", verdict, date)
	if r := strings.TrimSpace(reason); r != "" {
		fmt.Fprintf(&b, " Reason: %s", r)
		if !strings.HasSuffix(r, ".") {
			b.WriteString(".")
		}
	}
	return b.String()
}

// verdictDate is the verdict's scored date (YYYY-MM-DD), or today if unknown.
func verdictDate(v store.Verdict) string {
	if v.ScoredAt.Valid && len(v.ScoredAt.String) >= 10 {
		return v.ScoredAt.String[:10]
	}
	return time.Now().UTC().Format("2006-01-02")
}
