package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoadDotenv(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, ".env")
	content := `# a comment
SCOUT_TEST_PLAIN=hello
export SCOUT_TEST_EXPORTED=world
SCOUT_TEST_DQUOTED="quoted value"
SCOUT_TEST_SQUOTED='single'
SCOUT_TEST_SPACED   =   spaced

SCOUT_TEST_KEYISH=sk-ant-abc=def
`
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatal(err)
	}

	loadDotenv(path)

	cases := map[string]string{
		"SCOUT_TEST_PLAIN":    "hello",
		"SCOUT_TEST_EXPORTED": "world",
		"SCOUT_TEST_DQUOTED":  "quoted value",
		"SCOUT_TEST_SQUOTED":  "single",
		"SCOUT_TEST_SPACED":   "spaced",
		"SCOUT_TEST_KEYISH":   "sk-ant-abc=def", // only the first '=' splits
	}
	for k, want := range cases {
		if got := os.Getenv(k); got != want {
			t.Errorf("%s = %q, want %q", k, got, want)
		}
		t.Cleanup(func() { os.Unsetenv(k) })
	}
}

func TestLoadDotenvEnvWins(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, ".env")
	if err := os.WriteFile(path, []byte("SCOUT_TEST_PRECEDENCE=from-file\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	t.Setenv("SCOUT_TEST_PRECEDENCE", "from-env") // t.Setenv restores after the test
	loadDotenv(path)
	if got := os.Getenv("SCOUT_TEST_PRECEDENCE"); got != "from-env" {
		t.Fatalf("env var should win over .env, got %q", got)
	}
}

func TestLoadDotenvMissingIsNoOp(t *testing.T) {
	loadDotenv(filepath.Join(t.TempDir(), "does-not-exist.env")) // must not panic
}
