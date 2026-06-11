package outreach

import "testing"

func TestParseTemplateHolesAndVars(t *testing.T) {
	tmpl := "Subject: [Name] | intro — {{role}}\n\nHi [Name],\n\n{{hook: one true thing about {{company}} tied to my work}}\n\nFixed credentials here.\n\n{{closer: ask about the {{role}} role}}\n\nThanks,\nAlex"
	parsed, err := ParseTemplate(tmpl)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	vars := map[string]string{"role": "Backend Engineer", "company": "Acme"}

	holes := parsed.Holes(vars)
	if len(holes) != 2 {
		t.Fatalf("holes = %d, want 2: %+v", len(holes), holes)
	}
	if holes[0].Name != "hook" || holes[0].Instr != "one true thing about Acme tied to my work" {
		t.Errorf("hook hole = %+v (nested {{company}} should resolve to Acme)", holes[0])
	}
	if holes[1].Name != "closer" || holes[1].Instr != "ask about the Backend Engineer role" {
		t.Errorf("closer hole = %+v", holes[1])
	}

	email := parsed.Render(vars, map[string]string{
		"hook":   "I saw you ship into customer environments.",
		"closer": "Open to a quick call about the Backend Engineer role?",
	})
	wantContains := []string{
		"Subject: [Name] | intro — Backend Engineer", // {{role}} var resolved
		"I saw you ship into customer environments.", // hook filled
		"Fixed credentials here.",                    // verbatim prose untouched
		"Open to a quick call about the Backend Engineer role?",
		"Thanks,\nAlex",
	}
	for _, w := range wantContains {
		if !containsSub(email, w) {
			t.Errorf("rendered email missing %q:\n%s", w, email)
		}
	}
	// The nested {{company}} only lived in an instruction, never the body.
	if containsSub(email, "{{") {
		t.Errorf("rendered email still has an unresolved token:\n%s", email)
	}
}

func TestParseTemplateUnfilledHoleVisible(t *testing.T) {
	parsed, err := ParseTemplate("Hi,\n\n{{hook: something}}\n\n{{unknownvar}}")
	if err != nil {
		t.Fatal(err)
	}
	// No fill for hook, no value for unknownvar → both left as visible tokens.
	out := parsed.Render(map[string]string{}, map[string]string{})
	if !containsSub(out, "{{hook}}") || !containsSub(out, "{{unknownvar}}") {
		t.Errorf("unfilled hole / unresolved var should stay visible:\n%s", out)
	}
}

func TestParseTemplateMalformed(t *testing.T) {
	for _, bad := range []string{
		"hello {{unterminated",
		"hello {{ : no name}}",
		"hello {{1bad: starts with digit}}",
	} {
		if _, err := ParseTemplate(bad); err == nil {
			t.Errorf("expected parse error for %q", bad)
		}
	}
}

func TestParseTemplateNoHoles(t *testing.T) {
	// A fully static template (no holes) still parses and renders with vars.
	parsed, err := ParseTemplate("Hi [Name], applying for {{role}}. Thanks.")
	if err != nil {
		t.Fatal(err)
	}
	if h := parsed.Holes(nil); len(h) != 0 {
		t.Errorf("holes = %d, want 0", len(h))
	}
	if got := parsed.Render(map[string]string{"role": "SRE"}, nil); got != "Hi [Name], applying for SRE. Thanks." {
		t.Errorf("render = %q", got)
	}
}

func containsSub(s, sub string) bool {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return true
		}
	}
	return false
}

func TestRenderDewrapsHardWrappedProse(t *testing.T) {
	// A credential paragraph the user pasted hard-wrapped, plus a signature whose
	// short lines must keep their breaks.
	tmpl := "Hi there,\n\n{{hook: observe}}\n\n" +
		"I've spent the past 5 years at Lockheed Martin across a number of roles to help\n" +
		"drive customer success. Most recently, I've been embedded with customer teams,\n" +
		"leading enterprise deployments and bringing real feedback back to engineering.\n\n" +
		"Thanks,\nYour Name"
	parsed, err := ParseTemplate(tmpl)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	got := parsed.Render(nil, map[string]string{"hook": "Nice work on the launch."})

	want := "Hi there,\n\nNice work on the launch.\n\n" +
		"I've spent the past 5 years at Lockheed Martin across a number of roles to help drive customer success. Most recently, I've been embedded with customer teams, leading enterprise deployments and bringing real feedback back to engineering.\n\n" +
		"Thanks,\nYour Name"
	if got != want {
		t.Errorf("dewrap mismatch:\n got: %q\nwant: %q", got, want)
	}
}
