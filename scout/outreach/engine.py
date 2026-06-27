"""The outreach draft pipeline engine.

The pipeline is: research the company (web) → fill the user's email template's
holes in one LLM call (using the cached brain knowledge bundle) → honesty-check the
filled holes against the user's experience → humanize → review queue. At the start
of every run the engine first syncs the knowledge bundle from the brain
(_ensure_knowledge — a cheap change-aware check), then reads the local cache
(template + outreach_sources) for the rest of the run.
"""

from __future__ import annotations

import json
import sqlite3
import threading
from collections.abc import Callable
from typing import Any

import httpx

from scout import anthropic, brainbot
from scout.store import companies, outreach_drafts, outreach_sources, postings

from .answers import _AnswersMixin, format_violations
from .discover import ensure_knowledge
from .jdfetch import JD_MAX_CHARS, JDResult, fetch_jd, trunc
from .jsonutil import extract_json_object
from .stages import _StagesMixin
from .template import Template, parse_template, template_or_default
from .voice import LintFinding, length_findings, voice_findings

# RESEARCHER_MAX_TOKENS covers the structured-facts JSON (hooks + the
# thesis/implication/signals read). Headroom so the final JSON isn't truncated
# after a multi-search transcript (a truncated object fails to parse).
RESEARCHER_MAX_TOKENS = 5000
# STAGE_MAX_TOKENS covers the smaller per-stage JSON outputs (fill, honesty).
STAGE_MAX_TOKENS = 2000
# MAX_CONTINUATIONS bounds pause_turn resumes of the hosted web_search server-side
# loop (per stage call); past it the partial output is used.
MAX_CONTINUATIONS = 4
# WEB_SEARCH_MAX_USES caps the researcher's hosted searches per run.
WEB_SEARCH_MAX_USES = 5

# Pipeline stage markers, persisted on the in-flight draft for the panel's progress
# bar. The order here is the order the run advances through them.
STAGE_RESEARCH = "research"
STAGE_FILL = "fill"
STAGE_HUMANIZE = "humanize"
STAGE_HONESTY = "honesty"


class Engine(_StagesMixin, _AnswersMixin):
    """Runs the outreach draft pipeline for one draft row. draft() fires async (the
    panel polls the row), run() is the synchronous CLI entry point. Every terminal
    path writes a final status — a row must never be left stuck in `researching`.

    Fields:
      con            — the sqlite3 connection.
      client         — the Anthropic client (research + fill + honesty).
      model          — model id; "" → anthropic.DEFAULT_MODEL.
      log            — optional log sink, Callable[[str], None].
      http           — optional httpx.Client for the deterministic JD pre-fetch.
      brainbot       — optional brain client; keeps the knowledge cache in sync.
      discover_model — cheap model for knowledge discovery; "" → DEFAULT_MODEL.
      brief          — optional Callable[[], str] producing the company-fit brief
                       for application-answer generation.
    """

    def __init__(
        self,
        con: sqlite3.Connection | None = None,
        client: anthropic.Client | None = None,
        model: str = "",
        log: Callable[[str], None] | None = None,
        http: httpx.Client | None = None,
        brainbot: brainbot.Client | None = None,
        discover_model: str = "",
        brief: Callable[[], str] | None = None,
    ):
        self.con = con
        self.client = client
        self.model = model
        self.log = log
        self.http = http
        self.brainbot = brainbot
        self.discover_model = discover_model
        self.brief = brief

    # --- small helpers -------------------------------------------------------

    def _log(self, s: str) -> None:
        if self.log is not None:
            self.log(s)

    def _resolved_model(self) -> str:
        return self.model if self.model != "" else anthropic.DEFAULT_MODEL

    def _set_stage(self, draft_id: int, stage: str) -> None:
        """Advance the draft's progress marker. Best-effort: a failed write is
        logged but never aborts the run."""
        try:
            outreach_drafts.set_outreach_draft_stage(self.con, draft_id, stage)
        except Exception as e:  # noqa: BLE001
            self._log(f"outreach: draft {draft_id} set stage {stage}: {e}")

    def _knowledge(self, need: str) -> str:
        """The cached whole-fetched bundle for a need (experience / voice /
        logistics), or "" when discovery has resolved no source for it."""
        try:
            s = outreach_sources.outreach_knowledge(self.con, need)
        except Exception as e:  # noqa: BLE001
            self._log(f"outreach: load {need} knowledge: {e}")
            return ""
        return s.strip()

    def _require_experience(self) -> str:
        """The experience bundle, erroring loud when it is empty. Experience is the
        honesty checker's ground truth, so an empty bundle must block drafting."""
        exp = self._knowledge("experience")
        if exp != "":
            return exp
        raise RuntimeError(
            "no experience page found in your brain — add one; scout syncs it automatically"
        )

    def _ensure_knowledge(self) -> None:
        """Auto-sync the outreach knowledge cache from the brain before a run reads
        it. Best-effort: a sync failure is logged and the run proceeds against the
        last-good cache."""
        try:
            ensure_knowledge(
                self.brainbot, self.client, self.con, self.discover_model, lambda s: self._log(s)
            )
        except Exception as e:  # noqa: BLE001
            self._log(f"outreach: ensure knowledge: {e}")

    # --- entry points --------------------------------------------------------

    def draft(self, draft_id: int, skip_research: bool = False) -> None:
        """Fire-and-forget: run the pipeline in a background thread and return
        immediately. The panel sees progress by polling the draft row. skip_research
        skips the web-research stage for this one draft."""

        def _go() -> None:
            try:
                self.run(draft_id, skip_research)
            except Exception as e:  # noqa: BLE001 - background task: log only
                self._log(f"outreach: draft {draft_id} failed: {e}")

        threading.Thread(target=_go, daemon=True).start()

    def run(self, draft_id: int, skip_research: bool = False) -> None:
        """Execute the whole pipeline synchronously. Always leaves the draft in a
        terminal-or-review status: on any error a still-`researching` row is flipped
        to `failed`, so a crash never strands a row. Raises on a genuine failure
        (after recording it); normal terminal outcomes return None."""
        try:
            self._run(draft_id, skip_research)
        except Exception as err:
            try:
                d = outreach_drafts.get_outreach_draft(self.con, draft_id)
            except Exception:  # noqa: BLE001
                d = None
            if d is not None and d.status == outreach_drafts.DRAFT_RESEARCHING:
                try:
                    outreach_drafts.set_outreach_draft_result(
                        self.con,
                        draft_id,
                        outreach_drafts.DRAFT_FAILED,
                        d.research,
                        d.hook,
                        d.draft,
                        d.lint,
                        d.violations,
                        d.critique,
                        str(err),
                    )
                except Exception:  # noqa: BLE001
                    pass
            raise

    def _run(self, draft_id: int, skip_research: bool) -> None:
        d = outreach_drafts.get_outreach_draft(self.con, draft_id)
        if d is None:
            raise RuntimeError(f"draft {draft_id} not found")
        posting = postings.get_posting(self.con, d.posting_id)
        if posting is None:
            raise RuntimeError(f"posting {d.posting_id} not found")
        company, _ = companies.company_name_by_id(self.con, posting.company_id)
        role = posting.title.strip()
        self._log(f'outreach: draft {draft_id} — {company} / "{role}"')

        # Sync the knowledge bundle from the brain (change-aware), then load the
        # template + bundle up front so a malformed template fails before spending
        # the research call.
        self._ensure_knowledge()
        tmpl = parse_template(
            template_or_default(self.con)
        )  # raises a clear "template: ..." message
        exp = self._require_experience()
        voice = self._knowledge("voice")  # soft

        # 1. Research. A regenerate carries the prior draft's research forward
        # (copied at create time), so we re-draft against the same web data.
        research = d.research.strip()
        if research != "":
            self._log(
                f"outreach: draft {draft_id} — reusing carried-over research "
                f"({len(research)} chars), skipping web search"
            )
        else:
            # The job description (no model). The capture pass stores the full
            # description for ATS-resolved postings.
            jd = JDResult(text=trunc(posting.description, JD_MAX_CHARS), status="stored at capture")
            if posting.description.strip() == "":
                jd = fetch_jd(self.http, posting.url)
            self._log(f"outreach: draft {draft_id} JD: {jd.status} ({len(jd.text)} chars)")

            self._set_stage(draft_id, STAGE_RESEARCH)
            research = '{"note":"researcher skipped — no web research"}'
            if self.stage_enabled("researcher") and not skip_research:
                research = self._research(company, posting.url, jd)
            outreach_drafts.set_outreach_draft_result(
                self.con,
                draft_id,
                outreach_drafts.DRAFT_RESEARCHING,
                research,
                "",
                "",
                "",
                "",
                "",
                "",
            )

        # 2-5. Fill → honesty-check → humanize → queue.
        self._fill_route(draft_id, research, tmpl, company, role, exp, voice)

    def _fill_route(
        self,
        draft_id: int,
        research: str,
        tmpl: Template,
        company: str,
        role: str,
        exp: str,
        voice: str,
    ) -> None:
        """Fill the template's holes in one call, honesty-check the filled spans
        against the experience bundle, and retry the fill once with the violations
        fed back. A no-send signal is the refusal success path: no draft. A
        fully-static template (no holes) skips fill+honesty (its prose is the
        user's own, true by construction)."""
        vars = {"role": role, "company": company}
        holes = tmpl.holes(vars)
        if not holes:
            email = tmpl.render(vars, None)
            outreach_drafts.set_outreach_draft_result(
                self.con,
                draft_id,
                outreach_drafts.DRAFT_AWAITING_REVIEW,
                research,
                "",
                email,
                combined_lint_json("", email),
                "",
                "",
                "",
            )
            return

        feedback = ""
        for attempt in range(2):
            self._set_stage(draft_id, STAGE_FILL)
            filled, no_send = self._fill(holes, research, exp, voice, feedback)
            if no_send:
                # "If you can't write even one true sentence for a company, don't
                # email them." No draft, no fallback — a success path.
                self._log(
                    f"outreach: draft {draft_id} no_send — nothing honest to say, "
                    "recommend not emailing"
                )
                outreach_drafts.set_outreach_draft_result(
                    self.con,
                    draft_id,
                    outreach_drafts.DRAFT_NO_HOOK,
                    research,
                    "",
                    "",
                    "",
                    "",
                    "",
                    "",
                )
                return

            # De-AI cleanup over the model-written holes (verbatim prose untouched),
            # then the deterministic flags.
            if self.stage_enabled("humanizer"):
                self._set_stage(draft_id, STAGE_HUMANIZE)
                filled = self._humanize(holes, filled, voice)
            email = tmpl.render(vars, filled)
            holes_text = concat_filled(holes, filled)
            lint = combined_lint_json(holes_text, email)

            # Honesty check the FILLED HOLES (the LLM-authored spans). A disabled
            # honesty check passes by default — the user opted out of that gate.
            verdict, honest, violations = "pass", True, []
            if self.stage_enabled("honesty"):
                self._set_stage(draft_id, STAGE_HONESTY)
                verdict, violations = self._honesty_check_text(exp, "", holes_text)
                honest = verdict == "pass"

            self._log(f"outreach: draft {draft_id} attempt {attempt + 1} — honesty {verdict}")

            # The only gate is honesty: an honest draft ships to the review queue. A
            # dishonest draft gets the one shared retry; still dishonest → failed.
            if honest:
                outreach_drafts.set_outreach_draft_result(
                    self.con,
                    draft_id,
                    outreach_drafts.DRAFT_AWAITING_REVIEW,
                    research,
                    "",
                    email,
                    lint,
                    "",
                    "",
                    "",
                )
                return
            if attempt == 0:
                feedback = retry_feedback(violations)
                continue
            viol_json = json.dumps(violations, separators=(",", ":"))
            outreach_drafts.set_outreach_draft_result(
                self.con,
                draft_id,
                outreach_drafts.DRAFT_FAILED,
                research,
                "",
                email,
                lint,
                viol_json,
                "",
                "honesty check failed twice",
            )
            return

    # --- research ------------------------------------------------------------

    def _research(self, company: str, job_url: str, jd: JDResult) -> str:
        """Run the Researcher with the hosted web_search server tool and parse its
        structured-facts JSON."""
        if jd.text == "":
            jd_section = "JD fetch failed: " + jd.status
        else:
            jd_section = f"Pre-fetched job description ({jd.status}):\n{jd.text}"
        user = f"Company: {company}\nJob URL: {job_url}\n\n{jd_section}"

        raw = self._call_json(
            self.stage_prompt("researcher"),
            user,
            RESEARCHER_MAX_TOKENS,
            [anthropic.new_web_search_tool(WEB_SEARCH_MAX_USES)],
        )
        try:
            return extract_json_object(raw)
        except ValueError as e:
            raise ValueError(f"parse research JSON: {e} (raw={trunc(raw, 200)!r})")

    # --- fill ----------------------------------------------------------------

    def _fill(
        self, holes, research: str, exp: str, voice: str, feedback: str
    ) -> tuple[dict | None, bool]:
        """Write every template hole in one call, using the research + experience +
        voice. Returns (per-hole text, no_send). no_send=True means a hole's
        instructions said to refuse and there is no honest basis."""
        b: list[str] = ["HOLES to fill (name: instructions):\n"]
        for h in holes:
            b.append(f"- {h.name}: {h.instr}\n")
        b.append(
            "\nCOMPANY RESEARCH (JSON, true facts about the company plus the researcher's read):\n"
            f"{research}\n"
        )
        b.append(f"\nMY EXPERIENCE (the ONLY facts you may claim about me):\n{exp}\n")
        if voice != "":
            b.append(f"\nMY VOICE (write the holes like this):\n{voice}\n")
        if feedback != "":
            b.append(
                "\nFEEDBACK on your last fill — address every point without inventing anything:\n"
                f"{feedback}\n"
            )

        raw = self._call_json(self.stage_prompt("fill"), "".join(b), STAGE_MAX_TOKENS, None)
        cleaned = extract_json_object(raw)
        try:
            out = json.loads(cleaned)
        except (ValueError, json.JSONDecodeError) as e:
            raise ValueError(f"decode fill JSON: {e}")
        if out.get("no_send"):
            self._log(f"outreach: fill declined: {out.get('reason', '')}")
            return None, True
        fills = out.get("fills") or {}
        for h in holes:
            if str(fills.get(h.name, "")).strip() == "":
                raise ValueError(f'fill left hole "{h.name}" empty (and did not signal no_send)')
        return fills, False

    # --- humanize ------------------------------------------------------------

    def _humanize(self, holes, filled: dict, voice: str) -> dict:
        """Run the de-AI cleanup over the model-written holes, matching the user's
        voice. Runs the deterministic flag after each pass and retries ONCE with the
        exact leftovers fed back. Best-effort: any error keeps the current text."""
        cur = filled
        feedback = ""
        for _ in range(2):
            cur = self._humanize_once(holes, cur, voice, feedback)
            bad = voice_findings(concat_filled(holes, cur))
            if not bad:
                return cur
            msgs = [f.message for f in bad]
            feedback = (
                "Your last pass still left: "
                + "; ".join(msgs)
                + ". Fix each by REWRITING the sentence (especially: replace every em dash, "
                "do not just move it)."
            )
            self._log("outreach: humanizer left voice issues, retrying: " + "; ".join(msgs))
        return cur  # still flagged after the retry — the deterministic flag surfaces it

    def _humanize_once(self, holes, filled: dict, voice: str, feedback: str) -> dict:
        """A single cleanup pass. Returns the current text unchanged on any error."""
        in_map = {h.name: filled.get(h.name, "") for h in holes}
        b: list[str] = [f"Paragraphs to clean (JSON):\n{json.dumps(in_map)}\n"]
        if voice != "":
            b.append(f"\nVOICE rules:\n{voice}\n")
        if feedback != "":
            b.append(f"\n{feedback}\n")
        try:
            raw = self._call_json(
                self.stage_prompt("humanizer"), "".join(b), STAGE_MAX_TOKENS, None
            )
        except Exception as e:  # noqa: BLE001
            self._log(f"outreach: humanizer failed, keeping current text: {e}")
            return filled
        try:
            cleaned = extract_json_object(raw)
        except ValueError:
            self._log("outreach: humanizer output unparseable, keeping current text")
            return filled
        try:
            out = json.loads(cleaned)
        except (ValueError, json.JSONDecodeError):
            return filled
        result: dict = {}
        for h in holes:
            t = str(out.get(h.name, "")).strip()
            result[h.name] = (
                t if t != "" else filled.get(h.name, "")
            )  # humanizer dropped it — keep current
        return result

    # --- honesty -------------------------------------------------------------

    def _honesty_check_text(
        self, experience: str, logistics: str, text: str
    ) -> tuple[str, list[dict]]:
        """Verify that `text` makes no claim beyond the documented ground truth: the
        experience bundle plus, when present, the logistics/profile bundle. It is
        isolated — it sees only those documents and the text, never the intended
        hook. Returns (verdict, violations)."""
        doc = experience
        if logistics.strip() != "":
            doc += "\n\n--- Applicant profile (biographical & logistics facts) ---\n" + logistics
        user = f"Experience document:\n{doc}\n\nText to verify:\n{text}"
        raw = self._call_json(self.stage_prompt("honesty"), user, STAGE_MAX_TOKENS, None)
        cleaned = extract_json_object(raw)
        try:
            out = json.loads(cleaned)
        except (ValueError, json.JSONDecodeError) as e:
            raise ValueError(f"decode honesty JSON: {e}")
        verdict = out.get("verdict", "")
        if verdict not in ("pass", "fail"):
            raise ValueError(f'honesty checker returned unknown verdict "{verdict}"')
        violations = [
            {"claim": v.get("claim", ""), "why": v.get("why", "")}
            for v in (out.get("violations") or [])
        ]
        return verdict, violations

    # --- shared LLM call with one JSON retry ---------------------------------

    def _call_json(self, system: str, user: str, max_tokens: int, tools: list[Any] | None) -> str:
        """Send a request and return the text output, retrying once with a "Return
        ONLY the JSON object." nudge when the first output has no JSON object. tools
        is passed through (the researcher uses web_search; the rest pass None)."""

        def send(msgs: list[anthropic.Message]) -> str:
            # The hosted web_search server tool runs a server-side loop; at its
            # iteration cap the API returns stop_reason "pause_turn" mid-turn.
            # Resume by replaying the assistant content verbatim and re-sending.
            text: list[str] = []
            cont = 0
            while True:
                resp = self.client.send(
                    anthropic.Request(
                        model=self._resolved_model(),
                        system=system,
                        max_tokens=max_tokens,
                        messages=msgs,
                        cached=True,
                        tools=tools,
                    )
                )
                text.append(resp.text())
                if resp.stop_reason != "pause_turn":
                    return "".join(text)
                if cont >= MAX_CONTINUATIONS:
                    self._log(
                        f"outreach: server tool loop still paused after {cont} continuations, "
                        "using partial output"
                    )
                    return "".join(text)
                self._log(f"outreach: server tool loop paused, continuing ({cont + 1})")
                msgs = msgs + [anthropic.Message(role="assistant", content=resp.raw_content())]
                cont += 1

        msgs = [anthropic.Message(role="user", content=user)]
        raw = send(msgs)
        try:
            extract_json_object(raw)
            return raw
        except ValueError:
            pass
        self._log("outreach: stage output had no JSON object, retrying once")
        msgs = msgs + [
            anthropic.Message("assistant", raw),
            anthropic.Message("user", "Return ONLY the JSON object, no prose, no markdown fences."),
        ]
        raw = send(msgs)
        try:
            extract_json_object(raw)
        except ValueError as e:
            raise ValueError(f"no JSON object after retry: {e}")
        return raw


# --- module-level helpers ----------------------------------------------------


def concat_filled(holes, filled: dict) -> str:
    """Join the filled holes in order — the text the honesty checker verifies (the
    LLM-authored spans only)."""
    parts: list[str] = []
    for h in holes:
        t = str(filled.get(h.name, "")).strip()
        if t != "":
            parts.append(t)
    return "\n\n".join(parts).strip()


def combined_lint_json(holes_text: str, email: str) -> str:
    """Run the deterministic flags — voice over the model-written holes text, word
    count over the rendered email — and return the combined findings as a JSON
    array (never null, so the panel renders [] cleanly)."""
    f: list[LintFinding] = voice_findings(holes_text) + length_findings(email)
    return json.dumps([{"code": x.code, "message": x.message} for x in f], separators=(",", ":"))


def retry_feedback(violations: list[dict]) -> str:
    """Label the honesty violations for the one retry fill."""
    if not violations:
        return ""
    return (
        "A reviewer flagged these claims in your last fill — fix them without inventing anything:\n"
        + format_violations(violations)
    )
