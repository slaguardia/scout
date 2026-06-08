// Package ingest reads source dumps (Crunchbase CSV first) into the store.
package ingest

import (
	"database/sql"
	"encoding/csv"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
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
	Read       int
	Upserted   int // total rows accepted (new inserts + dedup merges)
	Merged     int // of Upserted, how many landed on an already-known company
	Collisions int // of Merged, overwrites where a DIFFERENT name shared the domain key
	Skipped    int
	Errors     []string
	// CollisionDetails carries one entry per collision (len == Collisions): which
	// stored name an incoming row overwrote, and the domain they shared. Surfaced
	// so a run can show WHAT collided, not just that something did.
	CollisionDetails []Collision
}

// Collision records a single cross-identity overwrite: an incoming row keyed by
// Domain landed on an existing row stored under a different name.
type Collision struct {
	Domain        string `json:"domain"`         // the shared domain key
	IncomingName  string `json:"incoming_name"`  // the name now stored on the row
	OverwroteName string `json:"overwrote_name"` // the name that was there before
}

// Run reads path and upserts every data row. The first row must be a header.
func (c *CSV) Run(path string) (*Result, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("open csv: %w", err)
	}
	defer f.Close()

	r := csv.NewReader(f)
	r.FieldsPerRecord = -1 // tolerate ragged rows (short/long rows are handled below)
	// LazyQuotes stays OFF: a stray/unterminated quote then surfaces as a parse
	// error (appended to res.Errors) and the reader recovers to the next record,
	// instead of silently swallowing the rest of the file into one giant field.
	// Correctly-quoted multi-line cells (a real "Description") still parse fine.
	r.LazyQuotes = false

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
	// Without a name column every row maps to an empty name and is silently
	// skipped \u2014 a whole file vanishing while the run still "succeeds". Fail loud
	// so a misnamed export (or a wrong file) is caught, not quietly dropped.
	if _, ok := idx["name"]; !ok {
		return nil, fmt.Errorf("no recognizable company-name column in header: %v", header)
	}

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

		// A repeated header line (concatenated exports, stray re-header) is
		// metadata, not a company.
		if rowEqualsHeader(header, row) {
			res.Skipped++
			continue
		}

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
			Domain:       nullStr(identityDomain(pick(idx, row, "domain"))),
			Headcount:    nullHeadcount(pick(idx, row, "headcount")),
			FundingStage: nullStr(pick(idx, row, "funding_stage")),
			Location:     nullStr(pick(idx, row, "location")),
			Vertical:     nullStr(pick(idx, row, "vertical")),
			RawJSON:      string(rawJSON),
		}
		out, err := upsertWithMerge(c.DB, company)
		if err != nil {
			res.Errors = append(res.Errors, err.Error())
			continue
		}
		res.Upserted++
		// "Merged" = the row landed on a company already in the set (a re-ingest,
		// a folded name/domain twin, or a recognized domain-less duplicate).
		// "Collisions" flags the suspicious subset: an overwrite where the stored
		// row carried a different name under the same domain key.
		if out.merged {
			res.Merged++
		}
		if out.collision {
			res.Collisions++
			res.CollisionDetails = append(res.CollisionDetails, Collision{
				Domain:        company.Domain.String,
				IncomingName:  name,
				OverwroteName: out.prevName,
			})
		}
	}
	return res, nil
}

// upsertOutcome reports what a single row's upsert did.
type upsertOutcome struct {
	id        string
	merged    bool   // landed on a company already in the set (re-ingest or folded twin)
	collision bool   // overwrote a domain-keyed row stored under a DIFFERENT name
	prevName  string // on a collision, the name the row carried before the overwrite
}

// upsertWithMerge writes c under its deterministic identity key and keeps the
// two ways the SAME company can be keyed — by domain, or by name when domain-less
// — collapsed onto one row, in BOTH arrival orders:
//
//   - domain-less first, domain later: the new domain row folds in the old
//     name-keyed twin (MergeCompany re-points its children, deletes the twin).
//   - domain first, domain-less later: the domain-less arrival is recognized as
//     a duplicate of the existing domain-keyed company and dropped (no second
//     row), the reverse of the fold.
//
// Both directions lean on "same (lower, trimmed) name ⇒ same company"; the
// reverse direction only acts on an unambiguous single domain-keyed match.
// When a domain row overwrites an existing domain-keyed row whose name differs,
// that's two identities sharing one domain key — flagged as a collision (rare
// once aggregator hosts are routed to name-keying; see identityDomain).
func upsertWithMerge(db *store.DB, c store.Company) (upsertOutcome, error) {
	domainKey := store.CompanyID(c.Domain.String, c.Name)

	// Arrival WITHOUT a usable domain → keyed by name (domainKey IS the name key).
	if !c.Domain.Valid {
		ids, err := db.DomainKeyedIDsByName(c.Name)
		if err != nil {
			return upsertOutcome{}, err
		}
		if len(ids) >= 1 {
			// The company is already represented by one or more domain-keyed rows of
			// the same name. Don't add a redundant domain-less row — that's what kept
			// re-ingest idempotent (a later pass sees the domain rows and must reach
			// the same result). Backfill the lone unambiguous match; with several
			// same-name domains we can't attribute it, so just absorb it.
			if len(ids) == 1 {
				if err := db.BackfillCompanyBlanks(ids[0], c); err != nil {
					return upsertOutcome{}, err
				}
			}
			return upsertOutcome{id: ids[0], merged: true}, nil
		}
		exists, err := db.CompanyExists(domainKey)
		if err != nil {
			return upsertOutcome{}, err
		}
		if err := db.UpsertCompanyWithID(domainKey, c); err != nil {
			return upsertOutcome{}, err
		}
		return upsertOutcome{id: domainKey, merged: exists}, nil
	}

	// Arrival WITH a domain → keyed by domain. CompanyNameByID returns both the
	// existence signal and the stored name (for collision detection); the upsert
	// may rename the row, so a name-keyed twin matching the INCOMING name is
	// folded whether the domain row is new OR overwritten — otherwise an overwrite
	// that renames the row strands the twin as a permanent duplicate.
	existingName, domainExists, err := db.CompanyNameByID(domainKey)
	if err != nil {
		return upsertOutcome{}, err
	}
	nameKey := store.CompanyID("", c.Name) // != domainKey: a domain is present
	nameExists, err := db.CompanyExists(nameKey)
	if err != nil {
		return upsertOutcome{}, err
	}
	// A name-keyed twin can only exist when NO domain row shared its name at the
	// time it was created (the reverse fold absorbs a domain-less arrival the
	// moment any same-name domain row exists), and the first domain arrival folds
	// it — so when we get here it's never ambiguous. Fold it in.
	if nameExists {
		// upsert + fold in ONE transaction so a crash / cross-process SQLITE_BUSY
		// can't leave the row committed with the twin un-folded.
		if err := db.UpsertAndFoldName(domainKey, c, nameKey); err != nil {
			return upsertOutcome{}, err
		}
	} else if err := db.UpsertCompanyWithID(domainKey, c); err != nil {
		return upsertOutcome{}, err
	}
	collision := domainExists && !sameName(existingName, c.Name)
	prevName := ""
	if collision {
		prevName = existingName
	}
	return upsertOutcome{
		id:        domainKey,
		merged:    domainExists || nameExists,
		collision: collision,
		prevName:  prevName,
	}, nil
}

// sameName compares two company names the way CompanyID keys them: trimmed and
// case-folded. Used to tell a benign re-ingest (same name, same domain) from a
// genuine cross-identity collision (different name, same domain key).
func sameName(a, b string) bool {
	return strings.TrimSpace(strings.ToLower(a)) == strings.TrimSpace(strings.ToLower(b))
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
	if domain == "" {
		return "", errors.New("website is required (e.g. acme.com)")
	}
	if !looksLikeDomain(domain) {
		return "", errors.New("website is not a valid domain (e.g. acme.com)")
	}
	if isAggregatorHost(domain) {
		// A social/profile/link-hub URL can't identify the company — every such
		// add would key on the shared host. Make the user supply the real domain.
		return "", errors.New("website looks like a social or profile link — enter the company's own domain (e.g. acme.com)")
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
	// Go through the shared merge path (not a bare upsert) so a manual add folds
	// in a pre-existing name-keyed twin — e.g. the same company previously
	// ingested from a CSV with no website — exactly as the CSV path would. The
	// existing-domain case was already rejected above with ErrCompanyExists.
	out, err := upsertWithMerge(db, company)
	if err != nil {
		return "", err
	}
	return out.id, nil
}

// SetCompanyDomain attaches or changes the website/domain on an existing
// company from the web pane. It applies the SAME normalization and rejection
// rules as a manual add (bare-domain normalization, validity + aggregator-host
// checks), then re-keys the row onto its domain identity via
// store.SetCompanyDomain. Returns the resulting company id (it changes when the
// row is re-keyed).
func SetCompanyDomain(db *store.DB, id, website string) (string, error) {
	domain := normalizeDomain(website)
	if domain == "" {
		return "", errors.New("website is required (e.g. acme.com)")
	}
	if !looksLikeDomain(domain) {
		return "", errors.New("website is not a valid domain (e.g. acme.com)")
	}
	if isAggregatorHost(domain) {
		return "", errors.New("website looks like a social or profile link — enter the company's own domain (e.g. acme.com)")
	}
	return db.SetCompanyDomain(id, domain)
}

// indexHeader returns canonical-field -> column index, picking the first alias
// that matches. When a header name is duplicated, the FIRST occurrence wins —
// the primary column (e.g. the real "Website") normally precedes a secondary
// tracking/redirect duplicate, so first-wins keeps identity on the real value.
func indexHeader(header []string) map[string]int {
	norm := make(map[string]int, len(header))
	for i, h := range header {
		if _, seen := norm[normalize(h)]; !seen { // first occurrence wins
			norm[normalize(h)] = i
		}
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

// rowAsMap preserves the original cells for raw_json. Duplicate header names get
// a collision-proof " (n)" suffix (it keeps bumping n past any literal "X (n)"
// header), and cells beyond the header width (ragged over-wide rows) are kept
// under "__extra_<i>" — so no original cell is ever silently dropped.
func rowAsMap(header, row []string) map[string]string {
	out := make(map[string]string, len(row))
	for i, cell := range row {
		base := fmt.Sprintf("__extra_%d", i) // cell beyond the header width
		if i < len(header) {
			base = header[i]
		}
		key := base
		for n := 2; ; n++ { // disambiguate duplicates until the key is unused
			if _, used := out[key]; !used {
				break
			}
			key = fmt.Sprintf("%s (%d)", base, n)
		}
		out[key] = cell
	}
	return out
}

// rowEqualsHeader reports whether row is a repeat of the header line (same
// length, every cell equal after trim+casefold) — metadata, not a company. Only
// considered for multi-column files: in a single-column export a company could
// legitimately be named exactly like the header, and dropping it would lose a
// real row, whereas matching ALL cells of a ≥2-column header is not a real value.
func rowEqualsHeader(header, row []string) bool {
	if len(header) < 2 || len(row) != len(header) {
		return false
	}
	for i := range row {
		if normalize(row[i]) != normalize(header[i]) {
			return false
		}
	}
	return true
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

// normalizeDomain reduces a raw "website" cell to a bare, comparable host:
// lowercased, scheme/userinfo/port stripped, path/query/fragment removed, "www."
// dropped, and leading/trailing dots trimmed. Userinfo and port are removed
// BEFORE "www." so "http://user@www.acme.com" still bares down to "acme.com".
// Spellings of the same site ("https://www.acme.com/careers", "acme.com.",
// ".acme.com", "acme.com?utm=x", "acme.com:443") all collapse to "acme.com".
func normalizeDomain(s string) string {
	s = strings.TrimSpace(strings.ToLower(s))
	if i := strings.Index(s, "://"); i >= 0 { // any scheme, not just http(s)
		s = s[i+3:]
	}
	s = strings.TrimPrefix(s, "//")              // protocol-relative URL
	if i := strings.IndexAny(s, "/?#"); i >= 0 { // path, query, fragment
		s = s[:i]
	}
	if i := strings.LastIndex(s, "@"); i >= 0 { // user:pass@host
		s = s[i+1:]
	}
	if i := strings.Index(s, ":"); i >= 0 { // :port
		s = s[:i]
	}
	s = strings.TrimPrefix(s, "www.") // now operating on the bare authority
	return strings.Trim(s, ".")       // leading/trailing FQDN dots
}

// looksLikeDomain reports whether host is structurally a registrable hostname:
// at least two dot-separated labels, each a valid LDH label (letters/digits/
// hyphen, not hyphen-bounded — punycode "xn--…" passes). Rejects bare TLDs
// ("com"), dotless junk ("acme", "localhost"), malformed dot runs ("..",
// "a..b.com"), and annotated cells ("acme.com (verified)") so a non-host Website
// cell can't become a bespoke identity key (it falls through to name-keying).
func looksLikeDomain(host string) bool {
	labels := strings.Split(host, ".")
	if len(labels) < 2 {
		return false
	}
	for _, l := range labels {
		if !validLabel(l) {
			return false
		}
	}
	// Reject an all-numeric final label: a real TLD is never numeric, so this is
	// an IPv4 literal (or similar junk) — not a company identity. Two companies on
	// a shared hosting IP must not collapse onto it.
	if isAllDigits(labels[len(labels)-1]) {
		return false
	}
	return true
}

// isAllDigits reports whether s is non-empty and entirely ASCII digits.
func isAllDigits(s string) bool {
	if s == "" {
		return false
	}
	for _, r := range s {
		if r < '0' || r > '9' {
			return false
		}
	}
	return true
}

// validLabel reports whether l is a valid DNS label: non-empty, only [a-z0-9-]
// (host is already lowercased by normalizeDomain), and not starting/ending with
// a hyphen.
func validLabel(l string) bool {
	if l == "" || l[0] == '-' || l[len(l)-1] == '-' {
		return false
	}
	for _, r := range l {
		if !(r >= 'a' && r <= 'z' || r >= '0' && r <= '9' || r == '-') {
			return false
		}
	}
	return true
}

// aggregatorHosts are shared platforms whose URLs routinely show up in a
// "website" column in place of a company's own site: social profiles, link
// hubs, code/data platforms, and site builders. Their bare host is NOT a
// company identity — left as-is, every company pointing at one collapses onto a
// single domain-keyed row (normalizeDomain drops the path) and silently
// overwrites the others. Routing these to name-keying keeps the rows distinct.
var aggregatorHosts = map[string]bool{
	"linkedin.com": true, "facebook.com": true, "fb.com": true,
	"twitter.com": true, "x.com": true, "instagram.com": true,
	"youtube.com": true, "tiktok.com": true, "crunchbase.com": true,
	"angel.co": true, "wellfound.com": true, "pitchbook.com": true,
	"bloomberg.com": true, "glassdoor.com": true, "indeed.com": true,
	"medium.com": true, "substack.com": true, "linktr.ee": true,
	"github.com": true, "gitlab.com": true, "github.io": true,
	"google.com": true, "sites.google.com": true, "notion.site": true,
	"notion.so": true, "wordpress.com": true, "blogspot.com": true,
	"wixsite.com": true, "weebly.com": true, "myshopify.com": true,
	"carrd.co": true, "bit.ly": true, "t.co": true, "goo.gl": true,
	"tinyurl.com": true,
	// Share / short-link hosts of the platforms above (different host, same
	// "not a company site" meaning).
	"youtu.be": true, "lnkd.in": true, "fb.me": true, "t.me": true,
}

// isAggregatorHost reports whether host is (or sits under) a shared platform
// that can't serve as a company identity. The suffix check catches per-company
// subdomains like "acme.myshopify.com" or "acme.github.io".
func isAggregatorHost(host string) bool {
	if host == "" {
		return false
	}
	if aggregatorHosts[host] {
		return true
	}
	for base := range aggregatorHosts {
		if strings.HasSuffix(host, "."+base) {
			return true
		}
	}
	return false
}

// identityDomain normalizes a raw website cell and returns "" when the result
// can't serve as a company's identity — not a structurally valid hostname (bare
// TLD, dotless or malformed) or a shared aggregator host. Ingest treats "" as
// "no domain" and keys by name, so non-identifying URLs never collapse distinct
// companies onto one row.
func identityDomain(raw string) string {
	d := normalizeDomain(raw)
	if !looksLikeDomain(d) || isAggregatorHost(d) {
		return ""
	}
	return d
}

func nullStr(s string) sql.NullString {
	if s == "" {
		return sql.NullString{}
	}
	return sql.NullString{String: s, Valid: true}
}

// ParseHeadcount parses a free-form employee-count string ("250", "11-50",
// "1,200+") exactly like a CSV cell (see nullHeadcount). Exported for the web
// layer's company-edit form so a typed range round-trips the same as ingest.
func ParseHeadcount(s string) sql.NullInt64 { return nullHeadcount(s) }

// nullHeadcount parses a free-form employee-count cell into an integer, taking
// the upper bound of a range. It tolerates the shapes Crunchbase emits ("11-50",
// "1,001-5,000") and open-ended top buckets ("10001+", "10,000+", "5000+"), plus
// dashless ranges ("11 to 50" → 50) and magnitude suffixes ("1.5k" → 1500, where
// the suffix immediately follows the number). It scans every numeric token —
// digits with optional thousands commas and one decimal point, an optional
// trailing k/m/b magnitude — and returns the LARGEST (the range upper bound), so
// "1k-5k" → 5000 and "50-10" → 50. Returns NULL when no number is present
// ("Unknown") or the value overflows int64.
func nullHeadcount(s string) sql.NullInt64 {
	s = strings.TrimSpace(s)
	if s == "" {
		return sql.NullInt64{}
	}
	maxVal, found := float64(-1), false
	b := []byte(s)
	for i := 0; i < len(b); {
		if !(b[i] >= '0' && b[i] <= '9') {
			i++
			continue
		}
		// Read one number: digits, thousands commas, at most one decimal point.
		dot := false
		var num []byte
		for i < len(b) {
			switch {
			case b[i] >= '0' && b[i] <= '9':
				num = append(num, b[i])
			case b[i] == ',': // thousands separator — drop, keep reading
			case b[i] == '.' && !dot && i+1 < len(b) && b[i+1] >= '0' && b[i+1] <= '9':
				dot = true
				num = append(num, '.')
			default:
				goto done
			}
			i++
		}
	done:
		mult := 1.0
		if i < len(b) { // optional immediately-adjacent magnitude suffix
			switch b[i] | 0x20 { // ASCII lower
			case 'k':
				mult, i = 1e3, i+1
			case 'm':
				mult, i = 1e6, i+1
			case 'b':
				mult, i = 1e9, i+1
			}
		}
		if f, err := strconv.ParseFloat(string(num), 64); err == nil {
			if v := f * mult; v > maxVal {
				maxVal = v
			}
			found = true
		}
	}
	// Use >= float64(MaxInt64): MaxInt64 isn't exactly representable as a float64
	// (it rounds up to 2^63), so a `>` guard would let a value that rounds to 2^63
	// slip through and then wrap when cast to int64.
	if !found || maxVal < 0 || maxVal >= float64(math.MaxInt64) {
		return sql.NullInt64{}
	}
	return sql.NullInt64{Int64: int64(maxVal), Valid: true}
}
