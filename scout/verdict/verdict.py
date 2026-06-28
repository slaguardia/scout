"""Score enriched survivors with the Anthropic API over the current criteria
brief.

Results are persisted to verdicts. A scored company is sticky: a default run skips
any company that already has a verdict (criteria or playbook edits do not re-score
it). Re-scoring is always explicit — a targeted per-company run, or a force run.

Concurrency note: scoring runs sequentially because the single shared sqlite3
connection is not thread-safe. Result accounting, the verdict + trace writes, and
the progress emissions are unaffected — only wall-clock parallelism.
"""

from __future__ import annotations

import json
import re
import sys
from collections.abc import Callable
from dataclasses import dataclass, field

from scout import anthropic, taste
from scout.filter import Survivor, Taste
from scout.store.trace import VerdictTrace, insert_verdict_trace
from scout.store.verdicts import Verdict, VerdictCandidate, get_verdict, upsert_verdict


@dataclass
class Result:
    """The run summary."""

    considered: int = 0
    scored: int = 0
    skipped: int = 0
    failed: int = 0
    by_verdict: dict[str, int] = field(default_factory=dict)
    cache_creation_tokens: int = 0  # sum of cache_creation_input_tokens across all calls
    cache_read_tokens: int = 0  # sum of cache_read_input_tokens (the saving)


class Scorer:
    """The verdict driver."""

    def __init__(
        self,
        con=None,
        taste: taste.Block | None = None,
        filter: Taste | None = None,
        client: anthropic.Client | None = None,
        model: str = "",
        force: bool = False,
        only_blanks: bool = False,
        company_ids: list[str] | None = None,
        playbook: str = "",
        run_id: str = "",
        workers: int = 0,
        progress: Callable[[str], None] | None = None,
    ):
        self.con = con
        self.taste = taste
        self.filter = filter
        self.client = client
        self.model = model
        self.force = force  # re-score every eligible company, replacing existing verdicts
        # only_blanks limits the run to companies with no verdict row at all. Takes
        # precedence over force.
        self.only_blanks = only_blanks
        # company_ids limits the run to exactly these companies and always
        # re-scores them, bypassing the static taste filter. Overrides force/only_blanks.
        self.company_ids = company_ids
        # playbook is the agent's operating manual (how to decide). Empty falls
        # back to the built-in rubric.
        self.playbook = playbook
        # run_id tags every decision-trail row with the UI run uuid. Empty for CLI.
        self.run_id = run_id
        self.workers = workers
        self.progress = progress

    def emit(self, line: str) -> None:
        if self.progress is not None:
            self.progress(line)

    def run(self) -> Result:
        """Score every survivor (per filter rules) that has enrichment and lacks
        an up-to-date verdict."""
        if self.workers <= 0:
            self.workers = 4
        if self.model == "":
            self.model = anthropic.DEFAULT_MODEL

        cands = self.candidates()
        res = Result(considered=len(cands))
        if not cands:
            return res

        # Header up front so the parallelism is legible.
        workers = min(self.workers, len(cands))
        self.emit(f"scoring {len(cands)} companies · {workers} workers in parallel")

        for c in cands:
            self.emit(f"· {c.name}…")  # picked up
            v, cache_create, cache_read, err = self.score_one(c)
            res.cache_creation_tokens += cache_create
            res.cache_read_tokens += cache_read
            if err is not None:
                res.failed += 1
                print(f"verdict {c.company_id} ({c.name}) error: {err}")
                self.emit(f"{c.name} — error: {err}")
                continue
            if v is None:
                res.skipped += 1
                self.emit(f"{c.name} — skipped (up to date)")
                continue
            res.scored += 1
            res.by_verdict[v.verdict] = res.by_verdict.get(v.verdict, 0) + 1
            self.emit(f"{c.name} → {v.verdict} — {v.reason}")
        return res

    def candidates(self) -> list[VerdictCandidate]:
        """The companies to score, each paired with its 'ok' enrichment summary. A
        bulk run scores everything that survives the static taste filter; a
        targeted run scores exactly the requested companies and bypasses the filter
        entirely. Enrichment eligibility ('ok' row) still applies in both cases."""
        wanted = set(self.company_ids or [])

        if wanted:
            # Targeted: load the requested companies straight from the table,
            # skipping the static filter.
            svs = self.requested_companies(self.company_ids)
            by_id = {sv.id: sv for sv in svs}
            ids = [sv.id for sv in svs]
            if len(ids) < len(wanted):
                self.emit(f"targeted: {len(ids)} of {len(wanted)} requested companies exist")
        else:
            fres = self.filter.apply(self.con)
            by_id = {sv.id: sv for sv in fres.survivors}
            ids = [sv.id for sv in fres.survivors]
        if not ids:
            return []

        # Pull enrichment summaries for those IDs.
        q, args = build_in_query(
            """
SELECT company_id, COALESCE(website_summary, '')
FROM enrichment
WHERE fetch_status = 'ok' AND company_id IN """,
            ids,
        )
        rows = self.con.execute(q, args).fetchall()

        out: list[VerdictCandidate] = []
        for r in rows:
            sv = by_id[r[0]]
            out.append(
                VerdictCandidate(
                    company_id=r[0],
                    name=sv.name,
                    domain=sv.domain,
                    location=sv.location,
                    vertical=sv.vertical,
                    headcount=sv.headcount,
                    stage=sv.stage,
                    website_summary=r[1],
                )
            )
        if wanted and len(out) < len(ids):
            self.emit(
                f"targeted: {len(out)} of {len(ids)} requested companies have an ok enrichment row"
            )
        return out

    def requested_companies(self, id_list: list[str]) -> list[Survivor]:
        """Load the given companies as filter.Survivor projections, bypassing the
        static taste filter. IDs with no matching row are simply absent."""
        q, args = build_in_query(
            """
SELECT id, name, COALESCE(domain,''), COALESCE(location,''), COALESCE(vertical,''),
       COALESCE(headcount, 0), COALESCE(funding_stage,'')
FROM companies WHERE id IN """,
            id_list,
        )
        rows = self.con.execute(q, args).fetchall()
        return [
            Survivor(
                id=r[0],
                name=r[1],
                domain=r[2],
                location=r[3],
                vertical=r[4],
                headcount=r[5],
                stage=r[6],
            )
            for r in rows
        ]

    def score_one(self, c: VerdictCandidate) -> tuple[Verdict | None, int, int, Exception | None]:
        """Score one company. Returns (verdict|None, cache_creation, cache_read,
        err) — None verdict + None err means skipped (already up to date). The
        cache token counts are returned even on a parse/write error so run() can
        still aggregate them."""
        # A targeted run always re-scores — the user pointed at this company on
        # purpose, so even a sticky manual verdict is fair game.
        if not self.company_ids and (self.only_blanks or not self.force):
            existing = get_verdict(self.con, c.company_id)
            if existing is not None:
                # Any already-scored company is left untouched on a default or
                # blanks-only run.
                return None, 0, 0, None

        system = build_system_prompt(self.playbook, self.taste.text)
        user = build_user_prompt(c)

        try:
            resp = self.client.send(
                anthropic.Request(
                    model=self.model,
                    system=system,
                    max_tokens=256,
                    messages=[anthropic.Message("user", user)],
                    cached=True,  # taste + rubric are identical across all calls in a run
                    timeout=45.0,
                )
            )
        except Exception as e:  # noqa: BLE001 - surface as the run's per-company failure
            return None, 0, 0, e

        cc = resp.usage.cache_creation_input_tokens
        cr = resp.usage.cache_read_input_tokens
        try:
            verdict, reason = parse_verdict(resp.text())
        except ValueError as e:
            return None, cc, cr, ValueError(f"parse: {e} (raw={truncate(resp.text(), 200)!r})")

        v = Verdict(
            company_id=c.company_id,
            verdict=verdict,
            reason=reason,
            taste_version=self.taste.version,
            model=self.model,
        )
        try:
            upsert_verdict(self.con, v)
        except Exception as e:  # noqa: BLE001
            return None, cc, cr, e
        self.write_trace(c, self.model, verdict, reason)
        return v, cc, cr, None

    def write_trace(self, c: VerdictCandidate, model: str, verdict: str, reason: str) -> None:
        """Append one decision-trail row. Best-effort — a failure is logged but
        never fails the verdict."""
        t = VerdictTrace(
            company_id=c.company_id,
            run_id=self.run_id,
            model=model,
            taste_version=self.taste.version,
            criteria_source=self.taste.source,
            verdict=verdict,
            reason=reason,
        )
        try:
            insert_verdict_trace(self.con, t)
        except Exception as e:  # noqa: BLE001
            print(f"verdict trace {c.company_id} ({c.name}): {e}", file=sys.stderr)


def build_in_query(prefix: str, ids: list[str]) -> tuple[str, list]:
    if not ids:
        return prefix + "()", []
    ph = ",".join("?" for _ in ids)
    return prefix + "(" + ph + ")", list(ids)


# hard_contract is the one invariant the parser depends on. It is never editable
# from the playbook — a broken output contract breaks parsing.
HARD_CONTRACT = """You are Scout's verdict engine. Given a company, decide if it's worth the user's time to investigate further as a job opportunity. Reply ONLY with valid JSON, no preamble, no markdown fences. The JSON must have exactly two fields:
  {"verdict": "yes"|"maybe"|"no", "reason": "one-line, specific"}"""

# builtin_rubric is the fallback "how to decide" guidance used only when no
# playbook is supplied. The shipped default playbook supersedes this.
BUILTIN_RUBRIC = """Verdict rubric:
  - "yes":   high-confidence fit. Worth the user actively investigating.
  - "maybe": adjacent or uncertain. Worth a skim, not a deep dive.
  - "no":    poor fit or hard exclusion.

The reason must be specific — name the vertical, stage, or trait that drove the call. Don't say "matches taste" or "good fit"; say "AI infra for ML teams, Series B" or "crypto wallet (excluded)"."""

# hard_gate_rubric tells the LLM how to read the criteria brief.
HARD_GATE_RUBRIC = """The criteria below are a distilled company-fit brief in the user's own terms. Read it and apply it like this:
• Anything stated as a hard dealbreaker or exclusion is a gate: if the company hits it, the verdict is "no" (red). Name the dealbreaker in the reason.
• Anything stated as a hard requirement is a gate that must hold on its own. Where the brief lists acceptable alternatives ("any one of: X, Y, Z"), matching ONE satisfies it — not matching the others is expected and is NOT a strike.
• Strong preferences are weights, not gates: a miss leans "maybe" (yellow), never an automatic "no".
• Context is background for judgment, not a rule to gate on.

"""


def build_system_prompt(playbook: str, criteria: str) -> str:
    """Assemble three layers: the hard JSON contract (fixed), the playbook /
    how-to-decide (operator-editable, falls back to the builtin rubric), then the
    criteria / what-the-user-wants block."""
    b = HARD_CONTRACT
    b += "\n\n--- PLAYBOOK (how to decide) ---\n"
    pb = (playbook or "").strip()
    b += pb if pb != "" else BUILTIN_RUBRIC
    b += "\n\n--- CRITERIA (what the user wants) ---\n"
    b += HARD_GATE_RUBRIC
    b += (criteria or "").strip()
    return b


def build_user_prompt(c: VerdictCandidate) -> str:
    parts = [f"Company: {c.name}\n"]
    if c.domain != "":
        parts.append(f"Domain: {c.domain}\n")
    if c.vertical != "":
        parts.append(f"Vertical: {c.vertical}\n")
    if c.location != "":
        parts.append(f"Location: {c.location}\n")
    if c.headcount > 0:
        parts.append(f"Headcount: {c.headcount}\n")
    if c.stage != "":
        parts.append(f"Funding stage: {c.stage}\n")
    else:
        # Make the blank explicit. Omitting the field lets a weak model fill the
        # void — e.g. inferring "Series B" from a valuation in the website text.
        parts.append(
            "Funding stage: unknown (not in the data — do NOT infer a round from a valuation, raise, or headcount)\n"
        )
    if c.website_summary != "":
        parts.append(f"\nWebsite text (truncated):\n{c.website_summary}\n")
    parts.append("\nReturn the JSON verdict now.")
    return "".join(parts)


# Verdict parsing: tolerant of surrounding noise, fenced code blocks, etc.
_RE_JSON = re.compile(r"\{[^{}]*\}", re.S)


def parse_verdict(s: str) -> tuple[str, str]:
    """Parse the verdict JSON. Returns (verdict, reason); raises ValueError when no
    valid verdict JSON is present."""
    s = s.strip()
    candidates = [s]
    m = _RE_JSON.search(s)
    if m:
        candidates.insert(0, m.group(0))
    for c in candidates:
        try:
            v = json.loads(c)
        except (ValueError, json.JSONDecodeError):
            continue
        if not isinstance(v, dict):
            continue
        vv = str(v.get("verdict", "")).strip().lower()
        if vv in ("yes", "maybe", "no"):
            return vv, str(v.get("reason", "")).strip()
    raise ValueError("no valid verdict JSON")


def truncate(s: str, n: int) -> str:
    if len(s) <= n:
        return s
    return s[:n] + "…"
