package outreach

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"github.com/slaguardia/scout/internal/brainbot"
	"github.com/slaguardia/scout/internal/store"
)

// fakeBrain serves /map and /doc from an in-memory doc set and counts /doc hits.
type fakeBrain struct {
	docs    map[string]brainbot.Doc // id -> doc
	docHits map[string]int
}

func (f *fakeBrain) handler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/map":
			var sources []map[string]any
			for _, d := range f.docs {
				sources = append(sources, map[string]any{
					"id": d.ID, "title": d.Title, "path": d.Path,
					"parent_id": nil, "version": d.Version,
				})
			}
			json.NewEncoder(w).Encode(map[string]any{"sources": sources})
		case "/doc":
			id := r.URL.Query().Get("id")
			f.docHits[id]++
			d, ok := f.docs[id]
			if !ok {
				w.WriteHeader(http.StatusNotFound)
				json.NewEncoder(w).Encode(map[string]string{"error": "unknown id"})
				return
			}
			json.NewEncoder(w).Encode(d)
		default:
			http.NotFound(w, r)
		}
	}
}

func newFixture(t *testing.T) (*fakeBrain, *brainbot.Client, *store.DB) {
	t.Helper()
	fb := &fakeBrain{docs: map[string]brainbot.Doc{}, docHits: map[string]int{}}
	srv := httptest.NewServer(fb.handler())
	t.Cleanup(srv.Close)
	db, err := store.Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	return fb, brainbot.New(srv.URL), db
}

func statusFor(t *testing.T, statuses []BlockStatus, block string) BlockStatus {
	t.Helper()
	for _, s := range statuses {
		if s.Block == block {
			return s
		}
	}
	t.Fatalf("no status for %s in %+v", block, statuses)
	return BlockStatus{}
}

func TestSyncPointedBlock(t *testing.T) {
	fb, brain, db := newFixture(t)
	fb.docs["v1-id"] = brainbot.Doc{ID: "v1-id", Title: "Voice", Path: "O/Voice", Version: "va", Text: "rule one"}
	fb.docs["v2-id"] = brainbot.Doc{ID: "v2-id", Title: "Anchors", Path: "O/Anchors", Version: "vb", Text: "anchor two"}
	if err := db.SetOutreachPin("VOICE_RULES", []string{"v1-id", "v2-id"}, ""); err != nil {
		t.Fatal(err)
	}

	statuses, err := Sync(context.Background(), brain, db)
	if err != nil {
		t.Fatalf("Sync: %v", err)
	}
	st := statusFor(t, statuses, "VOICE_RULES")
	if st.State != "ok" || st.Version != "va+vb" {
		t.Fatalf("status = %+v", st)
	}
	b, err := db.GetOutreachBlock("VOICE_RULES")
	if err != nil || b == nil {
		t.Fatalf("block: %v %v", b, err)
	}
	if b.Content != "rule one\n\nanchor two" {
		t.Errorf("content = %q", b.Content)
	}

	// Second sync: /map hint matches the cache — no /doc fetches.
	hitsBefore := fb.docHits["v1-id"] + fb.docHits["v2-id"]
	statuses, err = Sync(context.Background(), brain, db)
	if err != nil {
		t.Fatalf("Sync 2: %v", err)
	}
	if st := statusFor(t, statuses, "VOICE_RULES"); st.State != "unchanged" {
		t.Errorf("state = %q, want unchanged", st.State)
	}
	if hits := fb.docHits["v1-id"] + fb.docHits["v2-id"]; hits != hitsBefore {
		t.Errorf("doc fetched on unchanged sync (%d -> %d hits)", hitsBefore, hits)
	}

	// Upstream edit: version moves -> silent refetch with new content.
	fb.docs["v1-id"] = brainbot.Doc{ID: "v1-id", Title: "Voice", Path: "O/Voice", Version: "va2", Text: "rule one revised"}
	statuses, err = Sync(context.Background(), brain, db)
	if err != nil {
		t.Fatalf("Sync 3: %v", err)
	}
	if st := statusFor(t, statuses, "VOICE_RULES"); st.State != "ok" || st.Version != "va2+vb" {
		t.Errorf("status after edit = %+v", st)
	}
}

func TestSyncLockedBlock(t *testing.T) {
	fb, brain, db := newFixture(t)
	fb.docs["p2-id"] = brainbot.Doc{ID: "p2-id", Title: "P2", Path: "O/P2", Version: "v7.1", Text: "frozen — paragraph"}

	// Pinned WITHOUT approval -> broken, never served.
	if err := db.SetOutreachPin("P2_LOCKED", []string{"p2-id"}, ""); err != nil {
		t.Fatal(err)
	}
	statuses, err := Sync(context.Background(), brain, db)
	if err != nil {
		t.Fatal(err)
	}
	if st := statusFor(t, statuses, "P2_LOCKED"); st.State != "broken" {
		t.Fatalf("unapproved locked pin: %+v", st)
	}

	// Approved at current version -> ok, byte-exact.
	if err := db.SetOutreachPin("P2_LOCKED", []string{"p2-id"}, "v7.1"); err != nil {
		t.Fatal(err)
	}
	statuses, err = Sync(context.Background(), brain, db)
	if err != nil {
		t.Fatal(err)
	}
	if st := statusFor(t, statuses, "P2_LOCKED"); st.State != "ok" {
		t.Fatalf("approved locked pin: %+v", st)
	}
	b, _ := db.GetOutreachBlock("P2_LOCKED")
	if b == nil || b.Content != "frozen — paragraph" {
		t.Fatalf("locked content = %+v", b)
	}

	// Upstream drift -> broken (never auto-adopt), detail names both versions.
	fb.docs["p2-id"] = brainbot.Doc{ID: "p2-id", Title: "P2", Path: "O/P2", Version: "v8", Text: "rewritten"}
	statuses, err = Sync(context.Background(), brain, db)
	if err != nil {
		t.Fatal(err)
	}
	st := statusFor(t, statuses, "P2_LOCKED")
	if st.State != "broken" {
		t.Fatalf("drifted locked pin: %+v", st)
	}
	b, _ = db.GetOutreachBlock("P2_LOCKED")
	if b == nil || b.Broken == "" {
		t.Fatalf("broken not persisted: %+v", b)
	}
}

func TestSync404IsLoud(t *testing.T) {
	_, brain, db := newFixture(t)
	if err := db.SetOutreachPin("HOOK_RULES", []string{"gone-id"}, ""); err != nil {
		t.Fatal(err)
	}
	statuses, err := Sync(context.Background(), brain, db)
	if err != nil {
		t.Fatal(err)
	}
	st := statusFor(t, statuses, "HOOK_RULES")
	if st.State != "broken" {
		t.Fatalf("404 pin: %+v", st)
	}
	b, _ := db.GetOutreachBlock("HOOK_RULES")
	if b == nil || b.Broken == "" {
		t.Fatalf("broken not persisted: %+v", b)
	}
}

func TestSyncUnpinnedAndDerived(t *testing.T) {
	_, brain, db := newFixture(t)
	statuses, err := Sync(context.Background(), brain, db)
	if err != nil {
		t.Fatal(err)
	}
	if st := statusFor(t, statuses, "CLOSER_RULES"); st.State != "unpinned" {
		t.Errorf("CLOSER_RULES = %+v", st)
	}
	if st := statusFor(t, statuses, "EXPERIENCE_CARD"); st.State != "derived" {
		t.Errorf("EXPERIENCE_CARD = %+v", st)
	}
	if len(statuses) != len(Slots) {
		t.Errorf("statuses = %d, want %d (one per slot)", len(statuses), len(Slots))
	}
}

func TestUnpinDropsCache(t *testing.T) {
	fb, brain, db := newFixture(t)
	fb.docs["h-id"] = brainbot.Doc{ID: "h-id", Title: "H", Path: "O/H", Version: "v1", Text: "hooks"}
	if err := db.SetOutreachPin("HOOK_RULES", []string{"h-id"}, ""); err != nil {
		t.Fatal(err)
	}
	if _, err := Sync(context.Background(), brain, db); err != nil {
		t.Fatal(err)
	}
	if err := db.SetOutreachPin("HOOK_RULES", nil, ""); err != nil {
		t.Fatal(err)
	}
	b, err := db.GetOutreachBlock("HOOK_RULES")
	if err != nil {
		t.Fatal(err)
	}
	if b != nil {
		t.Fatalf("cache survived unpin: %+v", b)
	}
}
