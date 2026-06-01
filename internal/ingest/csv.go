// Package ingest reads source dumps (Crunchbase CSV first) into the store.
package ingest

import (
	"database/sql"
	"encoding/csv"
	"encoding/json"
	"errors"
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
	"source_id":     {"uuid", "id", "cb_id", "crunchbase uuid", "organization name url"},
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
	Upserted int // total rows written (new inserts + dedup merges)
	Merged   int // of Upserted, how many overwrote an existing company
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
	// Crunchbase exports are UTF-8 with a leading BOM. Strip it from the first
	// header cell so "Organization Name" (→ the company name) still matches its
	// alias — otherwise every row maps to an empty name and is skipped.
	if len(header) > 0 {
		header[0] = strings.TrimPrefix(header[0], "\ufeff")
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
		_, overwrote, err := upsertWithMerge(c.DB, company)
		if err != nil {
			res.Errors = append(res.Errors, err.Error())
			continue
		}
		res.Upserted++
		// An existing domain-keyed row, or a folded-in name-keyed twin, both
		// count as merges (overwrote or absorbed an existing company).
		if overwrote {
			res.Merged++
		}
	}
	return res, nil
}

// upsertWithMerge writes c under its deterministic identity key and auto-merges
// a domain-less arrival into its later domain-bearing twin. A company first
// seen without a domain is keyed by name ("name:<lower>"); the same company
// arriving WITH a domain keys on the domain instead, so the two would otherwise
// live as separate rows — when a brand-new domain-keyed row has a name-keyed
// twin already stored, MergeCompany folds the old row in. The id is computed
// once and its existence check reused for both the merge decision and the
// new-vs-overwritten signal. Returns the row id and whether it overwrote or
// absorbed an existing company (vs. a fresh insert).
func upsertWithMerge(db *store.DB, c store.Company) (string, bool, error) {
	domainKey := store.CompanyID(c.Domain.String, c.Name)
	domainExists, err := db.CompanyExists(domainKey)
	if err != nil {
		return "", false, err
	}
	merge, nameKey := false, ""
	if c.Domain.Valid && !domainExists {
		nameKey = store.CompanyID("", c.Name)
		if nameKey != domainKey {
			nameExists, err := db.CompanyExists(nameKey)
			if err != nil {
				return "", false, err
			}
			merge = nameExists
		}
	}
	if err := db.UpsertCompanyWithID(domainKey, c); err != nil {
		return "", false, err
	}
	if merge {
		if err := db.MergeCompany(nameKey, domainKey); err != nil {
			return "", false, err
		}
	}
	return domainKey, domainExists || merge, nil
}

// ManualCompany is a single hand-entered company from the web "Add company"
// modal. Website is the only required field; the rest are optional and mirror
// the columns the CSV path fills (headcount is a free-form string so it accepts
// ranges like "11-50", parsed the same way as a CSV cell).
type ManualCompany struct {
	Website      string
	Name         string
	Headcount    string
	FundingStage string
	Location     string
	Vertical     string
}

// ErrCompanyExists is returned by AddManual when a company with the same
// website (domain) is already in the store. Manual adds refuse to touch an
// existing row — re-running a CSV ingest is the path that updates in place.
var ErrCompanyExists = errors.New("company already in the list")

// AddManual inserts one hand-entered company (source "manual"). It normalizes
// the website to a bare domain (the row's identity) and defaults a blank name
// to that domain. If a company with that domain is already present it does NOT
// overwrite it — it returns the existing row's id with ErrCompanyExists so the
// caller can report the duplicate. The other validation error is a missing or
// unusable website, prefixed "website " so the web layer can map it to a 400.
func AddManual(db *store.DB, m ManualCompany) (string, error) {
	domain := normalizeDomain(m.Website)
	if domain == "" || !strings.Contains(domain, ".") {
		return "", errors.New("website is required (e.g. acme.com)")
	}
	name := strings.TrimSpace(m.Name)
	if name == "" {
		name = domain
	}
	// Identity is the domain (CompanyID ignores the name once a domain is
	// present), so this is exactly "is this website already in the list?".
	id := store.CompanyID(domain, name)
	exists, err := db.CompanyExists(id)
	if err != nil {
		return "", err
	}
	if exists {
		return id, ErrCompanyExists
	}
	// raw_json mirrors the entered fields so the detail pane's raw view shows
	// what was typed, the same way a CSV row preserves its original cells.
	raw := map[string]string{"name": name, "website": domain}
	for k, v := range map[string]string{
		"headcount": m.Headcount, "funding_stage": m.FundingStage,
		"location": m.Location, "vertical": m.Vertical,
	} {
		if s := strings.TrimSpace(v); s != "" {
			raw[k] = s
		}
	}
	rawJSON, _ := json.Marshal(raw)

	company := store.Company{
		Source:       "manual",
		Name:         name,
		Domain:       nullStr(domain),
		Headcount:    nullHeadcount(m.Headcount),
		FundingStage: nullStr(strings.TrimSpace(m.FundingStage)),
		Location:     nullStr(strings.TrimSpace(m.Location)),
		Vertical:     nullStr(strings.TrimSpace(m.Vertical)),
		RawJSON:      string(rawJSON),
	}
	return id, db.UpsertCompanyWithID(id, company)
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
