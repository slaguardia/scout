// JSON-LD JobPosting resolver: the keyless middle of the generic capture path.
// Most job pages embed a schema.org JobPosting as a <script
// type="application/ld+json"> blob (Google for Jobs requires it), so a posting
// on a company careers page or a server-rendered board resolves to exact
// structured fields — title, location, comp, description — with no LLM call,
// the same way an ATS API does. Run tries this between the ATS resolvers (which
// it never reaches, recognized links resolve earlier) and the Haiku fallback.
// Everything here is best-effort: a missing, malformed, or oddly-typed field
// just stays empty, and a page with no usable JobPosting falls through to Haiku.
package capture

import (
	"bytes"
	"encoding/json"
	"html"
	"regexp"
	"strconv"
	"strings"
)

// jobPostingLD is a schema.org JobPosting reduced to the fields a posting (and
// its company) need. CompanyURL is the hiring org's own site (sameAs/url), used
// to resolve a real identity domain — unlike an ATS host, a careers page knows it.
type jobPostingLD struct {
	Title          string
	Description    string
	Location       string
	EmploymentType string
	WorkplaceType  string
	CompRange      string
	PostedAt       string
	CompanyName    string
	CompanyURL     string
}

// reLDScript matches each <script type="application/ld+json"> block, capturing
// its JSON body. Tolerant of attribute order and quote style.
var reLDScript = regexp.MustCompile(`(?is)<script[^>]*\btype\s*=\s*["']application/ld\+json["'][^>]*>(.*?)</script>`)

// parseJobPostingLD scans a page's JSON-LD blocks for a schema.org JobPosting
// and maps the first usable one (one with at least a title). nil when none is
// present, so the caller falls through to the LLM extractor.
func parseJobPostingLD(body []byte) *jobPostingLD {
	for _, m := range reLDScript.FindAllSubmatch(body, -1) {
		var v any
		if json.Unmarshal(bytes.TrimSpace(m[1]), &v) != nil {
			continue
		}
		node := findJobPostingNode(v)
		if node == nil {
			continue
		}
		if jp := mapJobPostingLD(node); jp != nil {
			return jp
		}
	}
	return nil
}

// findJobPostingNode locates the JobPosting object in a decoded JSON-LD value:
// the top-level object, an element of a top-level array, or a member of an
// @graph. JobPosting is never nested deeper, so the walk stays shallow to avoid
// matching an unrelated embedded node.
func findJobPostingNode(v any) map[string]any {
	switch t := v.(type) {
	case map[string]any:
		if ldTypeIs(t["@type"], "JobPosting") {
			return t
		}
		if g, ok := t["@graph"]; ok {
			return findJobPostingNode(g)
		}
	case []any:
		for _, e := range t {
			if n := findJobPostingNode(e); n != nil {
				return n
			}
		}
	}
	return nil
}

// ldTypeIs reports whether a JSON-LD @type (a string or an array of strings)
// names the wanted type.
func ldTypeIs(x any, want string) bool {
	switch t := x.(type) {
	case string:
		return strings.EqualFold(t, want)
	case []any:
		for _, e := range t {
			if s, ok := e.(string); ok && strings.EqualFold(s, want) {
				return true
			}
		}
	}
	return false
}

func mapJobPostingLD(m map[string]any) *jobPostingLD {
	title := strings.TrimSpace(ldStr(m["title"]))
	if title == "" {
		return nil // a JobPosting with no title isn't worth a write
	}
	jp := &jobPostingLD{
		Title:          title,
		Description:    truncRunes(stripHTML(html.UnescapeString(ldStr(m["description"]))), descCapRunes),
		EmploymentType: ldEmploymentLabel(ldStr(m["employmentType"])),
		PostedAt:       isoDate(ldStr(m["datePosted"])),
		Location:       ldJobLocation(m["jobLocation"]),
		CompRange:      ldBaseSalary(m["baseSalary"]),
	}
	if ldStrOrName(m["jobLocationType"]) == "TELECOMMUTE" {
		jp.WorkplaceType = "Remote"
		if jp.Location == "" {
			jp.Location = ldStrOrName(ldObject(m["applicantLocationRequirements"]))
		}
	}
	if org := ldObject(m["hiringOrganization"]); org != nil {
		jp.CompanyName = strings.TrimSpace(ldStr(org["name"]))
		jp.CompanyURL = strings.TrimSpace(ldStr(org["sameAs"]))
		if jp.CompanyURL == "" {
			jp.CompanyURL = strings.TrimSpace(ldStr(org["url"]))
		}
	}
	return jp
}

// ldJobLocation flattens a Place (or the first of several) into a readable
// "Locality, Region, Country" line. address may itself be a string.
func ldJobLocation(x any) string {
	place := ldObject(x)
	if place == nil {
		return ""
	}
	addr := ldObject(place["address"])
	if addr == nil {
		return strings.TrimSpace(ldStr(place["address"]))
	}
	var parts []string
	for _, k := range []string{"addressLocality", "addressRegion", "addressCountry"} {
		if s := ldStrOrName(addr[k]); s != "" {
			parts = append(parts, s)
		}
	}
	return strings.Join(parts, ", ")
}

// ldBaseSalary renders a MonetaryAmount → "$130K – $170K / year". A flat value
// (no min/max range) prints as a single figure; unitText drives the interval.
func ldBaseSalary(x any) string {
	sal := ldObject(x)
	if sal == nil {
		return ""
	}
	currency := strings.TrimSpace(ldStrOrName(sal["currency"]))
	val := ldObject(sal["value"])
	if val == nil {
		if n := ldFloat(sal["value"]); n > 0 {
			return moneyRange(n, n, currency, "")
		}
		return ""
	}
	min, max := ldFloat(val["minValue"]), ldFloat(val["maxValue"])
	if min == 0 && max == 0 {
		v := ldFloat(val["value"])
		min, max = v, v
	}
	return moneyRange(min, max, currency, ldStr(val["unitText"]))
}

// ldEmploymentLabel maps schema.org's employmentType enum to the human label;
// unknown values pass through trimmed.
func ldEmploymentLabel(s string) string {
	switch strings.ToUpper(strings.TrimSpace(s)) {
	case "FULL_TIME", "FULLTIME":
		return "Full-time"
	case "PART_TIME", "PARTTIME":
		return "Part-time"
	case "CONTRACTOR", "CONTRACT":
		return "Contract"
	case "TEMPORARY":
		return "Temporary"
	case "INTERN", "INTERNSHIP":
		return "Internship"
	}
	return strings.TrimSpace(s)
}

// --- JSON-LD value coercion (schema.org fields are polymorphic) --------------

// ldStr reads a scalar string out of a JSON-LD value that may be a string, the
// first usable element of an array, or a number.
func ldStr(x any) string {
	switch t := x.(type) {
	case string:
		return t
	case float64:
		return strconv.FormatFloat(t, 'f', -1, 64)
	case []any:
		for _, e := range t {
			if s := ldStr(e); s != "" {
				return s
			}
		}
	}
	return ""
}

// ldStrOrName reads a value that's either a scalar or an object with a "name"
// (schema.org states country/currency both ways: "US" or {name:"US"}).
func ldStrOrName(x any) string {
	if s := strings.TrimSpace(ldStr(x)); s != "" {
		return s
	}
	if o := ldObject(x); o != nil {
		return strings.TrimSpace(ldStr(o["name"]))
	}
	return ""
}

// ldObject returns x as an object, or the first object in an array.
func ldObject(x any) map[string]any {
	switch t := x.(type) {
	case map[string]any:
		return t
	case []any:
		for _, e := range t {
			if m, ok := e.(map[string]any); ok {
				return m
			}
		}
	}
	return nil
}

// ldFloat reads a number out of a JSON-LD value (a JSON number, or a numeric
// string — schema.org states salary bounds both ways).
func ldFloat(x any) float64 {
	switch t := x.(type) {
	case float64:
		return t
	case string:
		f, _ := strconv.ParseFloat(strings.TrimSpace(t), 64)
		return f
	}
	return 0
}
