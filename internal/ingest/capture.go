package ingest

import (
	"encoding/json"
	"errors"
	"strings"

	"github.com/slaguardia/scout/internal/store"
)

// IdentityDomain normalizes a raw website/host string and returns "" when the
// result can't serve as a company's identity (not a structurally valid
// hostname, or a shared aggregator host like linkedin.com). Exported for the
// link-capture flow, which resolves a company domain from LLM-extracted text
// and page URLs and must apply the same identity rules as ingest.
func IdentityDomain(raw string) string {
	return identityDomain(raw)
}

// CapturedCompany is a company identified by the link-capture agent pass.
// Domain may be empty (an ATS-hosted posting that never names the company's
// own site) — the row is then keyed by name, exactly like a domain-less CSV
// row, and folds into a domain-bearing twin if one ever arrives.
type CapturedCompany struct {
	Name      string
	Domain    string // already a bare host or ""; re-checked via identityDomain
	Location  string
	Vertical  string
	SourceURL string // the captured page, kept in raw_json as provenance
}

// EnsureCompany resolves a captured company to a stored row, creating one only
// when the company isn't already in the list. Unlike AddManual it treats an
// existing row as success (capture pointing at a known company is the happy
// path, not a conflict) and tolerates a missing domain. Existing rows are
// never overwritten — a capture's sparse fields must not clobber a rich CSV
// row. New rows go through the shared merge path so name/domain twins fold
// exactly as CSV rows do. Returns the row id and whether a new company row was
// created. The validation error is prefixed "company " for the web layer.
func EnsureCompany(db *store.DB, c CapturedCompany) (string, bool, error) {
	domain := identityDomain(c.Domain)
	name := strings.TrimSpace(c.Name)
	if name == "" {
		name = domain
	}
	if name == "" {
		return "", false, errors.New("company name or domain required")
	}

	// Identity check first: an existing row under this identity wins untouched.
	id := store.CompanyID(domain, name)
	exists, err := db.CompanyExists(id)
	if err != nil {
		return "", false, err
	}
	if exists {
		return id, false, nil
	}

	// raw_json mirrors the captured fields (like a CSV row preserves its cells)
	// plus the page the capture came from.
	raw := map[string]string{"name": name}
	for k, v := range map[string]string{
		"website": domain, "location": c.Location,
		"vertical": c.Vertical, "captured_from": c.SourceURL,
	} {
		if s := strings.TrimSpace(v); s != "" {
			raw[k] = s
		}
	}
	rawJSON, _ := json.Marshal(raw)

	company := store.Company{
		Source:   "capture",
		Name:     name,
		Domain:   nullStr(domain),
		Location: nullStr(strings.TrimSpace(c.Location)),
		Vertical: nullStr(strings.TrimSpace(c.Vertical)),
		RawJSON:  string(rawJSON),
	}
	// The shared merge path handles both twin directions: a domain arrival folds
	// a name-keyed twin in; a domain-less arrival is recognized as a duplicate of
	// an existing domain-keyed row (and backfills its blanks) instead of creating
	// a second row. merged=true means the company already existed in some form.
	out, err := upsertWithMerge(db, company)
	if err != nil {
		return "", false, err
	}
	return out.id, !out.merged, nil
}
