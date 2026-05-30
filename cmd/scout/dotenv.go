package main

import (
	"bufio"
	"os"
	"strings"
)

// loadDotenv reads KEY=value lines from a .env file in the working directory
// and sets any that aren't already present in the environment — a real
// environment variable always wins over the file. A missing .env is a no-op.
//
// Dependency-free and deliberately small: supports blank lines, `#` comments,
// an optional `export ` prefix, and matching single/double quotes around the
// value. Not a full dotenv implementation (no interpolation, no multiline).
func loadDotenv(path string) {
	f, err := os.Open(path)
	if err != nil {
		return // no .env (or unreadable) — fine, fall back to the real env
	}
	defer f.Close()

	sc := bufio.NewScanner(f)
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		line = strings.TrimPrefix(line, "export ")
		key, val, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}
		key = strings.TrimSpace(key)
		if key == "" {
			continue
		}
		val = strings.TrimSpace(val)
		if len(val) >= 2 {
			if c := val[0]; (c == '"' || c == '\'') && val[len(val)-1] == c {
				val = val[1 : len(val)-1]
			}
		}
		if _, present := os.LookupEnv(key); !present {
			_ = os.Setenv(key, val)
		}
	}
}
