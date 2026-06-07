// scout — personal job-research pipeline.
//
// Subcommands:
//
//	scout ingest <csv>        Load a CSV dump into the local DB.
//	scout filter              Apply taste.toml rules; print survivors.
//	scout enrich              Fetch about-pages for survivors (parallel).
//	scout verdict             Score enriched survivors with Haiku.
//	scout distill             Print the company-fit brief (recall + synthesis); debug.
//	scout serve               Web control surface + triage UI (primary interface).
//	scout stats               Show DB row counts.
package main

import (
	"context"
	"flag"
	"fmt"
	"io"
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
	"github.com/slaguardia/scout/internal/criteria"
	"github.com/slaguardia/scout/internal/distill"
	"github.com/slaguardia/scout/internal/enrich"
	"github.com/slaguardia/scout/internal/filter"
	"github.com/slaguardia/scout/internal/ingest"
	"github.com/slaguardia/scout/internal/jobs"
	"github.com/slaguardia/scout/internal/outreach"
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

// defaultDistillModel is the model for the once-per-run distiller (classify +
// synthesize). It defaults to Sonnet — the call is cheap (twice per run) and
// fidelity there matters: a weaker model drops sub-exclusions. Per-company
// verdict scoring stays on the cheaper anthropic.DefaultModel (Haiku).
const defaultDistillModel = "claude-sonnet-4-6"

// defaultOutreachModel is the model for all five outreach pipeline agents
// (researcher through honesty checker). Sonnet: the honesty checker's
// "a false pass costs more than a false fail" rule rules out cheaping out, and
// the researcher needs strong tool use for the hosted web_search pass.
const defaultOutreachModel = "claude-sonnet-4-6"

// defaultBrainCacheTTL is how long a locally-cached distilled brief is reused
// before scout re-distills. The brief changes rarely, so a few hours keeps runs
// from re-hitting the brain (and the LLM) without serving badly stale criteria.
const defaultBrainCacheTTL = 6 * time.Hour

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
	case "distill":
		exit(cmdDistill(args))
	case "outreach":
		exit(cmdOutreach(args))
	case "serve":
		exit(cmdServe(args))
	case "stats":
		exit(cmdStats(args))
	case "backup":
		exit(cmdBackup(args))
	case "restore":
		exit(cmdRestore(args))
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
  scout enrich [--workers 8] [--timeout 12s] [--force] [--company id,...] [--db scout.db]
  scout verdict [--taste-md taste.md] [--playbook playbook.md] [--brainbot URL]
                [--model claude-haiku-4-5] [--workers 4] [--force] [--company id,...] [--db scout.db]
  scout distill [--brainbot URL] [--model claude-sonnet-4-6] [--k N]
  scout outreach map [--brainbot URL]
  scout outreach pin --block NAME --pages id1,id2|file:/path [--approve] [--brainbot URL] [--db scout.db]
  scout outreach set --block NAME (--text S | --file PATH | <stdin) [--db scout.db]
  scout outreach blocks [--full] [--brainbot URL] [--db scout.db]
  scout outreach draft --posting <id> [--model claude-sonnet-4-6] [--db scout.db]
  scout serve [--addr :8765] [--taste-md taste.md] [--taste taste.toml]
              [--playbook playbook.md] [--source crunchbase] [--brainbot URL] [--db scout.db]
  scout stats [--db scout.db]
  scout backup [--db scout.db] [--out scout-YYYYMMDD-HHMMSS.db]
  scout restore <snapshot.db> [--db scout.db] [--force]

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
	fmt.Printf("read=%d upserted=%d (%d new, %d merged, %d name-collisions) skipped=%d errors=%d\n",
		res.Read, res.Upserted, res.Upserted-res.Merged, res.Merged, res.Collisions, res.Skipped, len(res.Errors))
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
		fmt.Fprintf(w, "%s\t%s\t%s\t%s\t%d\t%s\n",
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
	onlyBlanks := fs.Bool("only-blanks", false, "only companies with no enrichment row yet")
	companies := fs.String("company", "", "comma-separated company IDs; re-fetch exactly these")
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

	e := &enrich.Enricher{DB: db, Workers: *workers, Timeout: *timeout, OnlyBlanks: *onlyBlanks, CompanyIDs: splitIDs(*companies)}
	// Fact extraction is best-effort: with a key, blank company columns are
	// filled from the fetched page; without one, enrichment is fetch-only.
	if ac := anthropic.New(""); ac.APIKey != "" {
		e.LLM = ac
	}
	res, err := e.Run(ctx, *force)
	if err != nil {
		return err
	}
	fmt.Printf("considered=%d fetched=%d ok=%d failed=%d filled=%d\n",
		res.Considered, res.Fetched, res.OK, res.Failed, res.Filled)
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
	cacheTTL := fs.Duration("brain-cache-ttl", defaultBrainCacheTTL, "reuse a cached brain profile for this long before refetching")
	model := fs.String("model", anthropic.DefaultModel, "Anthropic model for scoring")
	distillModel := fs.String("distill-model", defaultDistillModel, "Anthropic model for the once-per-run distiller (classify+synthesize)")
	workers := fs.Int("workers", 4, "parallel API calls")
	force := fs.Bool("force", false, "re-score even if taste_version matches")
	onlyBlanksV := fs.Bool("only-blanks", false, "only companies with no verdict row yet")
	companiesV := fs.String("company", "", "comma-separated company IDs; re-score exactly these (overrides manual verdicts)")
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

	// Resolve criteria via the shared resolver: a TTL-cached distilled brief
	// (primary), with taste.md as the offline fallback. See internal/criteria.
	// One Anthropic client serves both the distiller and the verdict scorer.
	logLine := func(line string) { fmt.Fprintln(os.Stderr, line) }
	ac := anthropic.New("")
	resolver := &criteria.Resolver{
		Store:       db,
		TasteMDPath: *tasteMD,
		TTL:         *cacheTTL,
		Log:         logLine,
	}
	// Only set Brain+Distiller when the brain is configured — assigning a nil
	// *Distiller to the interface field would make it a non-nil typed nil and
	// defeat the resolver's nil check.
	if *brainbotURL != "" {
		bc := brainbot.New(*brainbotURL)
		resolver.Brain = bc
		resolver.Distiller = &distill.Distiller{
			Brain:  bc,
			Client: ac,
			Model:  *distillModel,
			Log:    logLine,
		}
	}
	tb, err := resolver.Resolve(ctx)
	if err != nil {
		return err
	}

	// Load the optional playbook (how-to-decide). Folding it into the taste
	// version means a playbook edit re-scores everything, same as a taste edit.
	pbText, err := playbook.Load(*playbookPath)
	if err != nil {
		return err
	}
	if pbText != "" {
		// Fold the playbook into the version (not the brief text): tb.Version is
		// already the stable basis hash, so a playbook edit re-scores while
		// cosmetic brief drift does not.
		tb.Version = taste.Hash(pbText + "\n---taste---\n" + tb.Version)
		tb.Source = tb.Source + " + " + *playbookPath
	}

	fmt.Printf("taste source=%s version=%s\n", tb.Source, tb.Version)

	s := &verdict.Scorer{
		DB:         db,
		Taste:      tb,
		Filter:     ft,
		Client:     ac,
		Model:      *model,
		Playbook:   pbText,
		Force:      *force,
		OnlyBlanks: *onlyBlanksV,
		CompanyIDs: splitIDs(*companiesV),
		Workers:    *workers,
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

// --- distill (debug) ---

// cmdDistill runs the company-fit distillation and prints the recalled chunks
// and the synthesized brief, without scoring anything. It's the CLI tuning
// instrument: eyeball what the brain returned and what the distiller made of it.
func cmdDistill(args []string) error {
	fs := flag.NewFlagSet("distill", flag.ExitOnError)
	brainbotURL := fs.String("brainbot", defaultBrainURL, "brain base URL (HTTP)")
	model := fs.String("model", defaultDistillModel, "Anthropic model for the distiller (classify+synthesize)")
	k := fs.Int("k", 0, "per-question recall depth (0 = distiller default)")
	if err := fs.Parse(args); err != nil {
		return err
	}
	if *brainbotURL == "" {
		return fmt.Errorf("distill: --brainbot is required (nothing to distill without a brain)")
	}

	ctx, cancel := signalCtx()
	defer cancel()

	d := &distill.Distiller{
		Brain:  brainbot.New(*brainbotURL),
		Client: anthropic.New(""),
		Model:  *model,
		K:      *k,
		Log:    func(line string) { fmt.Fprintln(os.Stderr, line) },
	}
	res, err := d.Run(ctx)
	if err != nil {
		return err
	}

	fmt.Printf("\n=== chunks (%d) ===\n", len(res.Chunks))
	for _, c := range res.Chunks {
		fmt.Printf("\n--- %s (score %.4f) ---\n%s\n", chunkSourceLabel(c), c.Score, c.Text)
	}
	fmt.Printf("\n=== classified items ===\n%s\n", res.Items)
	fmt.Printf("\n=== brief ===\n%s\n", res.Brief)
	return nil
}

// chunkSourceLabel mirrors the distiller's internal label for display.
func chunkSourceLabel(c brainbot.Chunk) string {
	switch {
	case c.Path != "" && c.Heading != "" && c.Path != c.Heading:
		return c.Path + " — " + c.Heading
	case c.Path != "":
		return c.Path
	case c.Heading != "":
		return c.Heading
	default:
		return "(untitled)"
	}
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
	cacheTTL := fs.Duration("brain-cache-ttl", defaultBrainCacheTTL, "reuse a cached brain profile for this long before refetching")
	distillModel := fs.String("distill-model", defaultDistillModel, "Anthropic model for the once-per-run distiller (classify+synthesize)")
	outreachModel := fs.String("outreach-model", defaultOutreachModel, "Anthropic model for the outreach pipeline (all five agents)")
	if err := fs.Parse(args); err != nil {
		return err
	}
	db, err := store.Open(*dbPath)
	if err != nil {
		return err
	}
	defer db.Close()

	logLine := func(line string) { fmt.Fprintln(os.Stderr, line) }
	ac := anthropic.New("") // key from ANTHROPIC_API_KEY; verdict + distill gated on it

	var bc *brainbot.Client
	resolver := &criteria.Resolver{
		Store:       db,
		TasteMDPath: *tasteMD,
		TTL:         *cacheTTL,
		Log:         logLine,
	}
	// See cmdVerdict: set Brain+Distiller only when the brain is configured, to
	// avoid a typed-nil interface defeating the resolver's nil check.
	if *brainbotURL != "" {
		bc = brainbot.New(*brainbotURL) // shared with the server's health probes
		resolver.Brain = bc
		resolver.Distiller = &distill.Distiller{Brain: bc, Client: ac, Model: *distillModel, Log: logLine}
	}

	srv := &web.Server{
		DB:            db,
		Brainbot:      bc,
		Anthropic:     ac,
		TasteMDPath:   *tasteMD,
		TasteTOMLPath: *tasteTOML,
		PlaybookPath:  *playbookPath,
		IngestSource:  *source,
		Resolver:      resolver,
	}
	// Load taste + playbook into the server (folds playbook into the version,
	// matching `scout verdict`). Re-run after every editor PUT.
	srv.ReloadTaste()

	// Wire the outreach draft engine when the API key is configured; without a
	// key, draft starts return 503 (the panel surfaces that). The engine reads
	// only the local block cache at draft time — never the brain.
	if ac.APIKey != "" {
		// Reap drafts orphaned in `researching` by a previous process — they
		// block new drafts for their posting and the panel polls them forever.
		if n, err := db.ReapStuckOutreachDrafts(0); err != nil {
			fmt.Fprintf(os.Stderr, "outreach: reap stuck drafts: %v\n", err)
		} else if n > 0 {
			fmt.Fprintf(os.Stderr, "outreach: failed %d draft(s) orphaned by a restart\n", n)
		}
		srv.Outreach = &outreach.Engine{DB: db, Client: ac, Model: *outreachModel, Log: logLine}
		fmt.Fprintf(os.Stderr, "outreach drafting enabled (model %s)\n", *outreachModel)
	} else {
		fmt.Fprintln(os.Stderr, "outreach drafting disabled (no ANTHROPIC_API_KEY)")
	}

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

// --- backup / restore ---

// cmdBackup writes a consistent, single-file snapshot of the live DB via
// SQLite's VACUUM INTO. Safe to run while `scout serve` is up. The snapshot is
// self-contained (no -wal/-shm sidecars) — scp it to the server and `restore`.
func cmdBackup(args []string) error {
	fs := flag.NewFlagSet("backup", flag.ExitOnError)
	dbPath := fs.String("db", "scout.db", "sqlite path")
	out := fs.String("out", "", "snapshot path (default scout-<timestamp>.db)")
	if err := fs.Parse(args); err != nil {
		return err
	}
	dest := *out
	if dest == "" {
		dest = fmt.Sprintf("scout-%s.db", time.Now().Format("20060102-150405"))
	}
	if _, err := os.Stat(dest); err == nil {
		return fmt.Errorf("refusing to overwrite existing %s", dest)
	}
	db, err := store.Open(*dbPath)
	if err != nil {
		return err
	}
	defer db.Close()
	if err := db.Backup(dest); err != nil {
		return err
	}
	info, err := os.Stat(dest)
	if err != nil {
		return err
	}
	fmt.Printf("backup written: %s (%.1f MB)\n", dest, float64(info.Size())/(1<<20))
	return nil
}

// cmdRestore makes a snapshot file the live database. It validates the snapshot
// (integrity_check + applies any pending migrations so an older backup is
// upgraded to the current schema), moves the existing DB aside to <db>.pre-restore,
// removes stale -wal/-shm sidecars, then swaps the snapshot into place.
func cmdRestore(args []string) error {
	fs := flag.NewFlagSet("restore", flag.ExitOnError)
	dbPath := fs.String("db", "scout.db", "live sqlite path to restore into")
	force := fs.Bool("force", false, "overwrite an existing DB without keeping a .pre-restore copy")
	// Go's flag package stops at the first positional, so a flag after the
	// snapshot path (`restore snap.db --db X`) would be silently ignored. Reparse
	// until no positionals remain so flag/arg order doesn't matter.
	var src string
	for {
		if err := fs.Parse(args); err != nil {
			return err
		}
		if fs.NArg() == 0 {
			break
		}
		if src == "" {
			src = fs.Arg(0)
		}
		args = fs.Args()[1:]
	}
	if src == "" {
		return fmt.Errorf("restore: want a snapshot path: scout restore <snapshot.db>")
	}
	if _, err := os.Stat(src); err != nil {
		return fmt.Errorf("snapshot %s: %w", src, err)
	}

	// Stage the snapshot in a temp copy alongside the target, validate + migrate
	// it there, so a corrupt or incompatible snapshot never touches the live DB.
	staged := *dbPath + ".restoring"
	_ = os.Remove(staged)
	_ = os.Remove(staged + "-wal")
	_ = os.Remove(staged + "-shm")
	if err := copyFile(src, staged); err != nil {
		return fmt.Errorf("stage snapshot: %w", err)
	}
	defer func() {
		_ = os.Remove(staged)
		_ = os.Remove(staged + "-wal")
		_ = os.Remove(staged + "-shm")
	}()
	sdb, err := store.Open(staged) // validates it's SQLite + applies pending migrations
	if err != nil {
		return fmt.Errorf("open snapshot: %w", err)
	}
	if err := sdb.IntegrityCheck(); err != nil {
		_ = sdb.Close()
		return err
	}
	if err := sdb.Close(); err != nil {
		return err
	}

	// Swap into place. Keep the displaced DB unless --force.
	if _, err := os.Stat(*dbPath); err == nil {
		if *force {
			_ = os.Remove(*dbPath)
		} else {
			aside := *dbPath + ".pre-restore"
			if err := os.Rename(*dbPath, aside); err != nil {
				return fmt.Errorf("move existing db aside: %w", err)
			}
			fmt.Printf("existing db kept at %s\n", aside)
		}
	}
	// Drop stale sidecars from the old live DB; the staged file has its own.
	_ = os.Remove(*dbPath + "-wal")
	_ = os.Remove(*dbPath + "-shm")
	if err := os.Rename(staged, *dbPath); err != nil {
		return fmt.Errorf("install snapshot: %w", err)
	}
	fmt.Printf("restored %s -> %s\n", src, *dbPath)
	return nil
}

// copyFile copies src to dst, creating dst (it must not need to be atomic; the
// caller stages into a temp path and renames into place afterward).
func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	if _, err := io.Copy(out, in); err != nil {
		_ = out.Close()
		return err
	}
	return out.Close()
}

// --- helpers ---

func signalCtx() (context.Context, context.CancelFunc) {
	return signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
}

// splitIDs parses a comma-separated --company value into trimmed, non-empty IDs.
func splitIDs(s string) []string {
	var out []string
	for _, id := range strings.Split(s, ",") {
		if id = strings.TrimSpace(id); id != "" {
			out = append(out, id)
		}
	}
	return out
}

func exit(err error) {
	if err != nil {
		fmt.Fprintln(os.Stderr, "error:", err)
		os.Exit(1)
	}
}

// --- outreach (blocks debug + pinning) ---

// cmdOutreach manages the outreach context blocks: `map` prints the brain's
// document tree (where pinnable ids come from), `pin` binds a block slot to
// page ids, and `blocks` syncs every pinned block and prints the result —
// the debug instrument for the retrieval layer, mirroring `scout distill`.
func cmdOutreach(args []string) error {
	if len(args) < 1 {
		return fmt.Errorf("outreach: want a subcommand: map | pin | set | blocks | draft")
	}
	switch args[0] {
	case "map":
		return cmdOutreachMap(args[1:])
	case "pin":
		return cmdOutreachPin(args[1:])
	case "set":
		return cmdOutreachSet(args[1:])
	case "blocks":
		return cmdOutreachBlocks(args[1:])
	case "draft":
		return cmdOutreachDraft(args[1:])
	default:
		return fmt.Errorf("outreach: unknown subcommand %q (want map | pin | set | blocks | draft)", args[0])
	}
}

func cmdOutreachMap(args []string) error {
	fs := flag.NewFlagSet("outreach map", flag.ExitOnError)
	brainbotURL := fs.String("brainbot", defaultBrainURL, "brain base URL (HTTP)")
	if err := fs.Parse(args); err != nil {
		return err
	}
	ctx, cancel := signalCtx()
	defer cancel()
	m, err := brainbot.New(*brainbotURL).Map(ctx)
	if err != nil {
		return err
	}
	for _, s := range m.Sources {
		fmt.Printf("%s  %-40s  %s\n", s.ID, s.Path, s.Version)
	}
	return nil
}

func cmdOutreachPin(args []string) error {
	fs := flag.NewFlagSet("outreach pin", flag.ExitOnError)
	dbPath := fs.String("db", "scout.db", "sqlite path")
	brainbotURL := fs.String("brainbot", defaultBrainURL, "brain base URL (HTTP)")
	block := fs.String("block", "", "block slot name (e.g. VOICE_RULES)")
	pages := fs.String("pages", "", "comma-separated brain page ids, in order (empty = unpin)")
	approve := fs.Bool("approve", false, "locked blocks: approve the pages' CURRENT brain versions")
	if err := fs.Parse(args); err != nil {
		return err
	}
	slot := outreach.SlotByName(*block)
	if slot == nil {
		return fmt.Errorf("outreach pin: unknown block %q", *block)
	}
	if slot.Tier == outreach.TierDerived {
		return fmt.Errorf("outreach pin: %s is a derived block — it is synthesized, not pinned", slot.Name)
	}

	db, err := store.Open(*dbPath)
	if err != nil {
		return err
	}
	defer db.Close()

	var ids []string
	for _, id := range strings.Split(*pages, ",") {
		if id = strings.TrimSpace(id); id != "" {
			ids = append(ids, id)
		}
	}
	if len(ids) == 0 {
		if err := db.SetOutreachPin(slot.Name, nil, ""); err != nil {
			return err
		}
		fmt.Printf("unpinned %s\n", slot.Name)
		return nil
	}

	// Locked blocks record the approved upstream version at pin time; sync
	// halts the block on any drift. --approve fetches and stamps it.
	approvedVersion := ""
	if slot.Tier == outreach.TierLocked {
		if !*approve {
			return fmt.Errorf("outreach pin: %s is locked — re-run with --approve to accept the pages' current versions", slot.Name)
		}
		ctx, cancel := signalCtx()
		defer cancel()
		brain := brainbot.New(*brainbotURL)
		versions := make([]string, 0, len(ids))
		for _, id := range ids {
			_, version, err := outreach.FetchPin(ctx, brain, id)
			if err != nil {
				return fmt.Errorf("outreach pin: fetch %s for approval: %w", id, err)
			}
			versions = append(versions, version)
		}
		approvedVersion = strings.Join(versions, "+")
	}
	if err := db.SetOutreachPin(slot.Name, ids, approvedVersion); err != nil {
		return err
	}
	fmt.Printf("pinned %s -> %s", slot.Name, strings.Join(ids, ", "))
	if approvedVersion != "" {
		fmt.Printf(" (approved %s)", approvedVersion)
	}
	fmt.Println()
	return nil
}

func cmdOutreachBlocks(args []string) error {
	fs := flag.NewFlagSet("outreach blocks", flag.ExitOnError)
	dbPath := fs.String("db", "scout.db", "sqlite path")
	brainbotURL := fs.String("brainbot", defaultBrainURL, "brain base URL (HTTP)")
	full := fs.Bool("full", false, "print full block contents, not previews")
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
	statuses, err := outreach.Sync(ctx, brainbot.New(*brainbotURL), db)
	if err != nil {
		return err
	}
	for _, st := range statuses {
		fmt.Printf("%-22s %-8s %-10s %s", st.Block, st.Tier, st.State, st.Version)
		if st.Detail != "" {
			fmt.Printf("  %s", st.Detail)
		}
		fmt.Println()
		if st.State == "ok" || st.State == "unchanged" {
			if b, err := db.GetOutreachBlock(st.Block); err == nil && b != nil {
				body := b.Content
				if !*full && len(body) > 240 {
					body = body[:240] + " …"
				}
				fmt.Printf("    %s\n", strings.ReplaceAll(body, "\n", "\n    "))
			}
		}
	}
	return nil
}

// cmdOutreachDraft runs the full outreach pipeline against one posting,
// synchronously: it creates the draft row, streams stage progress to stderr via
// the engine's Log, and prints the final draft text + status + lint findings to
// stdout. The CLI counterpart of the fire-and-forget panel button.
func cmdOutreachDraft(args []string) error {
	fs := flag.NewFlagSet("outreach draft", flag.ExitOnError)
	dbPath := fs.String("db", "scout.db", "sqlite path")
	posting := fs.String("posting", "", "job_postings.id to draft outreach for")
	model := fs.String("model", defaultOutreachModel, "Anthropic model for the outreach pipeline (all five agents)")
	if err := fs.Parse(args); err != nil {
		return err
	}
	if strings.TrimSpace(*posting) == "" {
		return fmt.Errorf("outreach draft: --posting <id> is required")
	}

	db, err := store.Open(*dbPath)
	if err != nil {
		return err
	}
	defer db.Close()

	// Gate on the required context blocks being healthy (mirrors the web POST).
	if missing, err := outreach.MissingBlocks(db); err != nil {
		return err
	} else if len(missing) > 0 {
		return fmt.Errorf("outreach draft: required blocks missing or broken: %s (pin and sync them first)", strings.Join(missing, ", "))
	}

	// Reap drafts long-orphaned in `researching` (a dead process) so they don't
	// block this posting forever. 30-minute threshold: never kills a live run
	// owned by a serve process (the pipeline times out well before that).
	if n, _ := db.ReapStuckOutreachDrafts(30); n > 0 {
		fmt.Fprintf(os.Stderr, "reaped %d stuck draft(s)\n", n)
	}

	d, err := db.CreateOutreachDraft(*posting)
	if err != nil {
		return fmt.Errorf("outreach draft: %w", err)
	}

	eng := &outreach.Engine{
		DB:     db,
		Client: anthropic.New(""),
		Model:  *model,
		Log:    func(line string) { fmt.Fprintln(os.Stderr, line) },
	}
	ctx, cancel := signalCtx()
	defer cancel()
	if err := eng.Run(ctx, d.ID); err != nil {
		return fmt.Errorf("outreach draft: %w", err)
	}

	out, err := db.GetOutreachDraft(d.ID)
	if err != nil || out == nil {
		return fmt.Errorf("outreach draft: read back draft %d: %w", d.ID, err)
	}
	fmt.Printf("status: %s\n", out.Status)
	if out.FailReason != "" {
		fmt.Printf("fail_reason: %s\n", out.FailReason)
	}
	if out.Violations != "" && out.Violations != "null" {
		fmt.Printf("violations: %s\n", out.Violations)
	}
	if out.Lint != "" && out.Lint != "[]" {
		fmt.Printf("lint: %s\n", out.Lint)
	}
	fmt.Println("---")
	fmt.Println(out.Draft)
	return nil
}

// cmdOutreachSet stores user-declared block content directly (no pin, no
// brain) — the path for P2_LOCKED, whose frozen paragraph is a decision the
// user makes, not a doc to discover. Content comes from --text, --file, or
// stdin; for locked blocks the declaration is the approval.
func cmdOutreachSet(args []string) error {
	fs := flag.NewFlagSet("outreach set", flag.ExitOnError)
	dbPath := fs.String("db", "scout.db", "sqlite path")
	block := fs.String("block", "", "block slot name (e.g. P2_LOCKED)")
	text := fs.String("text", "", "block content (inline)")
	file := fs.String("file", "", "block content (file path)")
	if err := fs.Parse(args); err != nil {
		return err
	}
	content := *text
	if content == "" && *file != "" {
		data, err := os.ReadFile(*file)
		if err != nil {
			return fmt.Errorf("outreach set: %w", err)
		}
		content = string(data)
	}
	if content == "" {
		data, err := io.ReadAll(os.Stdin)
		if err != nil {
			return fmt.Errorf("outreach set: read stdin: %w", err)
		}
		content = string(data)
	}

	db, err := store.Open(*dbPath)
	if err != nil {
		return err
	}
	defer db.Close()
	version, err := outreach.DeclareBlock(db, *block, content)
	if err != nil {
		return fmt.Errorf("outreach set: %w", err)
	}
	fmt.Printf("declared %s (%s, %d bytes)\n", *block, version, len(content))
	return nil
}
