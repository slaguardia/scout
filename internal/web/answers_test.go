package web

import (
	"encoding/json"
	"net/http"
	"strconv"
	"testing"

	"github.com/slaguardia/scout/internal/store"
)

// fakeAnswersRunner records the posting ids generation was kicked off for.
type fakeAnswersRunner struct{ started []string }

func (f *fakeAnswersRunner) Generate(postingID string) { f.started = append(f.started, postingID) }

type answersResp struct {
	Answers         []store.PostingAnswer `json:"answers"`
	QuestionsStatus string                `json:"questions_status"`
}

func seedAnswersPosting(t *testing.T, s *Server, cid string) string {
	t.Helper()
	p, err := s.DB.AddPosting(cid, "https://acme.com/careers/role", "Engineer")
	if err != nil {
		t.Fatalf("seed posting: %v", err)
	}
	return p.ID
}

func TestAnswersGetAndDetect(t *testing.T) {
	s, cid := newTestServer(t)
	h := s.Handler()
	pid := seedAnswersPosting(t, s, cid)

	// Fresh posting: empty answers, never detected.
	rec := do(t, h, http.MethodGet, "/api/postings/"+pid+"/answers", "")
	if rec.Code != http.StatusOK {
		t.Fatalf("GET: want 200, got %d (%s)", rec.Code, rec.Body.String())
	}
	var got answersResp
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if len(got.Answers) != 0 || got.QuestionsStatus != "" {
		t.Errorf("fresh posting: %+v", got)
	}

	// Seed questions and read them back.
	if err := s.DB.UpsertDetectedQuestions(pid, []store.DetectedQuestion{
		{Key: "k1", Prompt: "Why us?", MaxLength: 300},
		{Key: "k2", Prompt: "A project?"},
	}, "ok"); err != nil {
		t.Fatal(err)
	}
	rec = do(t, h, http.MethodGet, "/api/postings/"+pid+"/answers", "")
	_ = json.Unmarshal(rec.Body.Bytes(), &got)
	if len(got.Answers) != 2 || got.QuestionsStatus != "ok" {
		t.Fatalf("after seed: %+v", got)
	}

	// Unknown posting → 404.
	if rec := do(t, h, http.MethodGet, "/api/postings/nope/answers", ""); rec.Code != http.StatusNotFound {
		t.Errorf("unknown GET: want 404, got %d", rec.Code)
	}
}

func TestAnswersGenerateGate(t *testing.T) {
	s, cid := newTestServer(t)
	pid := seedAnswersPosting(t, s, cid)
	_ = s.DB.UpsertDetectedQuestions(pid, []store.DetectedQuestion{{Key: "k1", Prompt: "Why us?"}}, "ok")

	// No runner wired → 503.
	if rec := do(t, s.Handler(), http.MethodPost, "/api/postings/"+pid+"/answers", ""); rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("no engine: want 503, got %d", rec.Code)
	}

	// Runner wired but no experience discovered → 412 + need=experience.
	runner := &fakeAnswersRunner{}
	s.Answers = runner
	h := s.Handler()
	rec := do(t, h, http.MethodPost, "/api/postings/"+pid+"/answers", "")
	if rec.Code != http.StatusPreconditionFailed {
		t.Fatalf("missing experience: want 412, got %d (%s)", rec.Code, rec.Body.String())
	}
	var gate struct {
		Need string `json:"need"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &gate)
	if gate.Need != "experience" {
		t.Errorf("need = %q, want experience", gate.Need)
	}

	// Seed the experience source → 202 + runner fired for the posting.
	if err := s.DB.UpsertOutreachSource(store.OutreachSource{Need: "experience", PageID: "exp1", Title: "Exp", Content: "exp doc", Version: "v1"}); err != nil {
		t.Fatal(err)
	}
	rec = do(t, h, http.MethodPost, "/api/postings/"+pid+"/answers", "")
	if rec.Code != http.StatusAccepted {
		t.Fatalf("ready: want 202, got %d (%s)", rec.Code, rec.Body.String())
	}
	if len(runner.started) != 1 || runner.started[0] != pid {
		t.Errorf("runner fired: %v", runner.started)
	}
}

func TestAnswerEditAndRegenerate(t *testing.T) {
	s, cid := newTestServer(t)
	pid := seedAnswersPosting(t, s, cid)
	_ = s.DB.UpsertDetectedQuestions(pid, []store.DetectedQuestion{{Key: "k1", Prompt: "Why us?"}}, "ok")
	id := mustListAnswers(t, s, pid)[0].ID

	h := s.Handler()
	idPath := "/api/answers/" + strconv.FormatInt(id, 10)

	// Edit → 200, edited saved.
	rec := do(t, h, http.MethodPut, idPath, `{"edited":"hand-written answer"}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("edit: want 200, got %d (%s)", rec.Code, rec.Body.String())
	}
	var a store.PostingAnswer
	_ = json.Unmarshal(rec.Body.Bytes(), &a)
	if a.Edited != "hand-written answer" {
		t.Errorf("edited = %q", a.Edited)
	}

	// Regenerate without a runner → 503.
	if rec := do(t, h, http.MethodPut, idPath, `{"regenerate":true}`); rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("regenerate no engine: want 503, got %d", rec.Code)
	}

	// With a runner → 202, runner fired, row cleared to generating.
	runner := &fakeAnswersRunner{}
	s.Answers = runner
	h = s.Handler()
	rec = do(t, h, http.MethodPut, idPath, `{"regenerate":true}`)
	if rec.Code != http.StatusAccepted {
		t.Fatalf("regenerate: want 202, got %d (%s)", rec.Code, rec.Body.String())
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &a)
	if a.Status != store.AnswerGenerating || a.Edited != "" || a.Answer != "" {
		t.Errorf("regenerate did not clear the row: %+v", a)
	}
	if len(runner.started) != 1 || runner.started[0] != pid {
		t.Errorf("runner fired: %v", runner.started)
	}

	// Unknown answer id → 404.
	if rec := do(t, h, http.MethodPut, "/api/answers/99999", `{"edited":"x"}`); rec.Code != http.StatusNotFound {
		t.Errorf("unknown answer: want 404, got %d", rec.Code)
	}
}

func TestAnswersRedetect(t *testing.T) {
	s, cid := newTestServer(t)
	pid := seedAnswersPosting(t, s, cid) // non-ATS URL, nil Anthropic
	h := s.Handler()

	// Redetect a non-ATS posting with no LLM key: honest "unsupported", stored.
	rec := do(t, h, http.MethodPost, "/api/postings/"+pid+"/answers/redetect", "")
	if rec.Code != http.StatusOK {
		t.Fatalf("redetect: want 200, got %d (%s)", rec.Code, rec.Body.String())
	}
	var got answersResp
	_ = json.Unmarshal(rec.Body.Bytes(), &got)
	if got.QuestionsStatus != "unsupported" {
		t.Errorf("questions_status = %q, want unsupported", got.QuestionsStatus)
	}

	if rec := do(t, h, http.MethodPost, "/api/postings/nope/answers/redetect", ""); rec.Code != http.StatusNotFound {
		t.Errorf("unknown redetect: want 404, got %d", rec.Code)
	}
}

func mustListAnswers(t *testing.T, s *Server, pid string) []store.PostingAnswer {
	t.Helper()
	a, err := s.DB.ListAnswers(pid)
	if err != nil {
		t.Fatal(err)
	}
	return a
}
