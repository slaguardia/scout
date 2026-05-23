// scout — personal job-research pipeline.
//
// Subcommands:
//   scout ingest <csv>        Load a CSV dump into the local DB.
//   scout filter              Apply taste.toml rules; print survivors.
//   scout stats               Show DB row counts.
package main

import (
	"flag"
	"fmt"
	"os"
	"sort"
	"text/tabwriter"

	"github.com/stevenlaguardia/scout/internal/filter"
	"github.com/stevenlaguardia/scout/internal/ingest"
	"github.com/stevenlaguardia/scout/internal/store"
)

func main() {
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

Usage:
  scout ingest <csv> [--source crunchbase] [--db scout.db]
  scout filter [--taste taste.toml] [--db scout.db]
  scout stats [--db scout.db]`)
}

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
	return nil
}

func exit(err error) {
	if err != nil {
		fmt.Fprintln(os.Stderr, "error:", err)
		os.Exit(1)
	}
}
