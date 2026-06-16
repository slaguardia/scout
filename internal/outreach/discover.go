package outreach

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/slaguardia/scout/internal/anthropic"
	"github.com/slaguardia/scout/internal/brainbot"
	"github.com/slaguardia/scout/internal/store"
)

// A knowledge Need is a general, method-level question the outreach pipeline
// asks of the brain — NOT an opinion about the user. Discovery maps each need to
// the brain pages that answer it; the pages' whole text is the knowledge the
// fill step and honesty checker reason over.
type Need struct {
	Key  string // stored need key: "experience" | "voice" | "logistics"
	Hard bool   // experience is HARD (empty → drafting blocked); voice/logistics degrade
	Desc string // what kind of page satisfies this need (for the discovery agent)
}

// KnowledgeNeeds is the fixed list. Experience is hard because it is the honesty
// checker's ground truth; voice and logistics degrade gracefully (a less-voiced
// email; biographical facts fall back to fill-in placeholders).
var KnowledgeNeeds = []Need{
	{Key: "experience", Hard: true, Desc: "the user's professional experience: roles, durations, projects, team scope, skills, achievements, credentials, clearances"},
	{Key: "voice", Hard: false, Desc: "the user's writing voice, tone, and style"},
	{Key: "logistics", Hard: false, Desc: "the user's application logistics / biographical facts: current location (city, state, country), work authorization or visa status, citizenship, availability or start date, salary or compensation expectations, willingness to relocate, and portfolio/profile links"},
}

// ErrNoExperience is returned by Discover when no brain page is relevant to the
// (hard) experience need — outreach cannot run without an experience ground
// truth, so this is a loud, blocking error, never a silent empty bundle.
var ErrNoExperience = errors.New("no brain page relevant to experience — outreach needs an experience source; add experience to the brain and re-discover")

// SourcePage is one resolved page in a DiscoveryResult (id + title, no content).
type SourcePage struct {
	PageID string `json:"page_id"`
	Title  string `json:"title"`
}

// NeedResult reports what discovery resolved for one need.
type NeedResult struct {
	Need  string       `json:"need"`
	Hard  bool         `json:"hard"`
	Pages []SourcePage `json:"pages"`
}

// DiscoveryResult is the full outcome of a discovery pass.
type DiscoveryResult struct {
	Needs []NeedResult `json:"needs"`
}

// discoverySystem instructs the (cheap) discovery model to map needs to brain
// page ids — and, critically, to return EMPTY for a need with no relevant page
// rather than reaching for an off-topic one.
const discoverySystem = `You select which of a user's knowledge-base pages are relevant to job-search OUTREACH, grouped by NEED.

You are given the page MAP (one line per page: id | title | path) and a list of NEEDS. For each need, return the ids of the pages whose title and path indicate they genuinely cover that need.

CRITICAL RULE: Walk the whole map. If NO page is genuinely relevant to a need, return an EMPTY list for that need. NEVER pick an off-topic page just to avoid returning empty — a wrong "experience" page silently corrupts every email and defeats the honesty check. Returning [] for a need the knowledge base does not cover is the correct, expected answer.

Return ONLY a JSON object with exactly one key per need, each an array of page ids (possibly empty), e.g. {"experience": ["id1","id2"], "voice": [], "logistics": []}.`

// Discover runs the discovery pass: read the brain /map, have the model select
// pages per need, whole-fetch each selected page via /doc, and cache the result
// in outreach_sources (replacing the prior set per need). It persists everything
// it finds, then returns ErrNoExperience if the hard experience need came back
// empty (the caller surfaces it; the draft gate independently enforces it).
func Discover(ctx context.Context, brain *brainbot.Client, client *anthropic.Client, db *store.DB, model string) (DiscoveryResult, error) {
	if model == "" {
		model = anthropic.DefaultModel // Haiku — discovery is cheap title-matching
	}
	m, err := brain.Map(ctx)
	if err != nil {
		return DiscoveryResult{}, fmt.Errorf("brain map: %w", err)
	}
	valid := make(map[string]brainbot.MapSource, len(m.Sources))
	var listing strings.Builder
	for _, s := range m.Sources {
		valid[s.ID] = s
		fmt.Fprintf(&listing, "%s | %s | %s\n", s.ID, s.Title, s.Path)
	}

	var needLines strings.Builder
	for _, n := range KnowledgeNeeds {
		fmt.Fprintf(&needLines, "- %s: %s\n", n.Key, n.Desc)
	}
	user := fmt.Sprintf("NEEDS:\n%s\nMAP (id | title | path):\n%s", needLines.String(), listing.String())

	resp, err := client.Send(ctx, anthropic.Request{
		Model:     model,
		System:    discoverySystem,
		MaxTokens: 1000,
		Messages:  []anthropic.Message{{Role: "user", Content: user}},
	})
	if err != nil {
		return DiscoveryResult{}, fmt.Errorf("discovery model: %w", err)
	}
	cleaned, perr := extractJSONObject(resp.Text())
	if perr != nil {
		return DiscoveryResult{}, fmt.Errorf("parse discovery JSON: %w (raw=%q)", perr, trunc(resp.Text(), 200))
	}
	var picks map[string][]string
	if err := json.Unmarshal([]byte(cleaned), &picks); err != nil {
		return DiscoveryResult{}, fmt.Errorf("decode discovery JSON: %w", err)
	}

	var result DiscoveryResult
	for _, need := range KnowledgeNeeds {
		var sources []store.OutreachSource
		var pages []SourcePage
		seen := map[string]bool{}
		for _, id := range picks[need.Key] {
			_, ok := valid[id] // ignore ids the model invented
			if !ok || seen[id] {
				continue
			}
			seen[id] = true
			doc, derr := brain.Doc(ctx, id)
			if derr != nil {
				// A page the map listed but /doc can't serve: skip it loudly in
				// logs (caller has none here) rather than fail the whole pass.
				continue
			}
			sources = append(sources, store.OutreachSource{
				Need: need.Key, PageID: id, Title: doc.Title, Content: doc.Text, Version: doc.Version,
			})
			pages = append(pages, SourcePage{PageID: id, Title: doc.Title})
		}
		if err := db.ReplaceOutreachSources(need.Key, sources); err != nil {
			return DiscoveryResult{}, fmt.Errorf("cache %s sources: %w", need.Key, err)
		}
		result.Needs = append(result.Needs, NeedResult{Need: need.Key, Hard: need.Hard, Pages: pages})
	}

	for _, n := range result.Needs {
		if n.Hard && len(n.Pages) == 0 {
			return result, ErrNoExperience
		}
	}
	return result, nil
}

// FetchSource whole-fetches one brain page for a need — the manual "add this
// page" override behind the discovery UI.
func FetchSource(ctx context.Context, brain *brainbot.Client, need, pageID string) (store.OutreachSource, error) {
	doc, err := brain.Doc(ctx, pageID)
	if err != nil {
		return store.OutreachSource{}, err
	}
	return store.OutreachSource{
		Need: need, PageID: pageID, Title: doc.Title, Content: doc.Text, Version: doc.Version,
	}, nil
}
