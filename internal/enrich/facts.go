package enrich

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
	"time"

	"github.com/slaguardia/scout/internal/anthropic"
	"github.com/slaguardia/scout/internal/store"
)

// Fact extraction: an optional one-shot LLM pass over the fetched page text
// that fills in company columns still blank after ingest — the name (when it's
// just the domain placeholder from a bare "Add by website"), vertical,
// location, headcount, and funding stage. Fill-only-blanks: a value the CSV or
// the user already supplied is never overwritten (BackfillCompanyBlanks
// guards per column; the name only replaces the placeholder). Runs only when
// the Enricher has an Anthropic client and the fetch came back "ok".

// factsContract is the extraction prompt. Like the verdict hardContract, the
// JSON shape is load-bearing — parseFacts depends on it.
const factsContract = `You extract company facts from website text. Reply ONLY with valid JSON, no preamble, no markdown fences, exactly these fields:
  {"name": "", "vertical": "", "location": "", "headcount": 0, "funding_stage": ""}
Rules:
  - name: the company's official name as the site states it. "" if unclear.
  - vertical: 1-3 short industry tags, comma-separated (e.g. "AI, Developer Tools"). "" if unclear.
  - location: HQ city/region if stated (e.g. "San Francisco, CA"). "" if not stated.
  - headcount: integer employee count ONLY if the page states one; otherwise 0. Never guess.
  - funding_stage: e.g. "Seed", "Series A" ONLY if the page states it; otherwise "".
Use "" / 0 for anything the text doesn't actually say. Do not infer from vibes.`

type facts struct {
	Name         string `json:"name"`
	Vertical     string `json:"vertical"`
	Location     string `json:"location"`
	Headcount    int64  `json:"headcount"`
	FundingStage string `json:"funding_stage"`
}

var reFactsJSON = regexp.MustCompile(`(?s)\{.*\}`)

func parseFacts(s string) (*facts, error) {
	s = strings.TrimSpace(s)
	candidates := []string{s}
	if m := reFactsJSON.FindString(s); m != "" {
		candidates = append([]string{m}, candidates...)
	}
	for _, c := range candidates {
		var f facts
		if err := json.Unmarshal([]byte(c), &f); err == nil {
			f.Name = strings.TrimSpace(f.Name)
			f.Vertical = strings.TrimSpace(f.Vertical)
			f.Location = strings.TrimSpace(f.Location)
			f.FundingStage = strings.TrimSpace(f.FundingStage)
			if f.Headcount < 0 {
				f.Headcount = 0
			}
			return &f, nil
		}
	}
	return nil, fmt.Errorf("no valid facts JSON")
}

// namePlaceholder reports whether the stored name is still the bare-domain
// default a name-less manual add gets (see ingest.AddManual).
func namePlaceholder(name, domain string) bool {
	return name == "" || strings.EqualFold(strings.TrimSpace(name), domain)
}

// fillFacts runs the extraction call for one fetched company and writes any
// extracted values into the blank columns. Best-effort: an API or parse error
// is reported on the progress stream but never fails the enrichment row.
// Returns true if anything was written.
func (e *Enricher) fillFacts(ctx context.Context, t store.EnrichmentTarget, pageText string) bool {
	needName := namePlaceholder(t.Name, t.Domain)
	needOther := t.Headcount == 0 || t.FundingStage == "" || t.Location == "" || t.Vertical == ""
	if (!needName && !needOther) || pageText == "" {
		return false
	}

	callCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	resp, err := e.LLM.Send(callCtx, anthropic.Request{
		Model:     e.Model,
		System:    factsContract,
		MaxTokens: 256,
		Messages:  []anthropic.Message{{Role: "user", Content: pageText}},
	})
	if err != nil {
		e.emit(fmt.Sprintf("facts %s — extract failed: %v", t.Name, err))
		return false
	}
	f, err := parseFacts(resp.Text())
	if err != nil {
		e.emit(fmt.Sprintf("facts %s — %v", t.Name, err))
		return false
	}

	filled := false
	if needName && f.Name != "" {
		ok, err := e.DB.FillCompanyNamePlaceholder(t.CompanyID, f.Name)
		if err != nil {
			e.emit(fmt.Sprintf("facts %s — name write failed: %v", t.Name, err))
		}
		filled = filled || ok
	}
	if needOther {
		blanks := store.Company{
			FundingStage: store.NullString(f.FundingStage),
			Location:     store.NullString(f.Location),
			Vertical:     store.NullString(f.Vertical),
		}
		if f.Headcount > 0 {
			blanks.Headcount = sql.NullInt64{Int64: f.Headcount, Valid: true}
		}
		wrote := (t.Headcount == 0 && f.Headcount > 0) ||
			(t.FundingStage == "" && f.FundingStage != "") ||
			(t.Location == "" && f.Location != "") ||
			(t.Vertical == "" && f.Vertical != "")
		if wrote {
			if err := e.DB.BackfillCompanyBlanks(t.CompanyID, blanks); err != nil {
				e.emit(fmt.Sprintf("facts %s — backfill failed: %v", t.Name, err))
				wrote = false
			}
		}
		filled = filled || wrote
	}
	return filled
}
