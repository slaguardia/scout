package web

import (
	"net/http"
	"sort"
	"strings"

	"github.com/slaguardia/scout/internal/filter"
)

// handleFilterOptions returns the vocabularies the pre-filter form's
// multi-selects bind to: the distinct vertical tags actually present in the
// company data (with counts, most common first) and the canonical funding
// stages (with counts). Read-only, derived live from the companies table — the
// vertical field is a comma-separated tag set, so we split and count whole tags,
// mirroring how filter.evaluate matches them.
func (s *Server) handleFilterOptions(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	rows, err := s.DB.Query(`SELECT COALESCE(vertical,''), COALESCE(funding_stage,'') FROM companies`)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	vertCount := map[string]int{}      // lowercased tag -> count
	vertDisplay := map[string]string{} // lowercased tag -> first-seen display casing
	stageCount := map[string]int{}     // canonical stage -> count
	for rows.Next() {
		var v, st string
		if err := rows.Scan(&v, &st); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		seen := map[string]bool{} // dedup tags within a single company
		for _, p := range strings.Split(v, ",") {
			p = strings.TrimSpace(p)
			if p == "" {
				continue
			}
			lk := strings.ToLower(p)
			if seen[lk] {
				continue
			}
			seen[lk] = true
			vertCount[lk]++
			if vertDisplay[lk] == "" {
				vertDisplay[lk] = p
			}
		}
		if cs := filter.NormalizeStage(st); cs != "" {
			stageCount[cs]++
		}
	}
	if err := rows.Err(); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	type opt struct {
		Value string `json:"value"`
		Count int    `json:"count"`
	}
	verts := make([]opt, 0, len(vertCount))
	for lk, c := range vertCount {
		verts = append(verts, opt{vertDisplay[lk], c})
	}
	sort.Slice(verts, func(i, j int) bool {
		if verts[i].Count != verts[j].Count {
			return verts[i].Count > verts[j].Count
		}
		return verts[i].Value < verts[j].Value
	})

	// Canonical stages first (count 0 if absent, so the user can still pick a
	// stage no company has yet), then any non-canonical stage present in the data.
	canonical := map[string]bool{}
	stages := make([]opt, 0, len(filter.CanonicalStages))
	for _, cs := range filter.CanonicalStages {
		canonical[cs] = true
		stages = append(stages, opt{cs, stageCount[cs]})
	}
	var extra []opt
	for cs, c := range stageCount {
		if !canonical[cs] {
			extra = append(extra, opt{cs, c})
		}
	}
	sort.Slice(extra, func(i, j int) bool { return extra[i].Count > extra[j].Count })
	stages = append(stages, extra...)

	writeJSON(w, http.StatusOK, map[string]any{"verticals": verts, "stages": stages})
}
