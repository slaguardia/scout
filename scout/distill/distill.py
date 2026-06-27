"""scout's intelligence layer in front of the brain.

The brain is a librarian: recall(query) returns the prose most related to a
question, and with the user's small corpus that retrieval is coarse — it returns
whole pages, scored almost flat, mixing the relevant with the irrelevant. The
distiller does the focusing the brain can't yet: it fans out a few company-fit
questions, dedups what comes back, then runs a TWO-STEP pass — (1) classify every
preference in the excerpts as COMPANY vs ROLE_OR_OTHER (with a verbatim quote +
polarity), (2) synthesize a company-fit BRIEF from the COMPANY items only. The
classify step physically removes the salient role/career material before the
persuasive synthesis runs, which is what reliably keeps it out of the brief.

The brief is scout-local: a re-derived view of brain knowledge, never written
back, and never a verdict.

Scope: COMPANIES ONLY. Role/title fit is a separate, later concern.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field

from scout import anthropic, brainbot

# companyQuestions are the recalls scout fans out to gather the user's company-fit
# criteria. They are intentionally company-shaped — what kind of company, what to
# avoid, stage/size, verticals. Roles, titles, and seniority are OUT OF SCOPE.
COMPANY_QUESTIONS = [
    "what kind of company does the user want to work at",
    "what does the user avoid in a company; hard dealbreakers and exclusions",
    "what stage, size, or funding maturity of company does the user prefer",
    "what industries, domains, or verticals does the user want to work in or avoid",
]

# defaultK is a generous per-question recall depth: with coarse retrieval we'd
# rather over-fetch and let the synthesis step discard than miss a criterion.
DEFAULT_K = 16

# Token budgets: the classify step enumerates every preference (can be long); the
# brief is a focused summary.
CLASSIFY_MAX_TOKENS = 2000
SYNTH_MAX_TOKENS = 1500


@dataclass
class Result:
    """A full distillation: the synthesized brief, the deduped chunks it was built
    from, the intermediate classified Items, and a stable Basis.

    Basis is the version key: the distiller's prompts + the recalled chunks'
    content, NOT the brief prose (which drifts cosmetically across runs)."""

    brief: str = ""
    chunks: list[brainbot.Chunk] = field(default_factory=list)
    items: str = ""
    basis: str = ""


class Distiller:
    """Turns brain recall into a company-fit brief."""

    def __init__(
        self,
        brain: brainbot.Client | None = None,
        client: anthropic.Client | None = None,
        model: str = "",
        k: int = 0,
        log: Callable[[str], None] | None = None,
    ):
        self.brain = brain
        self.client = client
        # model is used for BOTH the classify and synthesize calls. Empty →
        # anthropic.DEFAULT_MODEL. The caller defaults it to Sonnet because
        # fidelity matters more than the per-call cost.
        self.model = model
        self.k = k  # per-question recall depth; <= 0 → DEFAULT_K
        # log, if set, receives one line per recall plus the classify/synthesize
        # steps — the tuning instrument.
        self._log = log

    def log(self, fmt: str, *args) -> None:
        if self._log is not None:
            self._log(fmt % args if args else fmt)

    def distill(self) -> tuple[str, str]:
        """Return the brief plus its stable Basis. Raises on an unreachable brain,
        empty corpus, or LLM failure (the resolver falls back to cache / taste.md)."""
        res = self.run()
        return res.brief, res.basis

    def gather(self) -> tuple[list[brainbot.Chunk], str]:
        """Run ONLY the recall fan-out + dedup (no LLM) and return the deduped
        chunks plus the stable Basis. An empty corpus is an error here."""
        chunks = self._gather()
        if not chunks:
            # A reachable-but-empty brain: no company-fit material to distill.
            raise RuntimeError("brain returned no chunks for company-fit recalls")
        return chunks, basis_of(chunks)

    def synthesize(self, chunks: list[brainbot.Chunk]) -> str:
        """Run the LLM step — classify then synthesize — over chunks from a prior
        gather and return the company-fit brief. No recall here."""
        _, brief = self._synthesize_with_items(chunks)
        return brief

    def _synthesize_with_items(self, chunks: list[brainbot.Chunk]) -> tuple[str, str]:
        """The shared classify→synthesize body; also returns the intermediate
        classified Items so run() can expose them on Result for the CLI debug path."""
        items = self._classify(chunks)
        self.log(
            "distill: classified %d chunks → %d chars of tagged items", len(chunks), len(items)
        )
        brief = self._synthesize(items)
        self.log("distill: brief synthesized (%d chars)", len(brief))
        return items, brief

    def run(self) -> Result:
        """The whole distillation: gather → synthesize."""
        chunks, basis = self.gather()
        items, brief = self._synthesize_with_items(chunks)
        return Result(brief=brief, chunks=chunks, items=items, basis=basis)

    def _gather(self) -> list[brainbot.Chunk]:
        """Fan out the company-fit recalls and dedup the union of chunks by (path,
        heading), keeping the highest score. The result is sorted deterministically
        (score desc, then path, then heading) so the classify input is stable."""
        k = self.k if self.k > 0 else DEFAULT_K
        best: dict[str, brainbot.Chunk] = {}
        for q in COMPANY_QUESTIONS:
            try:
                rr = self.brain.recall(q, k)
            except Exception as e:  # noqa: BLE001 - wrap any recall failure with its query
                raise RuntimeError(f"recall {q!r}: {e}") from e
            self.log("distill: recall %r → %d chunks", q, len(rr.chunks))
            for c in rr.chunks:
                key = c.path + "\x00" + c.heading
                prev = best.get(key)
                if prev is None or c.score > prev.score:
                    best[key] = c

        out = list(best.values())
        out.sort(key=lambda c: (-c.score, c.path, c.heading))
        for c in out:
            self.log(
                "distill:   chunk %s (score %.4f, %d chars)", chunk_label(c), c.score, len(c.text)
            )
        return out

    def _classify(self, chunks: list[brainbot.Chunk]) -> str:
        """Step 1: tag every preference in the excerpts as COMPANY vs
        ROLE_OR_OTHER, with a verbatim quote and polarity."""
        resp = self.client.send(
            anthropic.Request(
                model=self.model,
                system=CLASSIFY_SYSTEM_PROMPT,
                max_tokens=CLASSIFY_MAX_TOKENS,
                messages=[anthropic.Message("user", format_chunks(chunks))],
                cached=True,
                temperature=0.0,
            )
        )
        items = resp.text().strip()
        if items == "":
            raise RuntimeError("distill classify returned nothing")
        return items

    def _synthesize(self, items: str) -> str:
        """Step 2: write the brief from the COMPANY-tagged items only."""
        resp = self.client.send(
            anthropic.Request(
                model=self.model,
                system=SYNTH_SYSTEM_PROMPT,
                max_tokens=SYNTH_MAX_TOKENS,
                messages=[anthropic.Message("user", items)],
                cached=True,
                temperature=0.0,
            )
        )
        brief = resp.text().strip()
        if brief == "":
            raise RuntimeError("distill synthesis returned empty brief")
        return brief


def basis_of(chunks: list[brainbot.Chunk]) -> str:
    """Build the stable version key: BOTH distiller prompts plus each chunk's
    path/heading/text, ordered by (path, heading). Excludes the hybrid-search score
    (jitters run-to-run) and the brief prose (drifts)."""
    sorted_chunks = sorted(chunks, key=lambda c: (c.path, c.heading))
    parts = [CLASSIFY_SYSTEM_PROMPT, "\x00", SYNTH_SYSTEM_PROMPT]
    for c in sorted_chunks:
        parts.append("\x00")
        parts.append(c.path)
        parts.append("\x00")
        parts.append(c.heading)
        parts.append("\x00")
        parts.append(c.text.strip())
    return "".join(parts)


def format_chunks(chunks: list[brainbot.Chunk]) -> str:
    """Render the deduped chunks as the classify step's user message: each labeled
    with its source path/heading so the model can attribute and triage them."""
    parts = ["Excerpts retrieved from the user's own notes:\n\n"]
    for c in chunks:
        parts.append(f"[Source: {chunk_label(c)}]\n{c.text.strip()}\n\n")
    parts.append("Classify every preference in these excerpts now.")
    return "".join(parts)


def chunk_label(c: brainbot.Chunk) -> str:
    """The human-readable "path — heading" label for a chunk."""
    if c.path != "" and c.heading != "" and c.path != c.heading:
        return c.path + " — " + c.heading
    if c.path != "":
        return c.path
    if c.heading != "":
        return c.heading
    return "(untitled)"


# classifySystemPrompt is step 1: extract + scope-classify every preference.
CLASSIFY_SYSTEM_PROMPT = """You are triaging excerpts from a user's personal job-search notes. Do NOT write a brief. Output a structured list only.

For EVERY distinct preference or rule in the excerpts, emit one item in EXACTLY this format:

<item scope="COMPANY|ROLE_OR_OTHER" polarity="INCLUDE|EXCLUDE|NEUTRAL" strength="HARD|SOFT|NEUTRAL">
quote: "<verbatim text copied exactly from the excerpt>"
claim: <one neutral sentence restating the preference>
</item>

Classification rules:
- scope="COMPANY" ONLY if the preference is about the COMPANY ITSELF: industry / vertical, what the product does, the industry it changes, mission, business model, funding stage, size / headcount, the company's location, ownership / independence.
- scope="ROLE_OR_OTHER" for ANYTHING about the user's job, day-to-day work, title, seniority, skills, the team/role culture they want, learning, or personal / career goals — EVEN IF it sounds company-flavored. These are all ROLE_OR_OTHER: "engineers do architecture not just coding", "being customer-facing matters", "mix of problems: software architecture, team dynamics", "building toward starting your own company", "maximize learning velocity", "proximity to people who have built and scaled".
- polarity is read from the QUOTE's literal wording, never inferred. A list of things to skip/avoid is EXCLUDE. A "hard rule" / "no X" / "skip" is EXCLUDE (and strength=HARD if stated as a hard rule). "Ideal / want / drawn to" is INCLUDE.
- strength=HARD only when the note says so ("hard rule", "always", "regardless", "automatic"). Otherwise SOFT. NEUTRAL for background facts.
- Cover EVERYTHING; do not judge importance — a later step filters and writes the brief.
- Copy quotes verbatim. Do not paraphrase or fix wording."""

# synthSystemPrompt is step 2: write the company-fit brief from the COMPANY items only.
SYNTH_SYSTEM_PROMPT = """Below are pre-classified preference items extracted from a user's notes, each tagged with scope, polarity, and strength and carrying a verbatim quote.

Write a concise COMPANY-FIT BRIEF using ONLY items with scope="COMPANY". Silently ignore every scope="ROLE_OR_OTHER" item — never rephrase, summarize, or smuggle it in, not even into Context.

Render exactly these three sections, "- " bullets only (no numbered lists, no sub-headers), one criterion per bullet:

## Hard dealbreakers
polarity=EXCLUDE items, and strength=HARD INCLUDE requirements. A company that violates one is an automatic "no".

## Strong preferences
SOFT INCLUDE / EXCLUDE items — strong signals, not absolute.

## Context
NEUTRAL, company-level background only (e.g. how to weigh domain proximity). No role, career, or personal content.

Faithfulness:
- Preserve each item's polarity DIRECTION exactly as its quote states it. A skip-list stays a skip-list; never invert it or infer the allowed complement.
- When the notes list acceptable alternatives (e.g. several okay verticals), state them as alternatives: "any one of: X, Y, Z qualifies."
- Be specific and compact; name verticals, stages, traits. For hard location / stage gates, mirror the note's own wording.
- Before finishing, verify: (a) no bullet describes the user's role, work, or personal goals; (b) every include / exclude bullet's direction matches its source. Drop any bullet that fails.

An optional one-line title above the sections is fine. Output only the brief."""
