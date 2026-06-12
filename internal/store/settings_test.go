package store

import "testing"

func TestSettingsRoundTrip(t *testing.T) {
	db := openTestDB(t)

	// Get on an absent key returns ("", nil) — not an error.
	got, err := db.GetSetting(AnthropicKeySetting)
	if err != nil {
		t.Fatalf("get absent: %v", err)
	}
	if got != "" {
		t.Fatalf("get absent = %q, want empty", got)
	}

	// Set then Get round-trips.
	if err := db.SetSetting(AnthropicKeySetting, "sk-abc"); err != nil {
		t.Fatalf("set: %v", err)
	}
	got, err = db.GetSetting(AnthropicKeySetting)
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if got != "sk-abc" {
		t.Fatalf("get = %q, want sk-abc", got)
	}

	// Set again upserts (no duplicate-key error, value replaced).
	if err := db.SetSetting(AnthropicKeySetting, "sk-def"); err != nil {
		t.Fatalf("re-set: %v", err)
	}
	if got, _ := db.GetSetting(AnthropicKeySetting); got != "sk-def" {
		t.Fatalf("get after re-set = %q, want sk-def", got)
	}

	// Delete removes it; a second delete is a no-op.
	if err := db.DeleteSetting(AnthropicKeySetting); err != nil {
		t.Fatalf("delete: %v", err)
	}
	if got, _ := db.GetSetting(AnthropicKeySetting); got != "" {
		t.Fatalf("get after delete = %q, want empty", got)
	}
	if err := db.DeleteSetting(AnthropicKeySetting); err != nil {
		t.Fatalf("delete absent: %v", err)
	}
}
