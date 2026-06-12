package outreach

import (
	"strings"
	"testing"
)

func TestVoiceFindings(t *testing.T) {
	codes := func(fs []LintFinding) map[string]bool {
		m := map[string]bool{}
		for _, f := range fs {
			m[f.Code] = true
		}
		return m
	}

	if fs := VoiceFindings("Plain honest words about the work I did."); len(fs) != 0 {
		t.Errorf("clean text flagged: %+v", fs)
	}
	if !codes(VoiceFindings("It caught my eye — specifically the framing."))["em_dash"] {
		t.Error("em dash not flagged")
	}
	if !codes(VoiceFindings("I'm excited to chat and pick your brain."))["banned_phrase"] {
		t.Error("banned phrase not flagged")
	}
	// The doctrine kill list.
	for _, bad := range []string{
		"I hope this email finds you well.",
		"My name is Alex and I work on infra.",
		"I'm writing to ask about the role.",
		"I am writing to follow up.",
		"I just applied for the FDE role.",
		"Acme is a leader in the observability space.",
	} {
		if !codes(VoiceFindings(bad))["banned_phrase"] {
			t.Errorf("kill-list phrase not flagged: %q", bad)
		}
	}
}

func TestLengthFindings(t *testing.T) {
	words := func(n int) string {
		return strings.TrimSpace(strings.Repeat("word ", n))
	}

	// Under the flag line: nothing.
	if fs := LengthFindings("Subject: hi\n\n" + words(120)); len(fs) != 0 {
		t.Errorf("120-word body flagged: %+v", fs)
	}
	if fs := LengthFindings("Subject: hi\n\n" + words(130)); len(fs) != 0 {
		t.Errorf("130-word body flagged (the line is >130): %+v", fs)
	}

	// Over: flagged with the count.
	fs := LengthFindings("Subject: hi\n\n" + words(150))
	if len(fs) != 1 || fs[0].Code != "too_long" {
		t.Fatalf("150-word body: %+v", fs)
	}
	if want := "email body is 150 words (doctrine target ≤120)"; fs[0].Message != want {
		t.Errorf("message = %q, want %q", fs[0].Message, want)
	}

	// The subject line's words don't count: 10 subject words + 125 body words
	// stays under the flag line.
	subject := "Subject: " + words(9)
	if fs := LengthFindings(subject + "\n\n" + words(125)); len(fs) != 0 {
		t.Errorf("subject words counted toward the body: %+v", fs)
	}

	// No subject line: the whole text is the body.
	if fs := LengthFindings(words(140)); len(fs) != 1 {
		t.Errorf("subject-less email not counted whole: %+v", fs)
	}
}
