// Package web serves the triage UI on localhost.
//
// An embedded HTML page plus JSON endpoints. Beyond the read/triage surface
// (companies, detail, stats, brain proxy) it also drives the pipeline:
// /api/run/* and /api/ingest start jobs via an in-process runner, /api/jobs/*
// stream and cancel them, /api/runs lists durable history, and /api/taste &
// /api/playbook read/write the local instruction files.
//
// Concurrency note: taste/playbook are guarded by mu because /api/stats reads
// them while a taste/playbook PUT can reload them.
package web

import (
	"context"
	"database/sql"
	"embed"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"mime"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/slaguardia/scout/internal/anthropic"
	"github.com/slaguardia/scout/internal/brainbot"
	"github.com/slaguardia/scout/internal/chat"
	"github.com/slaguardia/scout/internal/criteria"
	"github.com/slaguardia/scout/internal/ingest"
	"github.com/slaguardia/scout/internal/jobs"
	"github.com/slaguardia/scout/internal/playbook"
	"github.com/slaguardia/scout/internal/store"
	"github.com/slaguardia/scout/internal/taste"
)

//go:embed all:dist
var distFS embed.FS

func init() {
	// Go's default MIME table has no entry for .webmanifest, so the embedded PWA
	// manifest would be served as text/plain. Register the correct type so
	// http.ServeContent/FileServerFS label it application/manifest+json — a
	// cleaner install signal (browsers also accept it via <link rel=manifest>).
	_ = mime.AddExtensionType(".webmanifest", "application/manifest+json")
}

// Server holds dependencies. Brainbot is optional. The Runner + paths power
// the control surface; when Runner is nil the run/ingest/editor routes 503.
type Server struct {
	DB       *store.DB
	Brainbot *brainbot.Client   // optional; used for health probes + the profile panel
	Resolver *criteria.Resolver // resolves criteria (cached brain profile → taste.md)
	Runner   *jobs.Runner       // optional; nil disables the control surface
	Outreach OutreachRunner     // optional; nil disables draft starts (503)
	Answers  AnswersRunner      // optional; nil disables answer generation (503)
	Chat     *chat.Engine       // optional; nil disables chat (412 on message POST)

	// Stage construction inputs (used by the run handlers).
	Anthropic    *anthropic.Client
	TasteMDPath  string
	IngestSource string

	// KeyVerifier validates an Anthropic key before the dashboard stores it; nil
	// uses anthropic.Verify (one live auth-only call). Tests inject a stub.
	KeyVerifier func(ctx context.Context, key string) error

	mu           sync.RWMutex
	taste        *taste.Block // current; recomputed by ReloadTaste
	playbookText string       // current playbook text

	chat chatHub // per-thread in-flight chat turns (kick + subscribe)
}

// reloadTasteTimeout bounds a synchronous ReloadTaste — long enough for the warm
// Tier 0 path (one /changes probe) but short enough not to hang startup / an
// editor PUT behind a slow brain. The cascade falls back to the cached brief or
// taste.md when it elapses. The BACKGROUND reconciler needs longer (a real
// Tier 2 re-distill is two LLM calls), so it calls ReloadTasteCtx directly with
// its own generous deadline rather than going through here.
const reloadTasteTimeout = 15 * time.Second

// ReloadTaste resolves the criteria block (cached brain profile → taste.md, via
// the Resolver) and folds the playbook into the version (matching `scout
// verdict`). Safe to call concurrently with reads. When no source yields
// criteria, taste is left nil. Called at startup, after every editor PUT, and
// after a manual profile refresh — all warm-path, so the 15s cap suffices.
func (s *Server) ReloadTaste() {
	ctx, cancel := context.WithTimeout(context.Background(), reloadTasteTimeout)
	defer cancel()
	s.ReloadTasteCtx(ctx)
}

// ReloadTasteCtx is ReloadTaste with a caller-supplied deadline, so the
// background reconciler can allow a full re-distill (~30–40s) where the
// synchronous callers cap at reloadTasteTimeout. The ctx bounds only the brain
// resolve; the playbook fold and block swap are local and always run.
func (s *Server) ReloadTasteCtx(ctx context.Context) {
	var tb *taste.Block
	if s.Resolver != nil {
		tb, _ = s.Resolver.Resolve(ctx) // resolver already falls back to taste.md
	}
	if tb == nil { // no resolver (e.g. tests) → load taste.md directly
		if t, err := taste.LoadFile(s.TasteMDPath); err == nil {
			tb = t
		}
	}
	pb := playbook.ContentOrDefault(s.DB)
	if tb != nil && pb != "" {
		// Fold the playbook into the version: it stamps each new verdict with the
		// exact criteria (brief basis + playbook) it was scored under, recorded in
		// the decision trail. It no longer gates re-scoring.
		tb.Version = taste.Hash(pb + "\n---taste---\n" + tb.Version)
		tb.Source = tb.Source + " + playbook"
	}
	s.mu.Lock()
	s.taste = tb
	s.playbookText = pb
	s.mu.Unlock()
}

func (s *Server) currentTaste() *taste.Block {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.taste
}

func (s *Server) currentPlaybook() string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.playbookText
}

// CurrentTasteVersion returns the effective (playbook-folded) taste version,
// or "" if no taste is loaded. Exported for the run-history hook.
func (s *Server) CurrentTasteVersion() string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if s.taste == nil {
		return ""
	}
	return s.taste.Version
}

// Handler returns the http.Handler for the UI.
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/", s.handleIndex)
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) { fmt.Fprintln(w, "ok") })
	mux.HandleFunc("/api/me", s.handleMe) // signed-in identity (edge header), {} when none

	// read / triage
	mux.HandleFunc("/api/companies", s.handleCompanies)
	mux.HandleFunc("/api/companies/", s.handleCompany)
	mux.HandleFunc("/api/postings", s.handlePostings)                    // all postings across companies (jobs view)
	mux.HandleFunc("/api/postings/", s.handlePosting)                    // PUT {id}: application-lifecycle update
	mux.HandleFunc("/api/outreach-statuses", s.handleOutreachStatuses)   // GET/PUT the configurable outreach-status vocabulary
	mux.HandleFunc("/api/application-stages", s.handleApplicationStages) // GET/PUT the configurable application-stage vocabulary
	mux.HandleFunc("/api/capture", s.handleCapture)                      // POST: link-capture agent pass
	mux.HandleFunc("/api/outreach-template", s.handleOutreachTemplate)   // GET/PUT the scout-local email template (see editor.go)
	mux.HandleFunc("/api/outreach-prompts", s.handleOutreachPromptsList) // GET the editable pipeline stages (see editor.go)
	mux.HandleFunc("/api/outreach-prompts/", s.handleOutreachPrompt)     // GET/PUT one stage's prompt + on/off (see editor.go)
	mux.HandleFunc("/api/outreach/", s.handleOutreach)                   // sources / refresh / drafts (see outreach.go)
	mux.HandleFunc("/api/answers/", s.handleAnswer)                      // PUT {id}: edit / regenerate one answer (see answers.go)
	mux.HandleFunc("/api/chat/threads", s.handleChatThreads)             // GET open-or-create a (scope,scope_id) thread
	mux.HandleFunc("/api/chat/", s.handleChat)                           // POST {thread}/message, GET {thread}/stream
	mux.HandleFunc("/api/stats", s.handleStats)
	mux.HandleFunc("/api/facets", s.handleFacets) // distinct stages/verticals for the Add-company form

	// control surface
	mux.HandleFunc("/api/run/", s.handleRun)      // POST /api/run/{stage}
	mux.HandleFunc("/api/jobs/", s.handleJob)     // GET {id}/stream, POST {id}/cancel
	mux.HandleFunc("/api/runs", s.handleRuns)     // GET history
	mux.HandleFunc("/api/meta", s.handleMeta)     // GET capabilities
	mux.HandleFunc("/api/ingest", s.handleIngest) // POST multipart CSV

	// brain profile (read-only view + manual refresh of the cached criteria)
	mux.HandleFunc("/api/profile", s.handleProfile)                // GET cached profile
	mux.HandleFunc("/api/profile/refresh", s.handleProfileRefresh) // POST refetch

	// editor (local file + DB singletons — never the brain)
	mux.HandleFunc("/api/taste", s.handleTaste)              // taste.md narrative fallback (file)
	mux.HandleFunc("/api/taste-filter", s.handleTasteFilter) // structured pre-filter rules (DB singleton)
	mux.HandleFunc("/api/playbook", s.handlePlaybook)

	// integrations (dashboard-configurable secrets, stored in scout's SQLite)
	mux.HandleFunc("/api/integrations/anthropic", s.handleAnthropicKey) // GET/PUT/DELETE the Anthropic key (see integrations.go)

	return mux
}

// handleIndex serves the built PWA from the embedded dist/ tree. Existing files
// (the hashed JS/CSS assets, manifest, sw.js, icons, index.html) are served
// directly; any other non-/api/ path falls back to dist/index.html so the
// client-side hash router owns navigation (SPA fallback). The /api/* and
// /healthz routes are matched by more-specific mux patterns and never reach
// here. The dist tree is produced by `cd web && npm run build` and committed so
// go:embed compiles on a fresh checkout.
func (s *Server) handleIndex(w http.ResponseWriter, r *http.Request) {
	sub, err := fs.Sub(distFS, "dist")
	if err != nil { // misbuilt embed — should never happen if dist/ is present
		http.Error(w, "ui assets unavailable", http.StatusInternalServerError)
		return
	}
	// Defense-in-depth: never serve the SPA shell for an /api path (those are
	// handled by their own mux patterns; this guards a stray fall-through).
	if strings.HasPrefix(r.URL.Path, "/api/") {
		http.NotFound(w, r)
		return
	}
	clean := strings.TrimPrefix(r.URL.Path, "/")
	if clean == "" {
		serveDistFile(w, r, sub, "index.html")
		return
	}
	if f, err := sub.Open(clean); err == nil {
		f.Close()
		http.FileServerFS(sub).ServeHTTP(w, r)
		return
	}
	// Unknown path that isn't a real asset → SPA fallback to the shell.
	serveDistFile(w, r, sub, "index.html")
}

// serveDistFile writes one file from the embedded dist sub-FS, letting
// http.ServeContent set the Content-Type and handle range/conditional requests.
func serveDistFile(w http.ResponseWriter, r *http.Request, sub fs.FS, name string) {
	f, err := sub.Open(name)
	if err != nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	defer f.Close()
	data, err := io.ReadAll(f)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	info, _ := f.Stat()
	var modtime time.Time
	if info != nil {
		modtime = info.ModTime()
	}
	http.ServeContent(w, r, name, modtime, strings.NewReader(string(data)))
}

func (s *Server) handleCompanies(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		rows, err := s.DB.TriageRows()
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"rows": rows, "count": len(rows)})
	case http.MethodPost:
		s.handleAddCompany(w, r)
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

// handleAddCompany adds one hand-entered company (source "manual"). POST
// /api/companies with a JSON body — website is the only required field. It does
// not need the job Runner (a direct upsert, like adding a posting), so it works
// whenever the server is up. The created/updated id and a `created` flag come
// back so the UI can refresh and, on a domain collision with an existing row,
// tell the user it updated rather than inserted.
func (s *Server) handleAddCompany(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Website      string `json:"website"`
		Name         string `json:"name"`
		Headcount    string `json:"headcount"`
		FundingStage string `json:"funding_stage"`
		Location     string `json:"location"`
		Vertical     string `json:"vertical"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 16<<10)).Decode(&body); err != nil {
		http.Error(w, "invalid JSON: "+err.Error(), http.StatusBadRequest)
		return
	}
	id, err := ingest.AddManual(s.DB, ingest.ManualCompany{
		Website:      body.Website,
		Name:         body.Name,
		Headcount:    body.Headcount,
		FundingStage: body.FundingStage,
		Location:     body.Location,
		Vertical:     body.Vertical,
	})
	switch {
	case errors.Is(err, ingest.ErrCompanyExists): // already present — don't overwrite
		http.Error(w, alreadyInListMsg(s.DB, id), http.StatusConflict)
		return
	case err != nil && strings.HasPrefix(err.Error(), "website "): // missing/unusable website
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	case err != nil:
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"company_id": id})
}

// handleFacets returns the distinct funding stages and verticals currently in
// the set, to populate the Add-company dropdowns. Stages are whole values;
// verticals come from store.VerticalTags — composite Crunchbase "Industries"
// cells split into individual deduped tags — so the multi-select offers
// individual tags. GET /api/facets.
func (s *Server) handleFacets(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	stages, err := s.DB.DistinctValues("funding_stage")
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	verticals, err := s.DB.VerticalTags()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"funding_stages": stages,
		"verticals":      verticals,
	})
}

// alreadyInListMsg builds the 409 body for a duplicate manual add, naming the
// company already present so the user knows what they collided with.
func alreadyInListMsg(db *store.DB, id string) string {
	name, domain, err := db.GetCompanyName(id)
	if err != nil || name == "" {
		return "company already in the list"
	}
	if domain != "" {
		return fmt.Sprintf("%s (%s) is already in the list", name, domain)
	}
	return fmt.Sprintf("%s is already in the list", name)
}

func (s *Server) handleCompany(w http.ResponseWriter, r *http.Request) {
	rest := strings.TrimPrefix(r.URL.Path, "/api/companies/")
	parts := strings.Split(rest, "/")
	if len(parts) == 0 || parts[0] == "" {
		http.NotFound(w, r)
		return
	}
	id := parts[0] // company UUID; an unknown id falls through to NotFound at the store
	switch {
	case len(parts) == 1:
		s.handleCompanyDetail(w, r, id)
	case len(parts) == 2 && parts[1] == "postings":
		s.handleCompanyPostings(w, r, id)
	case len(parts) == 2 && parts[1] == "trace":
		s.handleCompanyTrace(w, r, id)
	case len(parts) == 2 && parts[1] == "verdict":
		s.handleCompanyVerdict(w, r, id)
	case len(parts) == 2 && parts[1] == "flagged":
		s.handleCompanyFlagged(w, r, id)
	case len(parts) == 2 && parts[1] == "reviewed":
		s.handleCompanyReviewed(w, r, id)
	case len(parts) == 2 && parts[1] == "domain":
		s.handleCompanyDomain(w, r, id)
	case len(parts) == 2 && parts[1] == "notes":
		s.handleCompanyNotes(w, r, id)
	default:
		http.NotFound(w, r)
	}
}

// handleCompanyReviewed stamps the company as reviewed now. POST (or PUT)
// /api/companies/:id/reviewed — no body needed; every call moves reviewed_at
// forward so the table's last-reviewed sort cycles companies oldest-first.
// Returns the refreshed detail so the client can re-render.
func (s *Server) handleCompanyReviewed(w http.ResponseWriter, r *http.Request, id string) {
	if r.Method != http.MethodPut && r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if err := s.DB.TouchReviewed(id); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			http.NotFound(w, r)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	d, err := s.DB.GetCompanyDetail(id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if d == nil {
		http.NotFound(w, r)
		return
	}
	writeJSON(w, http.StatusOK, d)
}

// handleCompanyFlagged sets the hand-set bookmark. PUT
// /api/companies/:id/flagged with {"flagged":bool}. The flag is orthogonal to
// the verdict and filterable in the table. Returns the refreshed detail so the
// client can re-render.
func (s *Server) handleCompanyFlagged(w http.ResponseWriter, r *http.Request, id string) {
	if r.Method != http.MethodPut && r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		Flagged bool `json:"flagged"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4<<10)).Decode(&body); err != nil {
		http.Error(w, "invalid JSON: "+err.Error(), http.StatusBadRequest)
		return
	}
	if err := s.DB.SetFlagged(id, body.Flagged); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			http.NotFound(w, r)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	d, err := s.DB.GetCompanyDetail(id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if d == nil {
		http.NotFound(w, r)
		return
	}
	writeJSON(w, http.StatusOK, d)
}

// handleCompanyVerdict sets a verdict by hand from the UI. PUT
// /api/companies/:id/verdict with {"verdict":"yes|maybe|no","reason":"…"}. The
// row is stamped model="manual" so the scorer treats it as sticky (a normal
// verdict run leaves it; only --force re-scores over it). A decision-trail row
// is appended so the override shows in the company's timeline. Returns the
// refreshed company detail so the client can re-render the pane.
func (s *Server) handleCompanyVerdict(w http.ResponseWriter, r *http.Request, id string) {
	if r.Method != http.MethodPut && r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		Verdict string `json:"verdict"`
		Reason  string `json:"reason"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 8<<10)).Decode(&body); err != nil {
		http.Error(w, "invalid JSON: "+err.Error(), http.StatusBadRequest)
		return
	}
	v := strings.ToLower(strings.TrimSpace(body.Verdict))
	switch v {
	case "yes", "maybe", "no":
	default:
		http.Error(w, `verdict must be "yes", "maybe", or "no"`, http.StatusBadRequest)
		return
	}
	// Reject an unknown company up front so a bad id can't create a dangling verdict.
	if _, _, err := s.DB.GetCompanyName(id); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			http.NotFound(w, r)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Capture the verdict being replaced (if any) before the upsert, so the
	// durable override log records the from → to delta.
	var fromVerdict string
	if prev, err := s.DB.GetVerdict(id); err == nil && prev != nil {
		fromVerdict = prev.Verdict
	}

	reason := strings.TrimSpace(body.Reason)
	version := s.CurrentTasteVersion() // record the criteria in effect when overridden
	if err := s.DB.UpsertVerdict(store.Verdict{
		CompanyID:    id,
		Verdict:      v,
		Reason:       reason,
		TasteVersion: version,
		Model:        store.ManualModel,
	}); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	// Durable record of intent — the override log the user can mine later. A
	// failure must not sink the write (the verdict is already set), but log it
	// since this table is meant to be a kept record, not a disposable aid.
	if err := s.DB.InsertVerdictOverride(store.VerdictOverride{
		CompanyID:       id,
		FromVerdict:     fromVerdict,
		ToVerdict:       v,
		Reason:          reason,
		CriteriaVersion: version,
	}); err != nil {
		fmt.Fprintf(os.Stderr, "verdict override log %s: %v\n", id, err)
	}
	// Best-effort trail row — mirrors the scorer, so the manual call shows in the
	// timeline alongside the LLM passes. A failure here must not sink the write.
	_ = s.DB.InsertVerdictTrace(store.VerdictTrace{
		CompanyID:      id,
		Model:          store.ManualModel,
		TasteVersion:   version,
		CriteriaSource: "manual override",
		Verdict:        v,
		Reason:         reason,
	})

	d, err := s.DB.GetCompanyDetail(id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if d == nil {
		http.NotFound(w, r)
		return
	}
	writeJSON(w, http.StatusOK, d)
}

// handleCompanyTrace returns the decision trail for one company — the
// append-only record of every verdict scoring pass (what scout asked the brain,
// what came back, and the verdict). GET /api/companies/:id/trace.
func (s *Server) handleCompanyTrace(w http.ResponseWriter, r *http.Request, id string) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	events, err := s.DB.CompanyTrace(id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"events": events})
}

func (s *Server) handleCompanyDetail(w http.ResponseWriter, r *http.Request, id string) {
	switch r.Method {
	case http.MethodGet:
	case http.MethodPut:
		s.handleCompanyEdit(w, r, id)
		return
	case http.MethodDelete:
		s.handleCompanyDelete(w, r, id)
		return
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	d, err := s.DB.GetCompanyDetail(id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if d == nil {
		http.NotFound(w, r)
		return
	}
	writeJSON(w, http.StatusOK, d)
}

// handleCompanyEdit updates the hand-editable company fields. PUT
// /api/companies/:id with {"name","headcount","funding_stage","location",
// "vertical"} — a full replace of the editable set (blanks clear), name
// required. The website/domain is the row's identity and is not editable.
// Returns the refreshed detail so the client can re-render.
func (s *Server) handleCompanyEdit(w http.ResponseWriter, r *http.Request, id string) {
	var body struct {
		Name         string `json:"name"`
		Headcount    string `json:"headcount"`
		FundingStage string `json:"funding_stage"`
		Location     string `json:"location"`
		Vertical     string `json:"vertical"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 16<<10)).Decode(&body); err != nil {
		http.Error(w, "invalid JSON: "+err.Error(), http.StatusBadRequest)
		return
	}
	name := strings.TrimSpace(body.Name)
	if name == "" {
		http.Error(w, "name is required", http.StatusBadRequest)
		return
	}
	err := s.DB.UpdateCompanyEditable(id, store.EditableCompany{
		Name:         name,
		Headcount:    ingest.ParseHeadcount(body.Headcount),
		FundingStage: store.NullString(strings.TrimSpace(body.FundingStage)),
		Location:     store.NullString(strings.TrimSpace(body.Location)),
		Vertical:     store.NullString(strings.TrimSpace(body.Vertical)),
	})
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			http.NotFound(w, r)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	d, err := s.DB.GetCompanyDetail(id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if d == nil {
		http.NotFound(w, r)
		return
	}
	writeJSON(w, http.StatusOK, d)
}

// handleCompanyDelete permanently removes a company and everything attached to
// it. DELETE /api/companies/:id — no body. Cascades to its postings, outreach
// drafts, application answers, enrichment, verdict, and decision trail (see
// store.DeleteCompany); irreversible, no soft-delete. 404 for an unknown id.
// Returns the deleted id so the client can drop it from its caches.
func (s *Server) handleCompanyDelete(w http.ResponseWriter, r *http.Request, id string) {
	if err := s.DB.DeleteCompany(id); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			http.NotFound(w, r)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"company_id": id, "deleted": true})
}

// handleCompanyDomain attaches or changes a company's website/domain. PUT
// /api/companies/:id/domain with {"website":"acme.com"}. Unlike the other
// editable fields, the domain is the row's identity key, so setting it re-keys
// the company (and folds in any pre-existing twin) — see ingest.SetCompanyDomain.
// Returns the refreshed detail under the (possibly new) id so the client can
// re-point its open pane. 409 when a different company already owns the domain.
func (s *Server) handleCompanyDomain(w http.ResponseWriter, r *http.Request, id string) {
	if r.Method != http.MethodPut {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		Website string `json:"website"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 8<<10)).Decode(&body); err != nil {
		http.Error(w, "invalid JSON: "+err.Error(), http.StatusBadRequest)
		return
	}
	newID, err := ingest.SetCompanyDomain(s.DB, id, body.Website)
	switch {
	case err == nil:
	case errors.Is(err, sql.ErrNoRows):
		http.NotFound(w, r)
		return
	case errors.Is(err, store.ErrDomainTaken):
		http.Error(w, err.Error(), http.StatusConflict)
		return
	case strings.HasPrefix(err.Error(), "website "): // validation messages
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	default:
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	d, err := s.DB.GetCompanyDetail(newID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if d == nil {
		http.NotFound(w, r)
		return
	}
	writeJSON(w, http.StatusOK, d)
}

// handleCompanyNotes sets the free-form, human-only notes on a company. PUT
// /api/companies/:id/notes with {"notes":"…"} — a plain column write, the only
// path that ever touches notes (ingest/enrich/verdict never do). Blank clears.
// Returns the refreshed detail so the client can re-render.
func (s *Server) handleCompanyNotes(w http.ResponseWriter, r *http.Request, id string) {
	if r.Method != http.MethodPut {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		Notes string `json:"notes"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64<<10)).Decode(&body); err != nil {
		http.Error(w, "invalid JSON: "+err.Error(), http.StatusBadRequest)
		return
	}
	if err := s.DB.UpdateCompanyNotes(id, strings.TrimSpace(body.Notes)); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			http.NotFound(w, r)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	d, err := s.DB.GetCompanyDetail(id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if d == nil {
		http.NotFound(w, r)
		return
	}
	writeJSON(w, http.StatusOK, d)
}

// handleCompanyPostings adds a job posting link to a company. POST only this
// pass — the list is delivered with the company detail payload. The created
// posting is returned so the client can append it without a refetch.
func (s *Server) handleCompanyPostings(w http.ResponseWriter, r *http.Request, id string) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		URL   string `json:"url"`
		Title string `json:"title"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 8<<10)).Decode(&body); err != nil {
		http.Error(w, "invalid JSON: "+err.Error(), http.StatusBadRequest)
		return
	}
	p, err := s.DB.AddPosting(id, body.URL, body.Title)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			http.NotFound(w, r)
			return
		}
		if strings.HasPrefix(err.Error(), "url ") { // url required / url must be http(s)
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, p)
}

// brainHealthy reports whether the brain is configured AND currently reachable.
// Used to gate UI controls; /api/meta loads once per page load, so the probe
// cost is negligible.
func (s *Server) brainHealthy(parent context.Context) bool {
	if s.Brainbot == nil || !s.Brainbot.Enabled() {
		return false
	}
	ctx, cancel := context.WithTimeout(parent, 3*time.Second)
	defer cancel()
	return s.Brainbot.Health(ctx) == nil
}

func (s *Server) handleStats(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var version, source string
	if tb := s.currentTaste(); tb != nil {
		version = tb.Version
		source = tb.Source
	}
	stats, err := s.DB.GetStats(version, source)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, stats)
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}
