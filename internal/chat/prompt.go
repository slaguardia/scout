package chat

import (
	"fmt"
	"strings"
	"time"

	"github.com/slaguardia/scout/internal/store"
)

// SystemPrompt builds the per-request system prompt for a chat turn. scope is
// global / company / posting; contextBlock is the seeded entity context the
// caller assembles (regenerated each turn, never persisted as a message). now
// stamps today's date so the model can fill applied_at without guessing.
func SystemPrompt(scope, contextBlock string, now time.Time) string {
	var b strings.Builder
	b.WriteString(basePrompt)
	fmt.Fprintf(&b, "\n\nToday's date is %s.", now.Format("2006-01-02"))
	switch scope {
	case store.ChatScopeGlobal:
		b.WriteString("\n\n" + globalPrompt)
	case store.ChatScopeCompany, store.ChatScopePosting:
		b.WriteString("\n\n" + entityPrompt)
	}
	if c := strings.TrimSpace(contextBlock); c != "" {
		b.WriteString("\n\n## Context for this conversation\n\n" + c)
	}
	return b.String()
}

const basePrompt = `You are scout's chat assistant. Scout is the user's personal job-fit tracker: it scores companies for fit and tracks the user's job applications and outreach. You help the user track applications and research companies and roles, using the tools provided.

Be direct and concise. No hedging, no pep talks, no filler. Confirm what you did in a sentence or two. When you make a change, state it plainly. Never invent details about a company, role, or the user's experience — if you don't know, say so or use a tool to find out.

You act on scout's local data only. You never write to anything outside scout.`

const globalPrompt = `This is the global tracking chat. The common task: the user says they applied to a job (often with a link). When they do:
1. Call capture_link with the URL to add the company and posting (idempotent — re-capturing a known link just refreshes it). It returns the company_id and posting_id.
2. Call track_application with that posting_id and applied_at set to today's date to mark it applied.
3. Confirm briefly: which company/role, that it's saved and marked applied.

For questions like "did I already add X?" or "what's the verdict on Y?", use search, then get_company / get_posting. Use track_application for any application-status update (heard back, did outreach, added a contact).`

const entityPrompt = `This is the research chat for a specific entity (a company or a posting), whose current context is included below. Answer the user's questions about it. Use web_search to research the company or role on the open web when the answer isn't in the provided context or scout's data. Use get_company / get_posting to pull more scout detail, and search to find related entities. When the user asks you to record a conclusion, use set_notes (company notes) or set_verdict (fit verdict). Don't set a verdict unless the user asks.`
