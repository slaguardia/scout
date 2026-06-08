// Package outreach assembles the cold-email context blocks from the brain.
//
// A block is a named slot of context (the frozen credential paragraph, the
// voice rules, ...) consumed by the outreach agents. Blocks are bound to brain
// documents by PINS (stable page ids, scout-side), fetched WHOLE via /doc at
// sync time, and cached versioned in SQLite. Drafting reads only the cache —
// never the brain. See docs/outreach-agent.md ("Retrieval — the brain, not
// Notion") and brainbot/plans/scout-migration.md for the contract.
package outreach

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"strings"

	"github.com/slaguardia/scout/internal/brainbot"
	"github.com/slaguardia/scout/internal/store"
)

// Tier is a block's stale policy.
type Tier string

const (
	// TierLocked blocks never auto-adopt upstream changes: the pin records the
	// approved version, and a sync that sees anything else halts the block.
	TierLocked Tier = "locked"
	// TierPointed blocks silently refetch when the upstream version moves.
	TierPointed Tier = "pointed"
	// TierDerived blocks are synthesized from sources (distill-style), not
	// fetched — built by a later phase, listed here so the slot set is total.
	TierDerived Tier = "derived"
)

// Slot is one block the outreach pipeline consumes.
type Slot struct {
	Name string
	Tier Tier
	Desc string
}

// Slots is the registry of every block slot, in display order.
var Slots = []Slot{
	{"P2_LOCKED", TierLocked, "frozen credential paragraph + signature"},
	{"HOOK_RULES", TierPointed, "effort ladder, earned-vs-performed, gating test"},
	{"CLOSER_RULES", TierPointed, "the 3 closer patterns + exemplar"},
	{"VOICE_RULES", TierPointed, "voice & style rules + anchors + hard-no list"},
	{"PAST_EXPERIENCE_FULL", TierPointed, "full experience doc (honesty checker only)"},
	{"HUMANIZER", TierPointed, "the humanizer skill prompt (file-pinned: file:/path/to/SKILL.md)"},
	{"EXPERIENCE_CARD", TierDerived, "~150-word fact sheet distilled from Past Experience"},
	{"BANK_ROWS", TierDerived, "writing-bank exemplars, selected by move per draft"},
}

// Required lists the blocks a draft run cannot start without. HUMANIZER and
// the derived blocks degrade gracefully (skipped pass / no exemplars) —
// these five do not.
var Required = []string{"P2_LOCKED", "HOOK_RULES", "CLOSER_RULES", "VOICE_RULES", "PAST_EXPERIENCE_FULL"}

// AnswersRequired lists the blocks application-answer generation cannot run
// without: the full experience doc, which is both the honesty checker's ground
// truth and the source the EXPERIENCE_CARD derives from. VOICE_RULES degrades
// gracefully (a less-voiced answer), so it is not required.
var AnswersRequired = []string{"PAST_EXPERIENCE_FULL"}

// MissingBlocks reports which Required (outreach) blocks are absent or broken in
// the local cache. Empty means drafting may start. Cache-only — no brain call.
func MissingBlocks(db *store.DB) ([]string, error) { return missingBlocks(db, Required) }

// MissingAnswerBlocks is MissingBlocks for the answer-generation gate.
func MissingAnswerBlocks(db *store.DB) ([]string, error) { return missingBlocks(db, AnswersRequired) }

func missingBlocks(db *store.DB, names []string) ([]string, error) {
	var missing []string
	for _, name := range names {
		b, err := db.GetOutreachBlock(name)
		if err != nil {
			return nil, err
		}
		if b == nil || b.Broken != "" || b.Content == "" {
			missing = append(missing, name)
		}
	}
	return missing, nil
}

// CachedStatuses reports every slot's state from the local cache alone (no
// brain call) — the cheap read behind GET /api/outreach/blocks.
func CachedStatuses(db *store.DB) ([]BlockStatus, error) {
	var out []BlockStatus
	for _, slot := range Slots {
		st := BlockStatus{Block: slot.Name, Tier: slot.Tier}
		b, err := db.GetOutreachBlock(slot.Name)
		if err != nil {
			return nil, err
		}
		switch {
		case b == nil && slot.Tier == TierDerived:
			st.State = "derived"
		case b == nil:
			st.State = "unpinned"
		case b.Broken != "":
			st.State = "broken"
			st.Detail = b.Broken
		case strings.HasPrefix(b.Version, "declared:"):
			st.State = "declared"
			st.Version = b.Version
		default:
			st.State = "ok"
			st.Version = b.Version
		}
		out = append(out, st)
	}
	return out, nil
}

// SlotByName returns the registered slot, or nil.
func SlotByName(name string) *Slot {
	for i := range Slots {
		if Slots[i].Name == name {
			return &Slots[i]
		}
	}
	return nil
}

// BlockStatus is one slot's outcome from a Sync pass.
type BlockStatus struct {
	Block   string `json:"block"`
	Tier    Tier   `json:"tier"`
	State   string `json:"state"` // ok | unchanged | broken | unpinned | derived
	Version string `json:"version,omitempty"`
	Detail  string `json:"detail,omitempty"`
}

// Sync refreshes every pinned block from the brain, honoring tier rules:
// /map versions are used only as a cheap skip hint; content is fetched whole
// via /doc and cached keyed by the versions from those same /doc responses.
// A 404 on a pinned id, or version drift on a locked block, marks the block
// broken (loud — drafting must not run with it) without failing the rest of
// the pass. Transport-level errors fail the pass.
func Sync(ctx context.Context, brain *brainbot.Client, db *store.DB) ([]BlockStatus, error) {
	pins, err := db.ListOutreachPins()
	if err != nil {
		return nil, fmt.Errorf("list pins: %w", err)
	}
	byBlock := map[string][]store.OutreachPin{}
	for _, p := range pins {
		byBlock[p.Block] = append(byBlock[p.Block], p)
	}

	m, err := brain.Map(ctx)
	if err != nil {
		return nil, fmt.Errorf("brain map: %w", err)
	}
	hint := make(map[string]string, len(m.Sources))
	for _, s := range m.Sources {
		hint[s.ID] = s.Version
	}

	var out []BlockStatus
	for _, slot := range Slots {
		st := BlockStatus{Block: slot.Name, Tier: slot.Tier}
		switch {
		case slot.Tier == TierDerived:
			st.State = "derived"
			st.Detail = "synthesized, not synced (later phase)"
		case len(byBlock[slot.Name]) == 0:
			// User-declared content (scout outreach set) lives in the cache
			// with no pin; sync never touches it.
			if b, err := db.GetOutreachBlock(slot.Name); err == nil && b != nil && b.Broken == "" && strings.HasPrefix(b.Version, "declared:") {
				st.State = "declared"
				st.Version = b.Version
			} else {
				st.State = "unpinned"
			}
		default:
			st = syncBlock(ctx, brain, db, slot, byBlock[slot.Name], hint)
		}
		out = append(out, st)
	}
	return out, nil
}

func syncBlock(ctx context.Context, brain *brainbot.Client, db *store.DB, slot Slot, pins []store.OutreachPin, hint map[string]string) BlockStatus {
	st := BlockStatus{Block: slot.Name, Tier: slot.Tier}

	// Cheap skip: every pinned id present in /map with versions matching the
	// cached assembly. (/map is a hint only — on any doubt, fetch.)
	if cached, err := db.GetOutreachBlock(slot.Name); err == nil && cached != nil && cached.Broken == "" {
		if hintVersion, complete := joinHint(pins, hint); complete && hintVersion == cached.Version {
			st.State = "unchanged"
			st.Version = cached.Version
			return st
		}
	}

	broke := func(why string) BlockStatus {
		if err := db.MarkOutreachBlockBroken(slot.Name, why); err != nil {
			why += " (and persisting the failure failed: " + err.Error() + ")"
		}
		st.State = "broken"
		st.Detail = why
		return st
	}

	texts := make([]string, 0, len(pins))
	versions := make([]string, 0, len(pins))
	for _, p := range pins {
		text, version, err := FetchPin(ctx, brain, p.PageID)
		if err != nil {
			if errors.Is(err, errPinGone) {
				// The source left the synced set / disk: loud failure, never
				// silently skip a block's source material.
				return broke(fmt.Sprintf("pinned source %s is gone — re-pin required", p.PageID))
			}
			return broke(fmt.Sprintf("fetch %s: %v", p.PageID, err))
		}
		if slot.Tier == TierLocked {
			if p.ApprovedVersion == "" {
				return broke(fmt.Sprintf("locked block pinned without an approved version (pin %s with --approve)", p.PageID))
			}
			if version != p.ApprovedVersion {
				return broke(fmt.Sprintf("upstream version changed (%s, approved %s) — re-approve required, never auto-adopt", version, p.ApprovedVersion))
			}
		}
		texts = append(texts, text)
		versions = append(versions, version)
	}

	content := strings.Join(texts, "\n\n")
	version := strings.Join(versions, "+")
	if err := db.PutOutreachBlock(slot.Name, content, version); err != nil {
		return broke(fmt.Sprintf("cache write: %v", err))
	}
	st.State = "ok"
	st.Version = version
	return st
}

// joinHint assembles the /map-derived version key for a pin list. complete is
// false when any pinned id is absent from the map (then the hint is unusable
// and the caller must fetch). file: pins never hint — the file is re-read
// every sync (it's local and cheap; the skill repo is actively edited).
func joinHint(pins []store.OutreachPin, hint map[string]string) (version string, complete bool) {
	parts := make([]string, 0, len(pins))
	for _, p := range pins {
		if strings.HasPrefix(p.PageID, "file:") {
			return "", false
		}
		v, ok := hint[p.PageID]
		if !ok {
			return "", false
		}
		parts = append(parts, v)
	}
	return strings.Join(parts, "+"), true
}

// errPinGone marks a pinned source that no longer exists (brain 404 or a
// missing file) — distinct from transport errors so the caller can word the
// loud failure correctly.
var errPinGone = errors.New("pinned source gone")

// FetchPin resolves one pin to (text, version). Brain pins are stable page
// ids fetched via /doc; "file:" pins read a local file (e.g. the humanizer
// skill prompt living in the user's personal repo) with a content-hash
// version.
func FetchPin(ctx context.Context, brain *brainbot.Client, pageID string) (string, string, error) {
	if path, ok := strings.CutPrefix(pageID, "file:"); ok {
		data, err := os.ReadFile(path)
		if err != nil {
			if os.IsNotExist(err) {
				return "", "", errPinGone
			}
			return "", "", err
		}
		sum := sha256.Sum256(data)
		return string(data), "file:" + hex.EncodeToString(sum[:6]), nil
	}
	doc, err := brain.Doc(ctx, pageID)
	if err != nil {
		if brainbot.IsNotFound(err) {
			return "", "", errPinGone
		}
		return "", "", err
	}
	return doc.Text, doc.Version, nil
}

// DeclareBlock stores user-declared block content directly in the cache (no
// pin, no brain) — the path for P2_LOCKED, whose content is a decision, not a
// fact lying in a doc. The version is a content hash; for locked blocks the
// declaration IS the approval. Sync leaves declared blocks alone.
func DeclareBlock(db *store.DB, block, content string) (string, error) {
	slot := SlotByName(block)
	if slot == nil {
		return "", fmt.Errorf("unknown block %q", block)
	}
	if slot.Tier == TierDerived {
		return "", fmt.Errorf("%s is a derived block — it is synthesized, not declared", block)
	}
	content = strings.TrimSpace(content)
	if content == "" {
		return "", fmt.Errorf("empty content")
	}
	sum := sha256.Sum256([]byte(content))
	version := "declared:" + hex.EncodeToString(sum[:6])
	if err := db.PutOutreachBlock(block, content, version); err != nil {
		return "", err
	}
	return version, nil
}
