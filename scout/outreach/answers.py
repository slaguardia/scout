"""Application-answer generation.

Application-answer generation reuses the outreach Engine wholesale — the Anthropic
client, the cached context blocks, and (critically) the honesty checker. These
answers are claims made straight to a recruiter, so the "never invent experience"
rule matters even more than in cold email: every answer is routed through the same
honesty gate the email drafter uses. See docs/pipeline.md (`scout questions`).

The Engine methods live here as a mixin folded into Engine (engine.py).
"""

from __future__ import annotations

import json
import threading
from dataclasses import dataclass

from scout import anthropic
from scout.store import posting_answers, postings

from .jdfetch import JD_MAX_CHARS, fetch_jd, trunc

# ANSWER_MAX_TOKENS covers one essay answer (a few hundred words).
ANSWER_MAX_TOKENS = 1200


@dataclass
class AnswerContext:
    """The shared per-posting grounding, gathered once."""

    role: str = ""
    jd: str = ""
    brief: str = ""
    experience: str = ""
    logistics: str = ""
    voice: str = ""


def answer_length_guide(max_len: int) -> str:
    """Honor a declared char limit, else target a tight length."""
    if max_len > 0:
        return f"Length: keep the answer under {max_len} characters."
    return "Length: a tight 120-180 words."


def format_violations(vs: list[dict]) -> str:
    """Render honesty violations as the retry feedback."""
    return "\n".join(f"- {v['claim']} ({v['why']})" for v in vs).strip()


# ANSWER_SYSTEM is the application-answer drafter's system prompt. It leans on the
# honesty rule harder than the email drafter: an answer is a direct claim to a
# recruiter, so a thinner true answer beats an impressive invented one. Treat the
# prompt text as VERBATIM — do not reflow or edit it.
ANSWER_SYSTEM = """You write one applicant's answer to a single job-application essay question, in the applicant's own voice. The applicant is applying for this role; you are filling in their application.

Ground every factual claim in the provided experience card — roles, skills, scope, durations, domains. NEVER invent or inflate experience the card does not support: an honesty reviewer will reject anything beyond it, and a false claim to a recruiter is worse than a thinner answer. The company-fit brief is the applicant's OWN values — use it only to make "why this company" specific and true, never to claim a fit you cannot back up.

Biographical and logistics facts are NOT yours to invent. The applicant's current location (city/state/country), work authorization or visa status, citizenship, salary or compensation expectations, notice period, availability or start date, and willingness to relocate may be stated ONLY when the applicant-profile card states them (the experience card may also carry such a fact). The company-fit brief and the job description may name a company's location, an office, or a location preference — that is about the COMPANY, never where the applicant lives; never read the applicant's location out of the brief, the job description, or thin air. If the question asks for a biographical or logistics fact none of the provided cards contain, do NOT guess a value — write a short bracketed placeholder for the applicant to fill in (e.g. "[current location]", "[work authorization]") and nothing else for that fact.

Answer the question directly and specifically. Plain spoken English, concrete over abstract. No flattery, no filler, no "I am passionate about", no "I am excited to", no superlative you cannot earn with a specific fact. Do not restate the question. Write ONLY the answer text — no preamble, no salutation, no sign-off."""


class _AnswersMixin:
    """Application-answer generation methods, folded into Engine. Relies on Engine
    for self.con, self.client, self.http, self.brief, and the shared helpers
    (_log, _resolved_model, _knowledge, _require_experience, _ensure_knowledge,
    _honesty_check_text)."""

    def generate(self, posting_id: str) -> None:
        """Fire-and-forget: draft answers for all of a posting's pending questions
        in a background thread and return immediately (the panel polls each row).
        The web AnswersRunner entry point."""

        def _go() -> None:
            try:
                self.generate_answers(posting_id)
            except Exception as e:  # noqa: BLE001 - background task: log only
                self._log(f"answers: posting {posting_id}: {e}")

        threading.Thread(target=_go, daemon=True).start()

    def generate_answers(self, posting_id: str) -> None:
        """Draft every pending (status `generating`) answer for a posting,
        synchronously — the CLI entry point. Loads the shared context once, then
        drafts one Sonnet call + honesty check per question. Each answer is
        independent: one failure never blocks the rest, and every row ends in a
        terminal status (ready / needs_review / failed)."""
        pending = posting_answers.mark_answers_generating(self.con, posting_id)
        if not pending:
            return  # nothing unanswered
        self._log(f"answers: posting {posting_id} — {len(pending)} question(s) to draft")

        posting = postings.get_posting(self.con, posting_id)
        if posting is None:
            self._fail_answers(pending, RuntimeError(f"posting {posting_id} not found"))
            return

        # Sync knowledge from the brain first (change-aware), then require the
        # experience bundle — the honesty ground truth. Empty fails every answer
        # loud, not silent.
        self._ensure_knowledge()
        try:
            exp = self._require_experience()
        except Exception as e:  # noqa: BLE001 - dooms the whole batch
            self._fail_answers(pending, e)
            return

        ac = self._answer_context(posting, exp)

        for a in pending:
            answer, status, reason = self._draft_answer(ac, a)
            try:
                posting_answers.update_answer(self.con, a.id, answer, status, reason)
            except Exception as e:  # noqa: BLE001
                self._log(f"answers: save {a.id}: {e}")
                # Never strand the row in `generating` — best-effort flip to failed.
                if status != posting_answers.ANSWER_FAILED:
                    try:
                        posting_answers.update_answer(
                            self.con,
                            a.id,
                            "",
                            posting_answers.ANSWER_FAILED,
                            "save failed: " + str(e),
                        )
                    except Exception:  # noqa: BLE001
                        pass

    def _answer_context(self, posting, exp: str) -> AnswerContext:
        """Assemble the JD (stored description, or a live fetch), the brain
        company-fit brief (optional — degrades to none), the experience bundle (the
        honesty ground truth), the logistics/profile bundle (biographical facts —
        optional), and the voice bundle."""
        jd = trunc(posting.description, JD_MAX_CHARS)
        if jd.strip() == "":
            jd = fetch_jd(self.http, posting.url).text
        brief = ""
        if self.brief is not None:
            try:
                brief = self.brief().strip()
            except Exception as e:  # noqa: BLE001 - degrade to no brief
                self._log(f"answers: company-fit brief unavailable, drafting without it: {e}")
        return AnswerContext(
            role=posting.title.strip(),
            jd=jd,
            brief=brief,
            experience=exp,
            logistics=self._knowledge("logistics"),
            voice=self._knowledge("voice"),
        )

    def _draft_answer(self, ac: AnswerContext, a) -> tuple[str, str, str]:
        """Draft one answer and route it through the honesty checker, retrying once
        with the violations fed back. A second honesty failure keeps the answer but
        flags it needs_review rather than shipping a possibly-inflated claim. A
        draft or checker error fails the row. Returns (answer, status, reason)."""
        violation_note = ""
        for attempt in range(2):
            try:
                text = self._answer_call(ac, a, violation_note)
            except Exception as e:  # noqa: BLE001
                return "", posting_answers.ANSWER_FAILED, "draft: " + str(e)
            try:
                verdict, violations = self._honesty_check_text(ac.experience, ac.logistics, text)
            except Exception as e:  # noqa: BLE001
                return "", posting_answers.ANSWER_FAILED, "honesty check: " + str(e)
            if verdict == "pass":
                return text, posting_answers.ANSWER_READY, ""
            if attempt == 0:
                violation_note = format_violations(violations)
                continue
            vj = json.dumps(violations, separators=(",", ":"))
            return text, posting_answers.ANSWER_NEEDS_REVIEW, "honesty check flagged claims: " + vj
        return "", posting_answers.ANSWER_FAILED, "unreachable"

    def _answer_call(self, ac: AnswerContext, a, violation_note: str) -> str:
        """The single prose Sonnet call for one question. Output is plain text (not
        JSON), so it sends directly rather than through _call_json."""
        b: list[str] = []
        b.append(f"Application question:\n{a.prompt}\n\n")
        if ac.role != "":
            b.append(f"Role: {ac.role}\n\n")
        if ac.jd != "":
            b.append(f"Job description:\n{trunc(ac.jd, JD_MAX_CHARS)}\n\n")
        if ac.brief != "":
            b.append(
                'Company-fit brief (the applicant\'s own values — use ONLY to make "why this company" '
                f"specific and true, never to invent fit):\n{ac.brief}\n\n"
            )
        b.append(
            "Applicant experience (the applicant's work history — the source for every claim about what "
            f"they have done):\n{ac.experience}\n\n"
        )
        if ac.logistics != "":
            b.append(
                "Applicant profile (biographical & logistics facts — current location, work authorization, "
                "availability, comp, links; the ONLY source for any such fact):\n"
                f"{ac.logistics}\n\n"
            )
        if ac.voice != "":
            b.append(f"Voice rules (write like this):\n{ac.voice}\n\n")
        b.append(answer_length_guide(a.max_length))
        if violation_note != "":
            b.append(
                "\n\nA reviewer flagged these claims in your last draft — fix them without inventing "
                f"anything:\n{violation_note}"
            )

        resp = self.client.send(
            anthropic.Request(
                model=self._resolved_model(),
                system=ANSWER_SYSTEM,
                max_tokens=ANSWER_MAX_TOKENS,
                messages=[anthropic.Message("user", "".join(b))],
            )
        )
        text = resp.text().strip()
        if text == "":
            raise RuntimeError("empty answer")
        return text

    def _fail_answers(self, pending, err: Exception) -> None:
        """Mark every pending row failed with the shared reason — used when a
        precondition (missing block, missing posting) dooms the whole batch."""
        for a in pending:
            try:
                posting_answers.update_answer(
                    self.con, a.id, "", posting_answers.ANSWER_FAILED, str(err)
                )
            except Exception:  # noqa: BLE001
                pass
