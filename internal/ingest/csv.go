// Package ingest reads source dumps (Crunchbase CSV first) into the store.
package ingest

import (
	"database/sql"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"strconv"
	"strings"

	"github.com/slaguardia/scout/internal/store"
)

// columnAliases maps our canonical field -> candidate CSV header names (case-insensitive, normalized).
// Crunchbase exports vary; we try multiple known shapes. Unknown headers still get preserved in raw_json.
var columnAliases = map[string][]string{
	"name":          {"name", "organization name", "company", "company name"},
	"source_id":     {"uuid", "id", "cb_id", "crunchbase uuid"},
	"domain":        {"domain", "website", "homepage url", "url"},
	"headcount":     {"headcount", "employees", "number of employees", "employee count"},
	"funding_stage": {"funding stage", "last funding type", "stage", "last funding round"},
	"location":      {"location", "headquarters location", "hq location", "city", "headquarters"},
	"vertical":      {"vertical", "industry", "industries", "category", "categories"},
}

// CSV ingests a CSV file. source is a short tag stored in the row ("crunchbase", "manual", etc.).
type CSV struct {
	Source string
	DB     *store.DB
}

// Result reports how a run went.
type Result struct {
	Read     int
	Upserted int
	Skipped  int
	Errors   []string
}

// Run reads path and upserts every data row. The first row must be a header.
func (c *CSV) Run(path string) (*Result, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("open csv: %w", err)
	}
	defer f.Close()

	r := csv.NewReader(f)
	r.FieldsPerRecord = -1 // tolerate ragged rows
	r.LazyQuotes = true

	header, err := r.Read()
	if err != nil {
		return nil, fmt.Errorf("read header: %w", err)
	}
	idx := indexHeader(header)

	res := &Result{}
	for {
		row, err := r.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			res.Errors = append(res.Errors, err.Error())
			continue
		}
		res.Read++

		raw := rowAsMap(header, row)
		name := pick(idx, row, "name")
		if name == "" {
			res.Skipped++
			continue
		}

		rawJSON, _ := json.Marshal(raw)
		company := store.Company{
			Source:       c.Source,
			SourceID:     nullStr(pick(idx, row, "source_id")),
			Name:         name,
			Domain:       nullStr(normalizeDomain(pick(idx, row, "domain"))),
			Headcount:    nullHeadcount(pick(idx, row, "headcount")),
			FundingStage: nullStr(pick(idx, row, "funding_stage")),
			Location:     nullStr(pick(idx, row, "location")),
			Vertical:     nullStr(pick(idx, row, "vertical")),
			RawJSON:      string(rawJSON),
		}
		if _, err := c.DB.UpsertCompany(company); err != nil {
			res.Errors = append(res.Errors, err.Error())
			continue
		}
		res.Upserted++
	}
	return res, nil
}

// indexHeader returns canonical-field -> column index, picking the first alias that matches.
func indexHeader(header []string) map[string]int {
	norm := make(map[string]int, len(header))
	for i, h := range header {
		norm[normalize(h)] = i
	}
	out := make(map[string]int, len(columnAliases))
	for canonical, aliases := range columnAliases {
		for _, a := range aliases {
			if i, ok := norm[normalize(a)]; ok {
				out[canonical] = i
				break
			}
		}
	}
	return out
}

func rowAsMap(header, row []string) map[string]string {
	out := make(map[string]string, len(header))
	for i, h := range header {
		if i >= len(row) {
			break
		}
		out[h] = row[i]
	}
	return out
}

func pick(idx map[string]int, row []string, key string) string {
	col, ok := idx[key]
	if !ok || col >= len(row) {
		return ""
	}
	return strings.TrimSpace(row[col])
}

func normalize(s string) string {
	return strings.ToLower(strings.TrimSpace(s))
}

func normalizeDomain(s string) string {
	s = strings.TrimSpace(strings.ToLower(s))
	s = strings.TrimPrefix(s, "https://")
	s = strings.TrimPrefix(s, "http://")
	s = strings.TrimPrefix(s, "www.")
	if i := strings.Index(s, "/"); i >= 0 {
		s = s[:i]
	}
	return s
}

func nullStr(s string) sql.NullString {
	if s == "" {
		return sql.NullString{}
	}
	return sql.NullString{String: s, Valid: true}
}

func nullHeadcount(s string) sql.NullInt64 {
	if s == "" {
		return sql.NullInt64{}
	}
	// Tolerate ranges like "11-50" by taking the upper bound.
	if i := strings.IndexAny(s, "-–"); i >= 0 {
		s = strings.TrimSpace(s[i+1:])
	}
	s = strings.ReplaceAll(s, ",", "")
	n, err := strconv.Atoi(s)
	if err != nil {
		return sql.NullInt64{}
	}
	return sql.NullInt64{Int64: int64(n), Valid: true}
}
