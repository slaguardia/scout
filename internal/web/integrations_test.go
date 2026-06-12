package web

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/slaguardia/scout/internal/anthropic"
	"github.com/slaguardia/scout/internal/store"
)

func TestActiveAnthropicKey(t *testing.T) {
	s, _ := newTestServer(t)

	// Neither set -> ("", "").
	t.Setenv("ANTHROPIC_API_KEY", "")
	if k, src := s.activeAnthropicKey(); k != "" || src != "" {
		t.Fatalf("neither: got (%q,%q), want empty", k, src)
	}

	// Only env set -> ("env").
	t.Setenv("ANTHROPIC_API_KEY", "env-key")
	if k, src := s.activeAnthropicKey(); k != "env-key" || src != "env" {
		t.Fatalf("env: got (%q,%q), want (env-key,env)", k, src)
	}

	// DB-stored key wins over env -> ("db").
	if err := s.DB.SetSetting(store.AnthropicKeySetting, "db-key"); err != nil {
		t.Fatalf("set: %v", err)
	}
	if k, src := s.activeAnthropicKey(); k != "db-key" || src != "db" {
		t.Fatalf("db: got (%q,%q), want (db-key,db)", k, src)
	}

	// Removing the DB key falls back to the env.
	if err := s.DB.DeleteSetting(store.AnthropicKeySetting); err != nil {
		t.Fatalf("delete: %v", err)
	}
	if _, src := s.activeAnthropicKey(); src != "env" {
		t.Fatalf("after delete: source = %q, want env", src)
	}
}

func keyReq(t *testing.T, h http.Handler, method, body string) *httptest.ResponseRecorder {
	t.Helper()
	var r *http.Request
	if body == "" {
		r = httptest.NewRequest(method, "/api/integrations/anthropic", nil)
	} else {
		r = httptest.NewRequest(method, "/api/integrations/anthropic", bytes.NewBufferString(body))
		r.Header.Set("Content-Type", "application/json")
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, r)
	return rec
}

func TestAnthropicKeyEndpoint(t *testing.T) {
	t.Setenv("ANTHROPIC_API_KEY", "") // isolate from the host env
	s, _ := newTestServer(t)
	s.Anthropic = &anthropic.Client{} // empty key; PUT must re-key it live
	// Stub the verifier so no network call is made.
	var verifyShouldFail bool
	s.KeyVerifier = func(_ context.Context, _ string) error {
		if verifyShouldFail {
			return errors.New("nope")
		}
		return nil
	}
	h := s.Handler()

	// GET with nothing set -> has_key:false, key_source:null.
	rec := keyReq(t, h, http.MethodGet, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("GET: %d", rec.Code)
	}
	var got map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &got)
	if got["has_key"] != false || got["key_source"] != nil {
		t.Fatalf("GET empty: got %v", got)
	}

	// PUT a rejected key -> 400, nothing stored.
	verifyShouldFail = true
	if rec := keyReq(t, h, http.MethodPut, `{"key":"bad"}`); rec.Code != http.StatusBadRequest {
		t.Fatalf("PUT bad: want 400, got %d", rec.Code)
	}
	if v, _ := s.DB.GetSetting(store.AnthropicKeySetting); v != "" {
		t.Fatalf("rejected key was stored: %q", v)
	}

	// PUT an accepted key -> 200, stored, client re-keyed, key never echoed.
	verifyShouldFail = false
	rec = keyReq(t, h, http.MethodPut, `{"key":"sk-live-123"}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("PUT good: want 200, got %d (%s)", rec.Code, rec.Body.String())
	}
	if strings.Contains(rec.Body.String(), "sk-live-123") {
		t.Fatalf("PUT response leaked the key: %s", rec.Body.String())
	}
	if v, _ := s.DB.GetSetting(store.AnthropicKeySetting); v != "sk-live-123" {
		t.Fatalf("key not stored: %q", v)
	}
	if !s.Anthropic.HasKey() {
		t.Fatalf("client was not re-keyed after PUT")
	}

	// GET now reports the DB key; still never the bytes.
	rec = keyReq(t, h, http.MethodGet, "")
	if strings.Contains(rec.Body.String(), "sk-live-123") {
		t.Fatalf("GET leaked the key: %s", rec.Body.String())
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &got)
	if got["has_key"] != true || got["key_source"] != "db" {
		t.Fatalf("GET after store: got %v", got)
	}

	// /api/meta reflects the stored key (verdict/capture true with no env set).
	mrec := keyReq(t, h, http.MethodGet, "") // warm
	_ = mrec
	mreq := httptest.NewRequest(http.MethodGet, "/api/meta", nil)
	mres := httptest.NewRecorder()
	h.ServeHTTP(mres, mreq)
	var meta map[string]any
	_ = json.Unmarshal(mres.Body.Bytes(), &meta)
	if meta["verdict"] != true || meta["capture"] != true {
		t.Fatalf("meta after store: got %v", meta)
	}

	// DELETE -> falls back to env (set one), key_source:env.
	t.Setenv("ANTHROPIC_API_KEY", "env-fallback")
	rec = keyReq(t, h, http.MethodDelete, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("DELETE: %d", rec.Code)
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &got)
	if got["has_key"] != true || got["key_source"] != "env" {
		t.Fatalf("DELETE falls back to env: got %v", got)
	}
	if v, _ := s.DB.GetSetting(store.AnthropicKeySetting); v != "" {
		t.Fatalf("DB key not removed: %q", v)
	}
	// The client was re-keyed to the env fallback.
	if !s.Anthropic.HasKey() {
		t.Fatalf("client lost its key after DELETE despite env fallback")
	}
}
