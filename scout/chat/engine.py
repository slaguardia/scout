"""scout's chat engine: a Sonnet 4.6 tool-using agent.

Behind two surfaces (a global "I applied to <link>" tracking chat and a per-entity
research chat). Both share this one engine — the only new machinery is the
client-side tool loop. Chat is scout-local and disposable; it is never written to
the brain.

The loop: build a streamed request (system + thread history + tools, model
claude-sonnet-4-6, adaptive thinking) → stream, forwarding text deltas to the UI →
on a tool_use stop, execute each custom tool against the store, append the
tool_use turn and the matching tool_result turn, and continue with a fresh streamed
request → until end_turn. The hosted web_search server tool's pause_turn is resumed
inside one assistant turn. Iterations are capped so a runaway model can't loop.
"""

from __future__ import annotations

import json
import sqlite3
from collections.abc import Callable

from scout import capture
from scout.anthropic import ADAPTIVE_THINKING, Client, Message, Request
from scout.store import chat as chat_store

from .tools import register_tools, tool_result

# Model is the chat model — Sonnet 4.6, per the spec. Distinct from the verdict
# model (Haiku): chat reasons over tools and prose, not a fixed rubric.
MODEL = "claude-sonnet-4-6"

_DEFAULT_MAX_ITERS = 8  # tool round-trips before we stop (runaway guard)
_DEFAULT_MAX_CONTINUATIONS = 6  # pause_turn resumes of the hosted web_search loop
_DEFAULT_MAX_TOKENS = 8192  # per assistant turn

# Human-readable verbs for the live activity feed (on_event), so the UI can show
# "· saving notes…" while a tool runs. Unmapped tools fall back to "using <name>".
_TOOL_VERB = {
    "capture_link": "capturing the link",
    "track_application": "updating the application",
    "search": "searching scout",
    "get_company": "reading the company",
    "get_posting": "reading the posting",
    "set_notes": "saving notes",
    "set_verdict": "setting the verdict",
    "update_company": "updating the company",
}


class Engine:
    """Runs chat turns against the store. Construct with new(); it builds the tool
    registry (including the capture pass) once."""

    def __init__(self, con: sqlite3.Connection, client: Client):
        self.con = con
        self.client = client
        self.capturer = capture.Capturer(db=con, client=client)
        self.model = MODEL
        self.max_iters = _DEFAULT_MAX_ITERS
        self.log: Callable[[str], None] | None = None  # optional progress/debug sink

        self.tools: dict = {}  # custom tools by name
        self.tool_wire: list = []  # the tools array (custom + web_search)
        register_tools(self)

    def _model(self) -> str:
        return self.model or MODEL

    def _max_iters(self) -> int:
        return self.max_iters if self.max_iters > 0 else _DEFAULT_MAX_ITERS

    def _logf(self, fmt: str, *args) -> None:
        if self.log is not None:
            self.log(fmt % args if args else fmt)

    def run(
        self,
        thread_id: str,
        system: str,
        on_text: Callable[[str], None] | None,
        on_event: Callable[[str], None] | None = None,
    ) -> None:
        """Execute one assistant turn over the thread's stored history plus the
        per-request system prompt (built by the caller — see system_prompt),
        streaming text deltas to on_text (None-safe) and persisting every assistant
        turn and tool_result turn it produces. on_event (None-safe) receives a
        short human-readable line each time a tool runs or a web search starts, for
        a live activity feed. The kicking user message must already be appended to
        the thread. Returns when the model reaches end_turn (or another terminal
        stop), or when the iteration cap is hit."""
        stored = chat_store.thread_messages(self.con, thread_id)
        # m.content is the raw content-block JSON array; parse it so the wire encoder
        # serializes it back as an array rather than re-encoding it as a string.
        msgs = [Message(role=m.role, content=json.loads(m.content)) for m in stored]

        for _ in range(self._max_iters()):
            content, stop = self._stream_turn(system, msgs, on_text, on_event)
            # Persist + append the assistant turn (merged across any pause_turn
            # resumes) so it replays verbatim on the next turn.
            chat_store.append_message(self.con, thread_id, "assistant", json.dumps(content), "")
            msgs.append(Message(role="assistant", content=content))

            if stop != "tool_use":
                return  # end_turn / max_tokens / stop_sequence / refusal — done

            results = self._run_tools(content, on_event)
            if len(results) == 0:
                # tool_use stop with no custom tool calls would deadlock the loop (a
                # re-send with no tool_result 400s). Bail cleanly.
                self._logf("chat: tool_use stop with no executable tools — ending turn")
                return
            user_content = json.dumps(results)
            chat_store.append_message(self.con, thread_id, "user", user_content, "")
            msgs.append(Message(role="user", content=results))
        self._logf("chat: hit iteration cap (%d) — ending turn", self._max_iters())

    def _stream_turn(self, system: str, msgs: list[Message], on_text, on_event=None):
        """Stream one complete assistant turn, resuming the hosted web_search server
        tool's pause_turn internally so the result is a single merged content array.
        Returns (merged content-block list, final stop_reason)."""
        blocks: list = []
        turn = list(msgs)

        cont = 0
        while True:
            resp = self.client.stream(
                Request(
                    model=self._model(),
                    system=system,
                    cached=True,
                    max_tokens=_DEFAULT_MAX_TOKENS,
                    messages=turn,
                    tools=self.tool_wire,
                    thinking=ADAPTIVE_THINKING,
                ),
                on_text,
            )
            for b in resp.content:
                blocks.append(b.raw)
                # Surface each hosted web_search call as live activity. The API runs
                # the search server-side; we only see the server_tool_use block.
                if (
                    on_event is not None
                    and isinstance(b.raw, dict)
                    and b.raw.get("type") == "server_tool_use"
                    and b.raw.get("name") == "web_search"
                ):
                    q = (b.raw.get("input") or {}).get("query") or ""
                    on_event("searching the web" + (f": {q}" if q else ""))
            if resp.stop_reason != "pause_turn":
                return blocks, resp.stop_reason
            if cont >= _DEFAULT_MAX_CONTINUATIONS:
                self._logf(
                    "chat: web_search still paused after %d continuations — using partial output",
                    cont,
                )
                return blocks, "end_turn"  # treat as done so the loop terminates
            # Resume: replay the partial assistant turn and re-send (no user message).
            turn = turn + [Message(role="assistant", content=resp.raw_content())]
            cont += 1

    def _run_tools(self, content: list, on_event=None) -> list[dict]:
        """Execute every custom tool_use block in the assistant content and return
        the matching tool_result blocks (one per tool_use). Server-tool blocks
        (server_tool_use / web_search_tool_result) are the API's to resolve and are
        skipped here."""
        results: list[dict] = []
        for b in content:
            if not isinstance(b, dict) or b.get("type") != "tool_use":
                continue
            name = b.get("name", "")
            tool_use_id = b.get("id", "")
            impl = self.tools.get(name)
            if impl is None:
                results.append(tool_result(tool_use_id, f'unknown tool "{name}"', True))
                continue
            if on_event is not None:
                on_event(_TOOL_VERB.get(name, f"using {name}"))
            self._logf("chat: tool %s", name)
            try:
                out = impl(b.get("input") or {})
            except Exception as err:  # noqa: BLE001 - any tool failure is fed back as an is_error result
                results.append(tool_result(tool_use_id, "error: " + str(err), True))
                continue
            results.append(tool_result(tool_use_id, out, False))
        return results


def new(con: sqlite3.Connection, client: Client) -> Engine:
    """Build an engine with the nine-tool registry wired to con + client. The
    client must carry an API key for the chat (and the LLM capture path) to work."""
    return Engine(con, client)
