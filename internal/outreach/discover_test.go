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

// fakeBrain serves /map (title+path tree) and /doc (whole document) from an
// in-memory doc set.
type fakeBrain struct{ docs map[string]brainbot.Doc }

func (f *fakeBrain) server(t *testing.T) *httptest.Server {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
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
