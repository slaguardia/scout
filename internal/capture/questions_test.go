package capture

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/slaguardia/scout/internal/enrich"
)

// --- Greenhouse --------------------------------------------------------------

// greenhouseFixture mirrors the real ?questions=true shape (parasail,
// 2026-06-08): identity input_text, file+textarea resume/cover-letter, URL
// fields, and four essay textareas. EEO lives in separate top-level keys, so
// it's not in `questions`.
const greenhouseFixture = `{
  "title": "Software Engineer",
  "questions": [
    {"label": "First Name", "required": true, "fields": [{"name": "first_name", "type": "input_text"}]},
    {"label": "Last Name", "required": true, "fields": [{"name": "last_name", "type": "input_text"}]},
    {"label": "Email", "required": true, "fields": [{"name": "email", "type": "input_text"}]},
    {"label": "Phone", "required": false, "fields": [{"name": "phone", "type": "input_text"}]},
    {"label": "Resume/CV", "required": true, "fields": [{"name": "resume", "type": "input_file"}, {"name": "resume_text", "type": "textarea"}]},
    {"label": "Cover Letter", "required": false, "fields": [{"name": "cover_letter", "type": "input_file"}, {"name": "cover_letter_text", "type": "textarea"}]},
    {"label": "LinkedIn Profile", "required": false, "fields": [{"name": "question_1", "type": "input_text"}]},
    {"label": "Website", "required": false, "fields": [{"name": "question_2", "type": "input_text"}]},
    {"label": "What inspires you at work?", "required": true, "fields": [{"name": "question_4722758008", "type": "textarea"}]},
    {"label": "How would you approach our hardest problem?", "required": true, "fields": [{"name": "question_3", "type": "input_text"}]}
  ]
}`

func TestDetectGreenhouseQuestions(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.Contains(r.URL.Path, "/v1/boards/parasail/jobs/4092794008") {
			http.NotFound(w, r)
			return
		}
		if r.URL.Query().Get("questions") != "true" {
			t.Errorf("missing ?questions=true: %s", r.URL.RawQuery)
		}
		_, _ = w.Write([]byte(greenhouseFixture))
	}))
	defer srv.Close()
	defer swap(&greenhouseAPIBase, srv.URL)()

	scan := DetectQuestions(context.Background(), srv.Client(),
		"https://job-boards.greenhouse.io/parasail/jobs/4092794008")

	if scan.Status != QuestionsOK || scan.Source != "greenhouse" {
		t.Fatalf("status=%s source=%s, want ok/greenhouse", scan.Status, scan.Source)
	}
	got := prompts(scan)
	// Cover Letter (textarea) + the inspires essay + the input_text question.
	// Identity, URLs, and Resume/CV must be gone.
	want := []string{"Cover Letter", "What inspires you at work?", "How would you approach our hardest problem?"}
	if len(got) != len(want) {
		t.Fatalf("kept %v, want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Errorf("question[%d] = %q, want %q", i, got[i], want[i])
		}
	}
	for _, bad := range []string{"First Name", "Email", "Phone", "Resume/CV", "LinkedIn Profile", "Website"} {
		if has(got, bad) {
			t.Errorf("kept identity/URL field %q", bad)
		}
	}
	// The textarea field name is the stable key.
	if scan.Questions[0].Key != "cover_letter_text" {
		t.Errorf("cover letter key = %q, want cover_letter_text", scan.Questions[0].Key)
	}
}

func TestDetectGreenhouseNoEssays(t *testing.T) {
	const onlyIdentity = `{"questions": [
		{"label": "First Name", "fields": [{"name": "first_name", "type": "input_text"}]},
		{"label": "Resume/CV", "fields": [{"name": "resume", "type": "input_file"}, {"name": "resume_text", "type": "textarea"}]}
	]}`
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(onlyIdentity))
	}))
	defer srv.Close()
	defer swap(&greenhouseAPIBase, srv.URL)()

	scan := DetectQuestions(context.Background(), srv.Client(),
		"https://boards.greenhouse.io/acme/jobs/12345")
	if scan.Status != QuestionsNone {
		t.Fatalf("status=%s, want none", scan.Status)
	}
	if len(scan.Questions) != 0 {
		t.Fatalf("kept %v, want none", prompts(scan))
	}
}

func TestDetectGreenhouseUnreachable(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "boom", http.StatusInternalServerError)
	}))
	defer srv.Close()
	defer swap(&greenhouseAPIBase, srv.URL)()

	scan := DetectQuestions(context.Background(), srv.Client(),
		"https://boards.greenhouse.io/acme/jobs/12345")
	if scan.Status != QuestionsUnreachable {
		t.Fatalf("status=%s, want unreachable", scan.Status)
	}
}

// --- Ashby -------------------------------------------------------------------

// ashbyFixture is a non-user-graphql response: one essay (LongText), an
// identity field (_systemfield_name String), a resume (_systemfield_resume
// File), and a multiple-choice (MultiValueSelect). `field` is raw JSON.
const ashbyFixture = `{"data": {"jobPosting": {
  "id": "job-1", "title": "Engineer",
  "applicationForm": {"fieldEntries": [
    {"field": {"path": "_systemfield_name", "title": "Full Name", "type": "String"}, "isRequired": true},
    {"field": {"path": "_systemfield_resume", "title": "Resume", "type": "File"}, "isRequired": true},
    {"field": {"path": "49a5763f-75a4-402d-84ef-cfa1ab592efa", "title": "Why are you interested in joining WRITER?", "type": "LongText"}, "isRequired": true},
    {"field": {"path": "76d756ca-9d77-4727-8b47-2f44baf545e9", "title": "Are you within 50 miles of an office?", "type": "MultiValueSelect", "selectableValues": [{"label": "SF", "value": "SF"}]}, "isRequired": true}
  ]}
}}}`

func TestDetectAshbyQuestions(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.URL.Path != "/api/non-user-graphql" {
			http.NotFound(w, r)
			return
		}
		if ct := r.Header.Get("Content-Type"); ct != "application/json" {
			t.Errorf("Content-Type = %q, want application/json", ct)
		}
		_, _ = w.Write([]byte(ashbyFixture))
	}))
	defer srv.Close()
	defer swap(&ashbyGraphQLBase, srv.URL)()

	scan := DetectQuestions(context.Background(), srv.Client(),
		"https://jobs.ashbyhq.com/writer/634e0a00-dd96-4f5f-ba5f-4fa3aff4c6c9")
	if scan.Status != QuestionsOK || scan.Source != "ashby" {
		t.Fatalf("status=%s source=%s, want ok/ashby", scan.Status, scan.Source)
	}
	got := prompts(scan)
	if len(got) != 1 || got[0] != "Why are you interested in joining WRITER?" {
		t.Fatalf("kept %v, want only the LongText essay", got)
	}
	if scan.Questions[0].Key != "49a5763f-75a4-402d-84ef-cfa1ab592efa" {
		t.Errorf("key = %q, want the field path", scan.Questions[0].Key)
	}
}

// Schema drift / null applicationForm degrades to unsupported, never a crash.
func TestDetectAshbyFailsSoft(t *testing.T) {
	for name, body := range map[string]string{
		"null jobPosting": `{"data": {"jobPosting": null}}`,
		"null form":       `{"data": {"jobPosting": {"id": "x", "title": "t", "applicationForm": null}}}`,
		"graphql errors":  `{"errors": [{"message": "schema changed"}]}`,
	} {
		t.Run(name, func(t *testing.T) {
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				_, _ = w.Write([]byte(body))
			}))
			defer srv.Close()
			defer swap(&ashbyGraphQLBase, srv.URL)()

			scan := DetectQuestions(context.Background(), srv.Client(),
				"https://jobs.ashbyhq.com/acme/634e0a00-dd96-4f5f-ba5f-4fa3aff4c6c9")
			if scan.Status != QuestionsUnsupported {
				t.Fatalf("status=%s, want unsupported", scan.Status)
			}
		})
	}
}

// --- dispatch ----------------------------------------------------------------

func TestDetectUnsupportedHost(t *testing.T) {
	for _, u := range []string{
		"https://www.linkedin.com/jobs/view/123456",
		"https://example.com/careers/role",
		"not a url",
	} {
		scan := DetectQuestions(context.Background(), enrich.NewHTTPClient(0), u)
		if scan.Status != QuestionsUnsupported {
			t.Errorf("%s: status=%s, want unsupported", u, scan.Status)
		}
		if len(scan.Questions) != 0 {
			t.Errorf("%s: returned questions for an unsupported host", u)
		}
	}
}

func TestIdentityLabelFiltering(t *testing.T) {
	for _, drop := range []string{
		"First Name", "Email", "Phone", "Resume/CV", "Resume / CV",
		"CV", "cv", "CV File", "Upload your CV", "Curriculum Vitae",
		"LinkedIn Profile", "Personal Website", "GitHub URL", "Portfolio",
	} {
		if !isIdentityLabel(drop) {
			t.Errorf("isIdentityLabel(%q) = false, want true (drop it)", drop)
		}
	}
	for _, keep := range []string{
		"Why us?", "Describe a project you're proud of", "Cover Letter",
		"What inspires you at work?", "Tell us about yourself",
	} {
		if isIdentityLabel(keep) {
			t.Errorf("isIdentityLabel(%q) = true, want false (it's an essay)", keep)
		}
	}
}

// --- helpers -----------------------------------------------------------------

// swap sets *p to v and returns a restore func for `defer swap(...)()`.
func swap(p *string, v string) func() {
	old := *p
	*p = v
	return func() { *p = old }
}

func prompts(s QuestionScan) []string {
	out := make([]string, len(s.Questions))
	for i, q := range s.Questions {
		out[i] = q.Prompt
	}
	return out
}

func has(xs []string, x string) bool {
	for _, s := range xs {
		if s == x {
			return true
		}
	}
	return false
}
