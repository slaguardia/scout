"""The email template: fixed prose plus {{var}} / {{name: instructions}} tokens.
Port of internal/outreach/template.go.

  {{var}}                — a simple substitution resolved in code from the posting
                           (e.g. {{role}}, {{company}}). The LLM never sees these.
  {{name: instructions}} — a HOLE the fill LLM writes, guided by instructions.
                           Instructions may themselves contain {{var}} references,
                           which are resolved before the LLM sees them.

It lives in the DB (a singleton row) so a dashboard save can't clobber it and git
never touches it. Parsing fails loud on a malformed template.
"""
from __future__ import annotations

import re
import sqlite3
from dataclasses import dataclass

from scout.store import outreach_template

# DefaultTemplate is the compiled-in starting template, used until the user saves
# their own. "Your Name" stays a placeholder the user localizes. (The subject
# line's em dash is intentional — see voice.py's note about never linting the
# subject.) Copied VERBATIM from the Go const.
DEFAULT_TEMPLATE = """Subject: [Recipient] | Your Name — intro re {{role}}

Hi [Recipient],

{{hook: Open warm and human, in the sender's voice. If the research surfaced a real, specific thing {{company}} or its founders said or did (an essay, a podcast take, a launch, a clear bet), react to it genuinely in a plain sentence — no stock reaction phrase ("stuck with me", "resonated", "caught my eye"). CRITICAL — do NOT claim the sender has experienced, watched, or lived the company's problem unless the experience docs SPECIFICALLY show that exact thing; by default they have NOT, so react as a genuinely interested outsider and let the background paragraph stand on its own (inventing "I've seen a version of that from the other side" is a fabrication — worse than saying nothing). When you draw out what their bet means for the work, address THEM directly — "your {{role}} has to…", "you'll need…" — not an impersonal "someone has to…", and connect the observation to its implication directly: cut flat connective/meta sentences ("that framing makes the role make sense") AND conditional-hedge bridges ("if that bet is right", "if that's right") — just state what it means. If there's nothing real and specific to grab, a simple honest intro: "I saw you're hiring a {{role}} and wanted to introduce myself." No claims about the sender's background beyond what the docs support.}}

{{proof: One or two plain sentences on the SHAPE of my relevant experience — the kind of work and the kind of constraint I've handled (e.g. "deploying software into locked-down, regulated environments and making those rollouts repeatable"), stated confidently as the relevant thing. Honesty means not CLAIMING experience the docs don't show; it does NOT mean announcing what I haven't done — never volunteer a gap ("I haven't worked in X") or disclaim the fit. Stay at altitude: the shape of the work, NOT a specific-project case study (no "I led the integration of <vendor>, designed the pipeline, ran the reviews…"), and no insider jargon a stranger can't decode. Pick the shape so the relevance to {{company}}'s problem is self-evident; don't bolt on a forced "this maps directly to you" sentence. One thread, not a résumé.}}

{{closer: One or two tight sentences on the sender's MOTIVATION — what genuinely draws him to {{company}} (what they're building that he wants to be part of) or what he's looking for that they offer — then a simple low-friction ask ("Open to a quick call about the {{role}} role?"). Do NOT recap his background or experience: the middle paragraph already covered that, so restating it here is redundant. Do NOT volunteer what he hasn't done ("I haven't worked in X"). A brief "I want to be part of it" is fine, but no gush, and don't list the company's challenges back at them. NEVER claim he's watched, seen, or lived the company's problem ("a problem I've watched up close for years") unless the docs specifically show it. Don't posture as "your next {{role}}".}}

Thanks,
Your Name"""

# DefaultFollowupTemplate is the compiled-in starting follow-up template (M53).
# Unlike DEFAULT_TEMPLATE it has no LLM holes — it's pure variable substitution the
# user copy-pastes when a follow-up is due. "Your Name" stays a placeholder.
DEFAULT_FOLLOWUP_TEMPLATE = """Subject: Following up — {{role}} at {{company}}

Hi {{contact_name}},

Wanted to gently follow up on my note below about the {{role}} role at {{company}} — still very interested and happy to share anything that would help. Would a quick call make sense?

Thanks,
Your Name

--- my earlier note ({{last_sent}}) ---
{{last_message}}"""


# M55 send-path pieces. The subject is pure {{role}}/{{company}} substitution (no
# LLM); the signature is an appended block (empty by default — the DEFAULT_TEMPLATE
# body still carries its own sign-off until the slice-6 restructure moves it here).
DEFAULT_SUBJECT = "Reaching out about the {{role}} role"
DEFAULT_SIGNATURE = ""
DEFAULT_FOLLOWUP_SUBJECT = "Following up — {{role}} at {{company}}"


def subject_or_default(con: sqlite3.Connection | None) -> str:
    if con is not None:
        try:
            c = outreach_template.get_subject_template(con)
            if c.strip() != "":
                return c
        except Exception:  # noqa: BLE001 - fall back to the default
            pass
    return DEFAULT_SUBJECT


def signature_or_default(con: sqlite3.Connection | None) -> str:
    if con is not None:
        try:
            c = outreach_template.get_signature_template(con)
            if c.strip() != "":
                return c
        except Exception:  # noqa: BLE001
            pass
    return DEFAULT_SIGNATURE


def followup_subject_or_default(con: sqlite3.Connection | None) -> str:
    if con is not None:
        try:
            c = outreach_template.get_followup_subject_template(con)
            if c.strip() != "":
                return c
        except Exception:  # noqa: BLE001
            pass
    return DEFAULT_FOLLOWUP_SUBJECT


def render_subject(con: sqlite3.Connection | None, role: str, company: str) -> str:
    """The configured (or default) send subject with {{role}}/{{company}} filled."""
    return subst_vars(subject_or_default(con), {"role": role, "company": company}).strip()


def template_or_default(con: sqlite3.Connection | None) -> str:
    """Return the user's saved template, or the compiled-in default when none is
    saved (or on a read error — a draft never blocks on this)."""
    if con is not None:
        try:
            c = outreach_template.get_outreach_template(con)
            if c.strip() != "":
                return c
        except Exception:  # noqa: BLE001 - fall back to the default
            pass
    return DEFAULT_TEMPLATE


# Segment kinds.
_SEG_LITERAL = 0  # verbatim prose
_SEG_VAR = 1      # {{name}} — substituted from vars
_SEG_HOLE = 2     # {{name: instructions}} — filled by the LLM


@dataclass
class _Segment:
    kind: int
    text: str = ""    # literal text (SEG_LITERAL)
    name: str = ""    # var/hole name
    instr: str = ""   # hole instructions, with nested {{var}} still unresolved


_IDENT_RE = re.compile(r"[A-Za-z][A-Za-z0-9_]*")
_BARE_VAR_RE = re.compile(r"\{\{\s*([A-Za-z][A-Za-z0-9_]*)\s*\}\}")


@dataclass
class Hole:
    """One fillable slot surfaced to the engine: its name and the instructions
    (with {{var}} references already resolved against the posting)."""

    name: str = ""
    instr: str = ""


class Template:
    """A parsed email template ready to render."""

    def __init__(self, segs: list[_Segment]):
        self._segs = segs

    def holes(self, vars: dict[str, str] | None) -> list[Hole]:
        """The fillable slots in order, with {{var}} references in each instruction
        resolved against vars. Duplicate hole names are de-duplicated (first
        instruction wins) — the fill LLM is asked for each name once."""
        vars = vars or {}
        out: list[Hole] = []
        seen: set[str] = set()
        for s in self._segs:
            if s.kind == _SEG_HOLE and s.name not in seen:
                seen.add(s.name)
                out.append(Hole(name=s.name, instr=subst_vars(s.instr, vars)))
        return out

    def render(self, vars: dict[str, str] | None, filled: dict[str, str] | None) -> str:
        """Assemble the final email: literal prose verbatim, vars substituted,
        holes replaced by their filled text. An unresolved var or unfilled hole is
        left as its literal token so the gap is visible, never silently blank."""
        vars = vars or {}
        filled = filled or {}
        b: list[str] = []
        for s in self._segs:
            if s.kind == _SEG_LITERAL:
                b.append(s.text)
            elif s.kind == _SEG_VAR:
                b.append(vars[s.name] if s.name in vars else "{{" + s.name + "}}")
            elif s.kind == _SEG_HOLE:
                b.append(filled[s.name] if s.name in filled else "{{" + s.name + "}}")
        return dewrap("".join(b).strip())


def parse_template(tmpl: str) -> Template:
    """Tokenize the template into literal/var/hole segments, scanning {{...}} with
    nesting so a hole's instructions may contain {{var}}. Raises ValueError on an
    unterminated or non-identifier token."""
    segs: list[_Segment] = []
    lit: list[str] = []

    def flush() -> None:
        if lit:
            segs.append(_Segment(_SEG_LITERAL, text="".join(lit)))
            lit.clear()

    i = 0
    n = len(tmpl)
    while i < n:
        if i + 1 < n and tmpl[i] == "{" and tmpl[i + 1] == "{":
            # Find the matching }} accounting for nested {{ }}.
            depth, j = 1, i + 2
            while j + 1 < n:
                if tmpl[j] == "{" and tmpl[j + 1] == "{":
                    depth += 1
                    j += 2
                elif tmpl[j] == "}" and tmpl[j + 1] == "}":
                    depth -= 1
                    if depth == 0:
                        break
                    j += 2
                else:
                    j += 1
            if depth != 0:
                raise ValueError(f"template: unterminated {{{{ near offset {i}")
            inner = tmpl[i + 2:j]
            flush()
            name, sep, instr = inner.partition(":")
            name = name.strip()
            if not _IDENT_RE.fullmatch(name):
                raise ValueError(f"template: malformed token {{{{{inner}}}}} — {name!r} is not an identifier")
            if sep:  # had a colon → hole
                segs.append(_Segment(_SEG_HOLE, name=name, instr=instr.strip()))
            else:
                segs.append(_Segment(_SEG_VAR, name=name))
            i = j + 2
            continue
        lit.append(tmpl[i])
        i += 1
    flush()
    return Template(segs)


# dewrapJoinMin is the line length at/above which a mid-paragraph newline is
# treated as an accidental soft-wrap and collapsed to a space.
_DEWRAP_JOIN_MIN = 45


def dewrap(s: str) -> str:
    """Un-hard-wrap prose: join a line into the next with a single space when the
    line is long enough to look soft-wrapped, while preserving blank-line paragraph
    breaks and short intentional lines (the signature, a greeting)."""
    lines = s.split("\n")
    b: list[str] = []
    for i, line in enumerate(lines):
        b.append(line)
        if i == len(lines) - 1:
            break
        nxt = lines[i + 1]
        # A blank line on either side is a paragraph break — never collapse it.
        if line.strip() == "" or nxt.strip() == "":
            b.append("\n")
            continue
        if len(line.rstrip(" \t")) >= _DEWRAP_JOIN_MIN:
            b.append(" ")
        else:
            b.append("\n")
    return "".join(b)


def subst_vars(s: str, vars: dict[str, str]) -> str:
    """Replace {{var}} tokens in s from vars; unknown vars are left as-is."""
    def repl(m: re.Match) -> str:
        name = m.group(1)
        return vars[name] if name in vars else m.group(0)
    return _BARE_VAR_RE.sub(repl, s)
