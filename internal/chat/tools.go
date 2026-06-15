package chat

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/slaguardia/scout/internal/anthropic"
	"github.com/slaguardia/scout/internal/capture"
	"github.com/slaguardia/scout/internal/store"
)

// toolImpl executes one custom tool: it parses the model-supplied input and
// returns a result string (becomes the tool_result content). A returned error
// is surfaced to the model as an is_error tool_result, so the model can adapt.
type toolImpl func(ctx context.Context, input json.RawMessage) (string, error)

// registerTools builds the eight-tool registry: seven custom tools wired to the
// store + capture pass, plus the hosted web_search server tool (no client
// execution — the API runs it). Tool descriptions are prescriptive about WHEN
// to call, which Sonnet 4.6 rewards (it reaches for tools conservatively).
func (e *Engine) registerTools() {
	defs := []struct {
		def  anthropic.ToolDef
		impl toolImpl
	}{
		{
			anthropic.ToolDef{
				Name:        "capture_link",
				Description: "Add a job posting or company to scout from a pasted URL. Call this FIRST whenever the user says they applied to, found, or is looking at a job/company with a link — it resolves the company and posting (idempotent by URL) and returns their ids. After capturing an application, follow up with track_application to set the applied date.",
				InputSchema: objSchema(map[string]any{
					"url": strProp("The job posting or company URL the user pasted."),
				}, "url"),
			},
			e.toolCaptureLink,
		},
		{
			anthropic.ToolDef{
				Name:        "track_application",
				Description: "Update a posting's application-tracking fields. Call this when the user reports applying, advancing a stage (heard back / screening / interview / offer / rejected), doing outreach, or adding a contact. Passing `stage` records a dated entry in the posting's application-stage history (the current stage is the latest entry). Only the fields you pass are changed; omit the rest. Get the posting_id from capture_link or search.",
				InputSchema: objSchema(map[string]any{
					"posting_id":       strProp("The posting id (from capture_link or search)."),
					"stage":            strProp("The application stage just reached (e.g. applied, screening, interview, offer, rejected — whatever stage the user names). Appends a dated entry to the stage history; the current stage becomes this."),
					"stage_date":       strProp("Date the stage was reached, YYYY-MM-DD. Defaults to today when omitted."),
					"outreach_count":   intProp("Total outreach messages sent for this role."),
					"last_outreach_at": strProp("Date of the most recent outreach, YYYY-MM-DD."),
					"contacts":         strProp("Free-form contacts, comma-separated (names/emails)."),
					"notes":            strProp("Free-form note on this posting."),
				}, "posting_id"),
			},
			e.toolTrackApplication,
		},
		{
			anthropic.ToolDef{
				Name:        "search",
				Description: "Search scout's saved companies and job postings by name/title. Call this to check whether something is already tracked (\"did I already add Ramp?\") or to find an entity's id before reading or updating it. Returns matching companies and postings with their ids and verdicts.",
				InputSchema: objSchema(map[string]any{
					"query": strProp("Case-insensitive substring to match against company names and posting titles."),
				}, "query"),
			},
			e.toolSearch,
		},
		{
			anthropic.ToolDef{
				Name:        "get_company",
				Description: "Fetch a company's full detail: facts, verdict + reasoning, enriched website summary, notes, and its postings. Call this to answer questions about a specific saved company.",
				InputSchema: objSchema(map[string]any{
					"company_id": strProp("The company id (from search or capture_link)."),
				}, "company_id"),
			},
			e.toolGetCompany,
		},
		{
			anthropic.ToolDef{
				Name:        "get_posting",
				Description: "Fetch one job posting's detail: title, location, comp, full description, and its tracking state. Call this to answer questions about a specific role.",
				InputSchema: objSchema(map[string]any{
					"posting_id": strProp("The posting id (from search or capture_link)."),
				}, "posting_id"),
			},
			e.toolGetPosting,
		},
		{
			anthropic.ToolDef{
				Name:        "set_notes",
				Description: "Replace a company's free-form notes (a human scratchpad). Call this when the user asks you to jot something down about a company. This overwrites existing notes — read them with get_company first if you mean to append.",
				InputSchema: objSchema(map[string]any{
					"company_id": strProp("The company id."),
					"notes":      strProp("The note text to store (replaces existing notes)."),
				}, "company_id", "notes"),
			},
			e.toolSetNotes,
		},
		{
			anthropic.ToolDef{
				Name:        "set_verdict",
				Description: "Hand-set a company's fit verdict (yes/maybe/no) with a reason. Call this only when the user explicitly asks you to mark or override a verdict. It is recorded as a sticky manual override.",
				InputSchema: objSchema(map[string]any{
					"company_id": strProp("The company id."),
					"verdict":    enumProp("The fit verdict.", "yes", "maybe", "no"),
					"reason":     strProp("Short reason for the verdict."),
				}, "company_id", "verdict"),
			},
			e.toolSetVerdict,
		},
	}

	e.tools = make(map[string]toolImpl, len(defs))
	e.toolWire = make([]any, 0, len(defs)+1)
	for _, d := range defs {
		e.tools[d.def.Name] = d.impl
		e.toolWire = append(e.toolWire, d.def)
	}
	// The hosted web_search server tool — the API executes it; no client impl.
	e.toolWire = append(e.toolWire, anthropic.NewWebSearchTool(5))
}

// --- tool implementations -------------------------------------------------

func (e *Engine) toolCaptureLink(ctx context.Context, input json.RawMessage) (string, error) {
	var in struct {
		URL string `json:"url"`
	}
	if err := json.Unmarshal(input, &in); err != nil {
		return "", fmt.Errorf("bad input: %w", err)
	}
	if strings.TrimSpace(in.URL) == "" {
		return "", errors.New("url is required")
	}
	res, err := e.Capturer.Run(ctx, capture.Request{URL: in.URL})
	if err != nil {
		var fe capture.FetchError
		if errors.As(err, &fe) {
			return "", fmt.Errorf("could not fetch the page (status %s) — nothing was added", fe.Status)
		}
		return "", err
	}
	out := map[string]any{
		"kind":            res.Kind,
		"fetch_status":    res.FetchStatus,
		"company_id":      res.CompanyID,
		"company_name":    res.CompanyName,
		"company_created": res.CompanyCreated,
		"note":            res.Note,
	}
	if res.Posting != nil {
		out["posting_id"] = res.Posting.ID
		out["posting_title"] = res.Posting.Title
		out["posting_updated"] = res.PostingUpdated
	}
	return jsonString(out), nil
}

func (e *Engine) toolTrackApplication(ctx context.Context, input json.RawMessage) (string, error) {
	var in struct {
		PostingID      string  `json:"posting_id"`
		Stage          *string `json:"stage"`
		StageDate      *string `json:"stage_date"`
		OutreachCount  *int    `json:"outreach_count"`
		LastOutreachAt *string `json:"last_outreach_at"`
		Contacts       *string `json:"contacts"`
		Notes          *string `json:"notes"`
	}
	if err := json.Unmarshal(input, &in); err != nil {
		return "", fmt.Errorf("bad input: %w", err)
	}
	if strings.TrimSpace(in.PostingID) == "" {
		return "", errors.New("posting_id is required")
	}
	// Read current state so omitted fields are preserved (the store update is
	// full-state; we overlay only what the model passed).
	cur, err := e.DB.GetPosting(in.PostingID)
	if err != nil {
		return "", err
	}
	if cur == nil {
		return "", fmt.Errorf("no posting with id %q (use search to find it)", in.PostingID)
	}
	t := store.PostingTracking{
		StageHistory:   cur.StageHistory,
		OutreachCount:  cur.OutreachCount,
		LastOutreachAt: cur.LastOutreachAt,
		OutreachStatus: cur.OutreachStatus,
		Contacts:       cur.Contacts,
		Notes:          cur.Notes,
	}
	if in.OutreachCount != nil {
		t.OutreachCount = *in.OutreachCount
	}
	if in.LastOutreachAt != nil {
		t.LastOutreachAt = strings.TrimSpace(*in.LastOutreachAt)
	}
	if in.Contacts != nil {
		t.Contacts = *in.Contacts
	}
	if in.Notes != nil {
		t.Notes = *in.Notes
	}
	p, err := e.DB.UpdatePostingTracking(in.PostingID, t)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return "", fmt.Errorf("no posting with id %q", in.PostingID)
		}
		return "", err // validation errors surface to the model
	}
	// A stage advances the application history (a dated entry), handled
	// separately since it's append-only, not full-state.
	if in.Stage != nil && strings.TrimSpace(*in.Stage) != "" {
		date := ""
		if in.StageDate != nil {
			date = *in.StageDate
		}
		p, err = e.DB.AppendStageEvent(in.PostingID, *in.Stage, date)
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return "", fmt.Errorf("no posting with id %q", in.PostingID)
			}
			return "", err
		}
	}
	return jsonString(map[string]any{
		"posting_id":     p.ID,
		"title":          p.Title,
		"stage":          store.CurrentStage(p.StageHistory),
		"stage_history":  store.ParseStageHistory(p.StageHistory),
		"outreach_count": p.OutreachCount,
		"last_outreach":  p.LastOutreachAt,
		"contacts":       p.Contacts,
	}), nil
}

func (e *Engine) toolSearch(ctx context.Context, input json.RawMessage) (string, error) {
	var in struct {
		Query string `json:"query"`
	}
	if err := json.Unmarshal(input, &in); err != nil {
		return "", fmt.Errorf("bad input: %w", err)
	}
	q := strings.ToLower(strings.TrimSpace(in.Query))
	if q == "" {
		return "", errors.New("query is required")
	}

	const maxHits = 20
	companies := []map[string]any{}
	rows, err := e.DB.TriageRows()
	if err != nil {
		return "", err
	}
	for _, r := range rows {
		if len(companies) >= maxHits {
			break
		}
		if strings.Contains(strings.ToLower(r.Name), q) || (r.DomainStr != "" && strings.Contains(strings.ToLower(r.DomainStr), q)) {
			companies = append(companies, map[string]any{
				"company_id": r.CompanyID,
				"name":       r.Name,
				"domain":     r.DomainStr,
				"verdict":    r.VerdictStr,
				"location":   r.LocationStr,
			})
		}
	}

	postings := []map[string]any{}
	jobs, err := e.DB.ListJobRows()
	if err != nil {
		return "", err
	}
	for _, j := range jobs {
		if len(postings) >= maxHits {
			break
		}
		if strings.Contains(strings.ToLower(j.Title), q) || strings.Contains(strings.ToLower(j.Company), q) {
			postings = append(postings, map[string]any{
				"posting_id": j.PostingID,
				"company_id": j.CompanyID,
				"company":    j.Company,
				"title":      j.Title,
				"stage":      store.CurrentStage(j.StageHistory),
			})
		}
	}

	return jsonString(map[string]any{
		"companies": companies,
		"postings":  postings,
	}), nil
}

func (e *Engine) toolGetCompany(ctx context.Context, input json.RawMessage) (string, error) {
	var in struct {
		CompanyID string `json:"company_id"`
	}
	if err := json.Unmarshal(input, &in); err != nil {
		return "", fmt.Errorf("bad input: %w", err)
	}
	d, err := e.DB.GetCompanyDetail(strings.TrimSpace(in.CompanyID))
	if err != nil {
		return "", err
	}
	if d == nil {
		return "", fmt.Errorf("no company with id %q (use search to find it)", in.CompanyID)
	}
	postings := []map[string]any{}
	for _, p := range d.Postings {
		postings = append(postings, map[string]any{
			"posting_id": p.ID, "title": p.Title, "url": p.URL,
			"stage": store.CurrentStage(p.StageHistory),
		})
	}
	return jsonString(map[string]any{
		"company_id": d.CompanyID, "name": d.Name, "domain": d.Domain,
		"location": d.Location, "vertical": d.Vertical, "headcount": d.Headcount,
		"funding_stage": d.FundingStage, "verdict": d.Verdict, "reason": d.Reason,
		"website_summary": d.WebsiteSummary, "notes": d.Notes, "postings": postings,
	}), nil
}

func (e *Engine) toolGetPosting(ctx context.Context, input json.RawMessage) (string, error) {
	var in struct {
		PostingID string `json:"posting_id"`
	}
	if err := json.Unmarshal(input, &in); err != nil {
		return "", fmt.Errorf("bad input: %w", err)
	}
	p, err := e.DB.GetPosting(strings.TrimSpace(in.PostingID))
	if err != nil {
		return "", err
	}
	if p == nil {
		return "", fmt.Errorf("no posting with id %q", in.PostingID)
	}
	name, _, _ := e.DB.GetCompanyName(p.CompanyID)
	return jsonString(map[string]any{
		"posting_id": p.ID, "company_id": p.CompanyID, "company": name,
		"title": p.Title, "url": p.URL, "location": p.Location,
		"employment_type": p.EmploymentType, "workplace_type": p.WorkplaceType,
		"department": p.Department, "comp_range": p.CompRange,
		"description": p.Description,
		"stage":       store.CurrentStage(p.StageHistory), "stage_history": store.ParseStageHistory(p.StageHistory),
		"outreach_count": p.OutreachCount, "contacts": p.Contacts, "notes": p.Notes,
	}), nil
}

func (e *Engine) toolSetNotes(ctx context.Context, input json.RawMessage) (string, error) {
	var in struct {
		CompanyID string `json:"company_id"`
		Notes     string `json:"notes"`
	}
	if err := json.Unmarshal(input, &in); err != nil {
		return "", fmt.Errorf("bad input: %w", err)
	}
	if strings.TrimSpace(in.CompanyID) == "" {
		return "", errors.New("company_id is required")
	}
	if err := e.DB.UpdateCompanyNotes(in.CompanyID, strings.TrimSpace(in.Notes)); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return "", fmt.Errorf("no company with id %q", in.CompanyID)
		}
		return "", err
	}
	return jsonString(map[string]any{"company_id": in.CompanyID, "saved": true}), nil
}

func (e *Engine) toolSetVerdict(ctx context.Context, input json.RawMessage) (string, error) {
	var in struct {
		CompanyID string `json:"company_id"`
		Verdict   string `json:"verdict"`
		Reason    string `json:"reason"`
	}
	if err := json.Unmarshal(input, &in); err != nil {
		return "", fmt.Errorf("bad input: %w", err)
	}
	v := strings.ToLower(strings.TrimSpace(in.Verdict))
	switch v {
	case "yes", "maybe", "no":
	default:
		return "", fmt.Errorf("verdict must be yes, maybe, or no")
	}
	// Reject an unknown company up front so a bad id can't create a dangling verdict.
	if _, _, err := e.DB.GetCompanyName(in.CompanyID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return "", fmt.Errorf("no company with id %q", in.CompanyID)
		}
		return "", err
	}
	if err := e.DB.UpsertVerdict(store.Verdict{
		CompanyID: in.CompanyID,
		Verdict:   v,
		Reason:    strings.TrimSpace(in.Reason),
		Model:     store.ManualModel, // sticky manual override (a verdict run won't overwrite)
	}); err != nil {
		return "", err
	}
	return jsonString(map[string]any{"company_id": in.CompanyID, "verdict": v}), nil
}

// --- schema + result helpers ----------------------------------------------

func objSchema(props map[string]any, required ...string) map[string]any {
	s := map[string]any{"type": "object", "properties": props}
	if len(required) > 0 {
		s["required"] = required
	}
	return s
}

func strProp(desc string) map[string]any {
	return map[string]any{"type": "string", "description": desc}
}
func intProp(desc string) map[string]any {
	return map[string]any{"type": "integer", "description": desc}
}

func enumProp(desc string, values ...string) map[string]any {
	return map[string]any{"type": "string", "description": desc, "enum": values}
}

// jsonString marshals a tool result to a compact JSON string for the model.
func jsonString(v any) string {
	b, err := json.Marshal(v)
	if err != nil {
		return fmt.Sprintf("{\"error\":%q}", err.Error())
	}
	return string(b)
}
