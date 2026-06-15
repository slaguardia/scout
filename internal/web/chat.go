package web

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/slaguardia/scout/internal/chat"
	"github.com/slaguardia/scout/internal/store"
)

// chatHub tracks the one in-flight turn per thread. POST /message kicks a turn
// (registered here, run in a goroutine); GET /stream subscribes to it. Mirrors
// the job runner's subscribe/backlog pattern so a stream that connects slightly
// after the kick still replays everything from the start.
type chatHub struct {
	mu     sync.Mutex
	active map[string]*chatTurn
}

func (h *chatHub) get(threadID string) *chatTurn {
	h.mu.Lock()
	defer h.mu.Unlock()
	return h.active[threadID]
}

// start registers a fresh turn for the thread, replacing any prior (finished)
// one. Returns the turn and false if a turn is already running for the thread.
func (h *chatHub) start(threadID string) (*chatTurn, bool) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.active == nil {
		h.active = map[string]*chatTurn{}
	}
	if t := h.active[threadID]; t != nil && !t.isDone() {
		return t, false
	}
	t := &chatTurn{}
	h.active[threadID] = t
	return t, true
}

// chatTurn is one streaming turn's broadcast state: the accumulated text
// backlog plus live subscriber channels, closed when the turn finishes.
type chatTurn struct {
	mu      sync.Mutex
	backlog []string
	subs    []chan string
	done    bool
	status  string // "done" | "error: ..."
}

func (t *chatTurn) emit(s string) {
	if s == "" {
		return
	}
	t.mu.Lock()
	defer t.mu.Unlock()
	t.backlog = append(t.backlog, s)
	for _, ch := range t.subs {
		select {
		case ch <- s:
		default: // a slow/disconnected subscriber must not stall the engine
		}
	}
}

func (t *chatTurn) finish(status string) {
	t.mu.Lock()
	defer t.mu.Unlock()
	if t.done {
		return
	}
	t.done = true
	t.status = status
	for _, ch := range t.subs {
		close(ch)
	}
	t.subs = nil
}

func (t *chatTurn) isDone() bool {
	t.mu.Lock()
	defer t.mu.Unlock()
	return t.done
}

// subscribe returns the backlog so far plus a channel of future deltas. When
// the turn is already done, ch is nil and done is true (the caller replays the
// backlog and ends). The channel is closed by finish().
func (t *chatTurn) subscribe() (backlog []string, ch chan string, done bool, status string) {
	t.mu.Lock()
	defer t.mu.Unlock()
	backlog = append([]string(nil), t.backlog...)
	if t.done {
		return backlog, nil, true, t.status
	}
	ch = make(chan string, 64)
	t.subs = append(t.subs, ch)
	return backlog, ch, false, ""
}

// handleChatThreads opens (or creates) the thread for a (scope, scope_id) and
// returns it with its message history for initial render. GET
// /api/chat/threads?scope=&scope_id=.
func (s *Server) handleChatThreads(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	scope := r.URL.Query().Get("scope")
	if scope == "" {
		scope = store.ChatScopeGlobal
	}
	scopeID := r.URL.Query().Get("scope_id")
	th, err := s.DB.OpenOrCreateThread(scope, scopeID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	msgs, err := s.DB.ThreadMessages(th.ID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"thread": th, "messages": msgs})
}

// handleChat dispatches /api/chat/{thread}/{message|stream}.
func (s *Server) handleChat(w http.ResponseWriter, r *http.Request) {
	rest := strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/chat/"), "/")
	parts := strings.Split(rest, "/")
	if len(parts) != 2 || parts[0] == "" {
		http.NotFound(w, r)
		return
	}
	threadID, action := parts[0], parts[1]
	switch action {
	case "message":
		s.handleChatMessage(w, r, threadID)
	case "stream":
		s.handleChatStream(w, r, threadID)
	default:
		http.NotFound(w, r)
	}
}

// handleChatMessage appends the user's message and kicks an assistant turn,
// run in the background and consumed via /stream. POST
// /api/chat/{thread}/message {"text":"..."}. Returns 202 once the turn starts;
// 409 if one is already running for the thread.
func (s *Server) handleChatMessage(w http.ResponseWriter, r *http.Request, threadID string) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if s.Chat == nil {
		http.Error(w, "chat needs ANTHROPIC_API_KEY in the server environment", http.StatusPreconditionFailed)
		return
	}
	var body struct {
		Text string `json:"text"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64<<10)).Decode(&body); err != nil {
		http.Error(w, "invalid JSON: "+err.Error(), http.StatusBadRequest)
		return
	}
	text := strings.TrimSpace(body.Text)
	if text == "" {
		http.Error(w, "text is required", http.StatusBadRequest)
		return
	}
	th, err := s.DB.GetThread(threadID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if th == nil {
		http.NotFound(w, r)
		return
	}

	turn, fresh := s.chat.start(threadID)
	if !fresh {
		http.Error(w, "a turn is already running for this thread", http.StatusConflict)
		return
	}

	// Persist the user message (content is a content-block array; the text seeds
	// the thread title when it's still blank).
	userContent, _ := json.Marshal([]map[string]any{{"type": "text", "text": text}})
	if _, err := s.DB.AppendMessage(threadID, "user", userContent, text); err != nil {
		turn.finish("error: " + err.Error())
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Build the per-request system prompt: base + scope framing + the seeded
	// entity context (regenerated each turn, never persisted) + today's date.
	contextBlock := s.buildChatContext(th.Scope, th.ScopeID)
	system := chat.SystemPrompt(th.Scope, contextBlock, time.Now())

	// Run the turn independently of this request (the kick returns immediately).
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
		defer cancel()
		if err := s.Chat.Run(ctx, threadID, system, turn.emit); err != nil {
			turn.finish("error: " + err.Error())
			return
		}
		turn.finish("done")
	}()

	writeJSON(w, http.StatusAccepted, map[string]any{"thread_id": threadID, "started": true})
}

// handleChatStream streams the active turn's text deltas as SSE, mirroring
// /api/jobs/{id}/stream: each "delta" event carries a text fragment, and a
// final "end" event carries the status. GET /api/chat/{thread}/stream.
func (s *Server) handleChatStream(w http.ResponseWriter, r *http.Request, threadID string) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming unsupported", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")

	turn := s.chat.get(threadID)
	if turn == nil {
		// No turn running — nothing to stream (the thread may have just loaded).
		writeChatSSE(w, "end", "idle")
		flusher.Flush()
		return
	}

	backlog, ch, done, status := turn.subscribe()
	for _, line := range backlog {
		writeChatSSE(w, "delta", line)
	}
	flusher.Flush()
	if done {
		writeChatSSE(w, "end", status)
		flusher.Flush()
		return
	}

	for {
		select {
		case line, open := <-ch:
			if !open {
				writeChatSSE(w, "end", turn.statusSafe())
				flusher.Flush()
				return
			}
			writeChatSSE(w, "delta", line)
			flusher.Flush()
		case <-r.Context().Done():
			return // client disconnected
		}
	}
}

// writeChatSSE emits one SSE event, preserving newlines: a text delta carries
// real newlines (paragraphs, lists), so — unlike the job-log writeSSE that
// collapses them — we split the payload across multiple data: lines, which the
// browser's EventSource rejoins with "\n".
func writeChatSSE(w http.ResponseWriter, event, data string) {
	fmt.Fprintf(w, "event: %s\n", event)
	for _, line := range strings.Split(data, "\n") {
		fmt.Fprintf(w, "data: %s\n", line)
	}
	fmt.Fprint(w, "\n")
}

func (t *chatTurn) statusSafe() string {
	t.mu.Lock()
	defer t.mu.Unlock()
	if t.status == "" {
		return "done"
	}
	return t.status
}

// buildChatContext assembles the seeded entity context for a per-entity chat:
// the entity's current scout detail, including ids so the model can act with
// the tools without re-searching. Global chat has no seeded context.
func (s *Server) buildChatContext(scope, scopeID string) string {
	switch scope {
	case store.ChatScopeCompany:
		return s.companyContext(scopeID)
	case store.ChatScopePosting:
		return s.postingContext(scopeID)
	default:
		return ""
	}
}

func (s *Server) companyContext(companyID string) string {
	d, err := s.DB.GetCompanyDetail(companyID)
	if err != nil || d == nil {
		return ""
	}
	var b strings.Builder
	fmt.Fprintf(&b, "You are chatting about this company (company_id: %s).\n", d.CompanyID)
	fmt.Fprintf(&b, "Name: %s\n", d.Name)
	if d.Domain != "" {
		fmt.Fprintf(&b, "Domain: %s\n", d.Domain)
	}
	if d.Location != "" || d.Vertical != "" || d.Headcount > 0 || d.FundingStage != "" {
		fmt.Fprintf(&b, "Location: %s | Vertical: %s | Headcount: %d | Stage: %s\n",
			d.Location, d.Vertical, d.Headcount, d.FundingStage)
	}
	if d.HasVerdict {
		fmt.Fprintf(&b, "Verdict: %s — %s\n", d.Verdict, d.Reason)
	}
	if d.WebsiteSummary != "" {
		fmt.Fprintf(&b, "Website summary: %s\n", d.WebsiteSummary)
	}
	if d.Notes != "" {
		fmt.Fprintf(&b, "Notes: %s\n", d.Notes)
	}
	if len(d.Postings) > 0 {
		b.WriteString("Postings:\n")
		for _, p := range d.Postings {
			fmt.Fprintf(&b, "  - %s (posting_id: %s) applied:%s response:%s\n",
				orDash(p.Title), p.ID, orDash(p.AppliedAt), orDash(p.Response))
		}
	}
	return b.String()
}

func (s *Server) postingContext(postingID string) string {
	p, err := s.DB.GetPosting(postingID)
	if err != nil || p == nil {
		return ""
	}
	name, _, _ := s.DB.GetCompanyName(p.CompanyID)
	var b strings.Builder
	fmt.Fprintf(&b, "You are chatting about this job posting (posting_id: %s, company_id: %s).\n", p.ID, p.CompanyID)
	fmt.Fprintf(&b, "Role: %s at %s\n", orDash(p.Title), orDash(name))
	if p.Location != "" || p.WorkplaceType != "" || p.EmploymentType != "" {
		fmt.Fprintf(&b, "Location: %s | Workplace: %s | Type: %s\n", p.Location, p.WorkplaceType, p.EmploymentType)
	}
	if p.CompRange != "" {
		fmt.Fprintf(&b, "Comp: %s\n", p.CompRange)
	}
	fmt.Fprintf(&b, "Application: applied:%s response:%s outreach:%d contacts:%s\n",
		orDash(p.AppliedAt), orDash(p.Response), p.OutreachCount, orDash(p.Contacts))
	if p.URL != "" {
		fmt.Fprintf(&b, "URL: %s\n", p.URL)
	}
	if p.Description != "" {
		fmt.Fprintf(&b, "Description:\n%s\n", truncate(p.Description, 4000))
	}
	return b.String()
}

func orDash(s string) string {
	if s == "" {
		return "—"
	}
	return s
}

func truncate(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return string(r[:n]) + "…"
}
