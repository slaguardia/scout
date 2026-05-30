// scout — personal job-research pipeline.
//
// Subcommands:
//   scout ingest <csv>        Load a CSV dump into the local DB.
//   scout filter              Apply taste.toml rules; print survivors.
//   scout enrich              Fetch about-pages for survivors (parallel).
//   scout verdict             Score enriched survivors with Haiku.
//   scout serve               Web control surface + triage UI (primary interface).
//   scout stats               Show DB row counts.
package main

import (
	"context"
	"flag"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"sort"
	"strings"
	"syscall"
	"text/tabwriter"
	"time"

	"github.com/slaguardia/scout/internal/anthropic"
	"github.com/slaguardia/scout/internal/brainbot"
	"github.com/slaguardia/scout/internal/enrich"
	"github.com/slaguardia/scout/internal/filter"
	"github.com/slaguardia/scout/internal/ingest"
	"github.com/slaguardia/scout/internal/jobs"
	"github.com/slaguardia/scout/internal/playbook"
	"github.com/slaguardia/scout/internal/store"
	"github.com/slaguardia/scout/internal/taste"
	"github.com/slaguardia/scout/internal/verdict"
	"github.com/slaguardia/scout/internal/web"
)

// defaultBrainURL is the brain's standard local address (brainbot serves HTTP
// here; see brainbot/docs/consumer-integration.md). The brain is primary by
// default — scout falls back to taste.md only when it's genuinely unreachable.
const defaultBrainURL = "http://127.0.0.1:8100"

func main() {
	loadDotenv(".env") // project-local config (e.g. ANTHROPIC_API_KEY); real env wins
	if len(os.Args) < 2 {
		usage()
		os.Exit(2)
	}
	cmd := os.Args[1]
	args := os.Args[2:]

	switch cmd {
	case "ingest":
		exit(cmdIngest(args))
	case "filter":
		exit(cmdFilter(args))
	case "enrich":
		exit(cmdEnrich(args))
	case "verdict":
		exit(cmdVerdict(args))
	case "serve":
		exit(cmdServe(args))
	case "stats":
		exit(cmdStats(args))
	case "-h", "--help", "help":
		usage()
	default:
		fmt.Fprintf(os.Stderr, "unknown command: %s\n", cmd)
		usage()
		os.Exit(2)
	}
}

func usage() {
	fmt.Fprintln(os.Stderr, `scout — personal job-research pipeline

The web UI (`+"`scout serve`"+`) is the primary interface; the CLI below is the
secondary automation/debug surface. The brain is primary by default
(`+defaultBrainURL+`); scout falls back to taste.md only when it's unreachable.

Usage:
  scout ingest <csv> [--source crunchbase] [--db scout.db]
  scout filter [--taste taste.toml] [--db scout.db]
  scout enrich [--workers 8] [--timeout 12s] [--force] [--db scout.db]
  scout verdict [--taste-md taste.md] [--playbook playbook.md] [--brainbot URL]
                [--model claude-haiku-4-5] [--workers 4] [--force] [--db scout.db]
  scout serve [--addr :8765] [--taste-md taste.md] [--taste taste.toml]
              [--playbook playbook.md] [--source crunchbase] [--brainbot URL] [--db scout.db]
  scout stats [--db scout.db]

Environment (read from the shell env or a .env file in the working directory):
  ANTHROPIC_API_KEY   required for `+"`verdict`"+`.`)
}

// --- ingest ---

func cmdIngest(args []string) error {
	fs := flag.NewFlagSet("ingest", flag.ExitOnError)
	dbPath := fs.String("db", "scout.db", "sqlite path")
	source := fs.String("source", "crunchbase", "source tag stored on each row")
	if err := fs.Parse(args); err != nil {
		return err
	}
	if fs.NArg() < 1 {
		return fmt.Errorf("ingest: missing csv path")
	}
	path := fs.Arg(0)

	db, err := store.Open(*dbPath)
	if err != nil {
		return err
	}
	defer db.Close()

	csv := &ingest.CSV{Source: *source, DB: db}
	res, err := csv.Run(path)
	if err != nil {
		return err
	}
	fmt.Printf("read=%d upserted=%d skipped=%d errors=%d\n",
		res.Read, res.Upserted, res.Skipped, len(res.Errors))
	for _, e := range res.Errors {
		fmt.Fprintln(os.Stderr, "  err:", e)
	}
	return nil
}

// --- filter ---

func cmdFilter(args []string) error {
	fs := flag.NewFlagSet("filter", flag.ExitOnError)
	dbPath := fs.String("db", "scout.db", "sqlite path")
	tastePath := fs.String("taste", "taste.toml", "taste rules")
	if err := fs.Parse(args); err != nil {
		return err
	}

	t, err := filter.LoadTaste(*tastePath)
	if err != nil {
		return err
	}
	db, err := store.Open(*dbPath)
	if err != nil {
		return err
	}
	defer db.Close()

	res, err := t.Apply(db)
	if err != nil {
		return err
	}

	w := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)
	fmt.Fprintf(w, "id\tname\tlocation\tvertical\theadcount\tstage\n")
	for _, s := range res.Survivors {
		fmt.Fprintf(w, "%d\t%s\t%s\t%s\t%d\t%s\n",
			s.ID, s.Name, s.Location, s.Vertical, s.Headcount, s.Stage)
	}
	w.Flush()

	fmt.Printf("\ntotal=%d survivors=%d\n", res.Total, len(res.Survivors))
	if len(res.DroppedBy) > 0 {
		fmt.Println("dropped by:")
		keys := make([]string, 0, len(res.DroppedBy))
		for k := range res.DroppedBy {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		for _, k := range keys {
			fmt.Printf("  %-22s %d\n", k, res.DroppedBy[k])
		}
	}
	return nil
}

// --- enrich ---

func cmdEnrich(args []string) error {
	fs := flag.NewFlagSet("enrich", flag.ExitOnError)
	dbPath := fs.String("db", "scout.db", "sqlite path")
	workers := fs.Int("workers", 8, "parallel fetchers")
	timeout := fs.Duration("timeout", 12*time.Second, "per-request timeout")
	force := fs.Bool("force", false, "re-fetch even if cached")
	if err := fs.Parse(args); err != nil {
		return err
	}

	db, err := store.Open(*dbPath)
	if err != nil {
		return err
	}
	defer db.Close()

	ctx, cancel := signalCtx()
	defer cancel()

	e := &enrich.Enricher{DB: db, Workers: *workers, Timeout: *timeout}
	res, err := e.Run(ctx, *force)
	if err != nil {
		return err
	}
	fmt.Printf("considered=%d fetched=%d ok=%d failed=%d\n",
		res.Considered, res.Fetched, res.OK, res.Failed)
	return nil
}

// --- verdict ---

func cmdVerdict(args []string) error {
	fs := flag.NewFlagSet("verdict", flag.ExitOnError)
	dbPath := fs.String("db", "scout.db", "sqlite path")
	tastePath := fs.String("taste", "taste.toml", "structured taste rules (for SQL pre-filter)")
	tasteMD := fs.String("taste-md", "taste.md", "narrative taste block (for the LLM)")
	playbookPath := fs.String("playbook", "playbook.md", "agent operating manual (how to decide); optional")
	brainbotURL := fs.String("brainbot", defaultBrainURL, "brain base URL (HTTP); criteria come from here when healthy, else --taste-md. Empty disables.")
	model := fs.String("model", anthropic.DefaultModel, "Anthropic model for scoring")
	workers := fs.Int("workers", 4, "parallel API calls")
	force := fs.Bool("force", false, "re-score even if taste_version matches")
	if err := fs.Parse(args); err != nil {
		return err
	}

	db, err := store.Open(*dbPath)
	if err != nil {
		return err
	}
	defer db.Close()

	ft, err := filter.LoadTaste(*tastePath)
	if err != nil {
		return err
	}

	ctx, cancel := signalCtx()
	defer cancel()

	// Resolve criteria: brain-primary (the episode bodies carry the user's gates
	// and exclusions), taste.md as the offline fallback. The same client (when
	// healthy) also serves per-company recall during scoring.
	var (
		tb *taste.Block
		bc *brainbot.Client
	)
	if *brainbotURL != "" {
		bc = brainbot.New(*brainbotURL)
		hctx, hcancel := context.WithTimeout(ctx, 5*time.Second)
		herr := bc.Health(hctx)
		hcancel()
		switch {
		case herr != nil:
			fmt.Fprintf(os.Stderr, "brain unreachable at %s (%v); falling back to %s\n", *brainbotURL, herr, *tasteMD)
			bc = nil // don't retry a dead brain for every company
		default:
			text, cerr := bc.Criteria(ctx)
			switch {
			case cerr != nil:
				fmt.Fprintf(os.Stderr, "brain criteria fetch failed (%v); falling back to %s\n", cerr, *tasteMD)
			case strings.TrimSpace(text) == "":
				fmt.Fprintf(os.Stderr, "brain is healthy but has no criteria captured yet; using %s until the user captures them\n", *tasteMD)
			default:
				tb = taste.FromBrain(text, "brain:profile@"+*brainbotURL)
			}
		}
	}
	if tb == nil {
		tb, err = taste.LoadFile(*tasteMD)
		if err != nil {
			return err
		}
	}

	// Load the optional playbook (how-to-decide). Folding it into the taste
	// version means a playbook edit re-scores everything, same as a taste edit.
	pbText, err := playbook.Load(*playbookPath)
	if err != nil {
		return err
	}
	if pbText != "" {
		tb.Version = taste.Hash(pbText + "\n---taste---\n" + tb.Text)
		tb.Source = tb.Source + " + " + *playbookPath
	}

	fmt.Printf("taste source=%s version=%s\n", tb.Source, tb.Version)
	if bc != nil && bc.Enabled() {
		fmt.Printf("brain context: enabled (%s)\n", *brainbotURL)
	}

	s := &verdict.Scorer{
		DB:       db,
		Taste:    tb,
		Filter:   ft,
		Client:   anthropic.New(""),
		Model:    *model,
		Playbook: pbText,
		Force:    *force,
		Workers:  *workers,
		Brainbot: bc,
	}
	res, err := s.Run(ctx)
	if err != nil {
		return err
	}
	fmt.Printf("considered=%d scored=%d skipped=%d failed=%d\n",
		res.Considered, res.Scored, res.Skipped, res.Failed)
	if len(res.ByVerdict) > 0 {
		keys := make([]string, 0, len(res.ByVerdict))
		for k := range res.ByVerdict {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		for _, k := range keys {
			fmt.Printf("  %-5s %d\n", k, res.ByVerdict[k])
		}
	}
	if res.CacheCreationTokens > 0 || res.CacheReadTokens > 0 {
		fmt.Printf("cache: created=%d tokens, read=%d tokens\n",
			res.CacheCreationTokens, res.CacheReadTokens)
	}
	return nil
}

// --- serve ---

func cmdServe(args []string) error {
	fs := flag.NewFlagSet("serve", flag.ExitOnError)
	dbPath := fs.String("db", "scout.db", "sqlite path")
	addr := fs.String("addr", ":8765", "listen address")
	tasteMD := fs.String("taste-md", "taste.md", "narrative taste block (editable in the UI)")
	tasteTOML := fs.String("taste", "taste.toml", "structured pre-filter rules (used by UI verdict runs)")
	playbookPath := fs.String("playbook", "playbook.md", "agent operating manual (editable in the UI)")
	source := fs.String("source", "crunchbase", "source tag for UI CSV uploads")
	brainbotURL := fs.String("brainbot", defaultBrainURL, "brain base URL (HTTP); primary criteria source. Empty disables (taste.md fallback).")
	if err := fs.Parse(args); err != nil {
		return err
	}
	db, err := store.Open(*dbPath)
	if err != nil {
		return err
	}
	defer db.Close()

	var bc *brainbot.Client
	if *brainbotURL != "" {
		bc = brainbot.New(*brainbotURL)
	}

	srv := &web.Server{
		DB:            db,
		Brainbot:      bc,
		Anthropic:     anthropic.New(""), // key from ANTHROPIC_API_KEY; verdict runs gated on it
		TasteMDPath:   *tasteMD,
		TasteTOMLPath: *tasteTOML,
		PlaybookPath:  *playbookPath,
		IngestSource:  *source,
	}
	// Load taste + playbook into the server (folds playbook into the version,
	// matching `scout verdict`). Re-run after every editor PUT.
	srv.ReloadTaste()

	// Job runner persists each run to the runs table for durable history.
	runner := jobs.New()
	runner.OnStart = func(id, stage string) {
		tasteVer := ""
		if stage == "verdict" {
			if tb := srv.CurrentTasteVersion(); tb != "" {
				tasteVer = tb
			}
		}
		if err := db.InsertRun(id, stage, tasteVer); err != nil {
			fmt.Fprintln(os.Stderr, "run insert:", err)
		}
	}
	runner.OnFinish = func(id, status string, summary map[string]any, errMsg string) {
		if err := db.FinishRun(id, status, summary, errMsg); err != nil {
			fmt.Fprintln(os.Stderr, "run finish:", err)
		}
	}
	srv.Runner = runner

	server := &http.Server{
		Addr:              *addr,
		Handler:           srv.Handler(),
		ReadHeaderTimeout: 5 * time.Second,
	}

	ctx, cancel := signalCtx()
	defer cancel()
	go func() {
		<-ctx.Done()
		shutCtx, sc := context.WithTimeout(context.Background(), 3*time.Second)
		defer sc()
		_ = server.Shutdown(shutCtx)
	}()

	fmt.Printf("scout triage UI at http://localhost%s\n", *addr)
	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		return err
	}
	return nil
}

// --- stats ---

func cmdStats(args []string) error {
	fs := flag.NewFlagSet("stats", flag.ExitOnError)
	dbPath := fs.String("db", "scout.db", "sqlite path")
	if err := fs.Parse(args); err != nil {
		return err
	}
	db, err := store.Open(*dbPath)
	if err != nil {
		return err
	}
	defer db.Close()
	n, err := db.CountCompanies()
	if err != nil {
		return err
	}
	fmt.Printf("companies=%d\n", n)

	hist, err := db.CountVerdictsByVerdict()
	if err != nil {
		return err
	}
	if len(hist) > 0 {
		keys := make([]string, 0, len(hist))
		for k := range hist {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		fmt.Println("verdicts:")
		for _, k := range keys {
			fmt.Printf("  %-5s %d\n", k, hist[k])
		}
	}
	return nil
}

// --- helpers ---

func signalCtx() (context.Context, context.CancelFunc) {
	return signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
}

func exit(err error) {
	if err != nil {
		fmt.Fprintln(os.Stderr, "error:", err)
		os.Exit(1)
	}
}
