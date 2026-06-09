package outreach

import "testing"

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
}
