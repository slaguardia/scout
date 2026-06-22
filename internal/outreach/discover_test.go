package outreach

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"github.com/slaguardia/scout/internal/anthropic"
	"github.com/slaguardia/scout/internal/brainbot"
	"github.com/slaguardia/scout/internal/store"
)

// fakeBrain serves /map (title+path tree), /doc (whole document), and /changes
// (the cursor/changed signal) from an in-memory doc set.
type fakeBrain struct {
	docs   map[string]brainbot.Doc
	cursor string // current change cursor; /changes reports changed when since != cursor
}

func (f *fakeBrain) server(t *testing.T) *httptest.Server {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/changes":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"cursor": f.cursor, "changed": r.URL.Query().Get("since") != f.cursor,
			})
		case "/map":
			var sources []map[string]any
			for _, d := range f.docs {
				sources = append(sources, map[string]any{
					"id": d.ID, "title": d.Title, "path": d.Path, "parent_id": nil, "version": d.Version,
				})
			}
			_ = json.NewEncoder(w).Encode(map[string]any{"sources": sources})
		case "/doc":
			d, ok := f.docs[r.URL.Query().Get("id")]
			if !ok {
				w.WriteHeader(http.StatusNotFound)
				_ = json.NewEncoder(w).Encode(map[string]string{"error": "unknown id"})
				return
			}
			_ = json.NewEncoder(w).Encode(d)
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(srv.Close)
	return srv
}

func discoverDB(t *testing.T) *store.DB {
	t.Helper()
	db, err := store.Open(filepath.Join(t.TempDir(), "d.db"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	return db
}

func fakeAnthropicClient(t *testing.T, reply string) *anthropic.Client {
	t.Helper()
	fa := &fakeAnthropic{replies: []string{reply}}
	srv := fa.server(t)
	return &anthropic.Client{APIKey: "k", Endpoint: srv.URL, HTTP: srv.Client()}
}

// Discovery selects the relevant pages per need, whole-fetches them, and caches
// the text — and ignores an off-topic page the model didn't pick.
func TestDiscoverSelectsAndCaches(t *testing.T) {
	fb := &fakeBrain{docs: map[string]brainbot.Doc{
		"exp":   {ID: "exp", Title: "Past Experience", Path: "Career/Past Experience", Version: "v1", Text: "Five years at Globex, forward-deployed."},
		"voice": {ID: "voice", Title: "Voice & Style", Path: "Writing/Voice", Version: "v2", Text: "Plain, tight sentences."},
		"junk":  {ID: "junk", Title: "Grocery list", Path: "Home", Version: "v3", Text: "milk, eggs"},
	}}
	brain := brainbot.New(fb.server(t).URL)
	ac := fakeAnthropicClient(t, `{"experience":["exp"],"voice":["voice"]}`)
	db := discoverDB(t)

	if _, err := Discover(context.Background(), brain, ac, db, "test-model"); err != nil {
		t.Fatalf("Discover: %v", err)
	}
	if exp, _ := db.OutreachKnowledge("experience"); !strings.Contains(exp, "Globex") {
		t.Errorf("experience not cached: %q", exp)
	}
	if v, _ := db.OutreachKnowledge("voice"); !strings.Contains(v, "Plain") {
		t.Errorf("voice not cached: %q", v)
	}
}

// An empty experience selection is a loud, blocking error (ErrNoExperience) —
// never a silent empty bundle. Voice still caches.
func TestDiscoverFailsLoudWhenNoExperience(t *testing.T) {
	fb := &fakeBrain{docs: map[string]brainbot.Doc{
		"voice": {ID: "voice", Title: "Voice", Path: "x", Version: "v1", Text: "plain"},
	}}
	brain := brainbot.New(fb.server(t).URL)
	ac := fakeAnthropicClient(t, `{"experience":[],"voice":["voice"]}`)
	db := discoverDB(t)

	_, err := Discover(context.Background(), brain, ac, db, "test-model")
	if !errors.Is(err, ErrNoExperience) {
		t.Fatalf("err = %v, want ErrNoExperience", err)
	}
	if v, _ := db.OutreachKnowledge("voice"); v == "" {
		t.Error("voice should still cache even when experience is empty")
	}
}

// The model may not invent ids: an id absent from the map is ignored, which (for
// experience) surfaces as ErrNoExperience rather than a bogus cache.
func TestDiscoverIgnoresHallucinatedIDs(t *testing.T) {
	fb := &fakeBrain{docs: map[string]brainbot.Doc{
		"voice": {ID: "voice", Title: "Voice", Path: "x", Version: "v1", Text: "plain"},
	}}
	brain := brainbot.New(fb.server(t).URL)
	ac := fakeAnthropicClient(t, `{"experience":["does-not-exist"],"voice":["voice"]}`)
	db := discoverDB(t)

	if _, err := Discover(context.Background(), brain, ac, db, "test-model"); !errors.Is(err, ErrNoExperience) {
		t.Fatalf("err = %v, want ErrNoExperience (hallucinated id ignored)", err)
	}
}

// EnsureKnowledge is change-aware: a cold cache discovers, an unchanged brain
// serves the cache with no re-discovery, and a moved cursor re-discovers and
// re-stamps. The fakeAnthropic t.Errorf's on any unscripted call, so an extra
// discovery is caught as a spurious LLM call.
func TestEnsureKnowledgeChangeAware(t *testing.T) {
	fb := &fakeBrain{
		cursor: "c1",
		docs: map[string]brainbot.Doc{
			"exp":   {ID: "exp", Title: "Past Experience", Path: "Career/Past Experience", Version: "v1", Text: "Five years at Globex."},
			"voice": {ID: "voice", Title: "Voice", Path: "Writing/Voice", Version: "v1", Text: "Plain."},
		},
	}
	brain := brainbot.New(fb.server(t).URL)
	fa := &fakeAnthropic{replies: []string{
		`{"experience":["exp"],"voice":["voice"],"logistics":[]}`, // cold discovery
		`{"experience":["exp"],"voice":["voice"],"logistics":[]}`, // after the change
	}}
	asrv := fa.server(t)
	ac := &anthropic.Client{APIKey: "k", Endpoint: asrv.URL, HTTP: asrv.Client()}
	db := discoverDB(t)
	ctx := context.Background()

	// Cold: empty cursor → Changed=true → discover, stamp cursor.
	if err := EnsureKnowledge(ctx, brain, ac, db, "test-model", nil); err != nil {
		t.Fatalf("cold EnsureKnowledge: %v", err)
	}
	if exp, _ := db.OutreachKnowledge("experience"); !strings.Contains(exp, "Globex") {
		t.Errorf("experience not cached on cold sync: %q", exp)
	}
	if cur, _ := db.GetSetting(store.OutreachCursorSetting); cur != "c1" {
		t.Errorf("cursor = %q, want c1 after cold discovery", cur)
	}
	if fa.calls != 1 {
		t.Fatalf("cold sync made %d discovery calls, want 1", fa.calls)
	}

	// Unchanged: cursor matches → serve cache, no re-discovery.
	if err := EnsureKnowledge(ctx, brain, ac, db, "test-model", nil); err != nil {
		t.Fatalf("unchanged EnsureKnowledge: %v", err)
	}
	if fa.calls != 1 {
		t.Errorf("unchanged brain re-discovered (%d calls), want still 1", fa.calls)
	}

	// Changed: brain cursor moves → re-discover, re-stamp.
	fb.cursor = "c2"
	if err := EnsureKnowledge(ctx, brain, ac, db, "test-model", nil); err != nil {
		t.Fatalf("changed EnsureKnowledge: %v", err)
	}
	if fa.calls != 2 {
		t.Errorf("changed brain made %d calls, want 2 (a re-discovery)", fa.calls)
	}
	if cur, _ := db.GetSetting(store.OutreachCursorSetting); cur != "c2" {
		t.Errorf("cursor = %q, want c2 after re-discovery", cur)
	}
}
