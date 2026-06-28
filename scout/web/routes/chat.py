"""The tool-using chat: open-or-create a thread, kick an assistant turn, and stream
its text deltas as SSE.

A POST /message registers one in-flight turn
per thread in a broadcast hub and runs it in a background thread (with its OWN
connection); GET /stream subscribes to that turn and replays the backlog so a
slightly-late stream still sees everything from the start. SSE framing: text
deltas carry real newlines, split across multiple `data:` lines (the browser's
EventSource rejoins them with "\n").
"""

from __future__ import annotations

import json
import queue
import threading
from datetime import datetime

from fastapi import APIRouter, Depends, Request
from starlette.responses import Response, StreamingResponse

from scout import chat as chat_pkg
from scout.store import chat as chat_store
from scout.store import detail as detail_store
from scout.store import postings as postings_store
from scout.store.db import connect

from ..deps import AppState, get_db, get_state
from ..responses import json_error, json_response
from .core import _s, decode_json, raw_body

router = APIRouter()


# --- the per-thread broadcast hub --------------------------------------------


class ChatTurn:
    """One streaming turn's broadcast state: the accumulated event backlog plus live
    subscriber queues, closed (None sentinel) when the turn finishes. Each backlog
    item is a (kind, data) pair — "delta" for streamed text, "activity" for a live
    tool/web-search status line."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._backlog: list[tuple[str, str]] = []
        self._subs: list[queue.Queue] = []
        self._done = False
        self._status = ""  # "done" | "error: ..."

    def _broadcast(self, item: tuple[str, str]) -> None:
        with self._lock:
            self._backlog.append(item)
            subs = list(self._subs)
        for ch in subs:
            try:
                ch.put_nowait(item)
            except queue.Full:  # a slow subscriber must not stall the engine
                pass

    def emit(self, s: str) -> None:
        """Stream a text fragment (SSE `delta`)."""
        if s == "":
            return
        self._broadcast(("delta", s))

    def emit_activity(self, s: str) -> None:
        """Stream a live tool/web-search status line (SSE `activity`)."""
        if s == "":
            return
        self._broadcast(("activity", s))

    def finish(self, status: str) -> None:
        with self._lock:
            if self._done:
                return
            self._done = True
            self._status = status
            subs = self._subs
            self._subs = []
        for ch in subs:
            ch.put_nowait(None)

    def is_done(self) -> bool:
        with self._lock:
            return self._done

    def status_safe(self) -> str:
        with self._lock:
            return self._status or "done"

    def subscribe(self):
        """(backlog, ch, done, status): a snapshot of deltas so far, a queue of
        future deltas (None sentinel on finish), and the terminal state. When already
        done, ch is None."""
        with self._lock:
            backlog = list(self._backlog)
            if self._done:
                return backlog, None, True, self._status
            ch: queue.Queue = queue.Queue(maxsize=64)
            self._subs.append(ch)
            return backlog, ch, False, ""


class ChatHub:
    """Tracks the one in-flight turn per thread."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._active: dict[str, ChatTurn] = {}

    def get(self, thread_id: str) -> ChatTurn | None:
        with self._lock:
            return self._active.get(thread_id)

    def start(self, thread_id: str) -> tuple[ChatTurn, bool]:
        """Register a fresh turn, replacing any prior (finished) one. Returns
        (turn, False) when a turn is already running for the thread."""
        with self._lock:
            t = self._active.get(thread_id)
            if t is not None and not t.is_done():
                return t, False
            t = ChatTurn()
            self._active[thread_id] = t
            return t, True


_hub_lock = threading.Lock()


def _hub(request: Request) -> ChatHub:
    """The process-lifetime hub, lazily attached to the app (shared across the POST
    that registers a turn and the GET that subscribes)."""
    app = request.app
    h = getattr(app.state, "chat_hub", None)
    if h is None:
        with _hub_lock:
            h = getattr(app.state, "chat_hub", None)
            if h is None:
                h = ChatHub()
                app.state.chat_hub = h
    return h


# --- GET /api/chat/threads ---------------------------------------------------


@router.get("/api/chat/threads")
def chat_threads(request: Request, con=Depends(get_db)) -> Response:
    """Open (or create) the thread for a (scope, scope_id) and return it with its
    message history. An invalid scope / a company scope with no scope_id -> 400."""
    scope = request.query_params.get("scope") or chat_store.CHAT_SCOPE_GLOBAL
    scope_id = request.query_params.get("scope_id", "")
    th = chat_store.open_or_create_thread(con, scope, scope_id)  # ValueError -> 400
    msgs = chat_store.thread_messages(con, th.id)
    # content is stored as a JSON content-block array (always json.dumps'd on
    # write); parse it back so the client receives a real array, not a string.
    out = [
        {"id": m.id, "role": m.role, "content": json.loads(m.content), "created_at": m.created_at}
        for m in msgs
    ]
    return json_response({"thread": th, "messages": out})


# --- POST /api/chat/{thread}/message -----------------------------------------


@router.post("/api/chat/{thread_id}/message")
def chat_message(
    thread_id: str,
    request: Request,
    raw: bytes = Depends(raw_body),
    con=Depends(get_db),
    state: AppState = Depends(get_state),
) -> Response:
    """Append the user's message and kick an assistant turn (run in the background,
    consumed via /stream). 202 once started; 409 if a turn is already running; 412
    without a chat engine."""
    if state.chat is None:
        return json_error("chat needs ANTHROPIC_API_KEY in the server environment", 412)
    text = _s(decode_json(raw), "text").strip()
    if text == "":
        return json_error("text is required", 400)
    th = chat_store.get_thread(con, thread_id)
    if th is None:
        return json_error("not found", 404)

    turn, fresh = _hub(request).start(thread_id)
    if not fresh:
        return json_error("a turn is already running for this thread", 409)

    # Persist the user message (a content-block array; the text seeds the title).
    user_content = json.dumps([{"type": "text", "text": text}])
    try:
        chat_store.append_message(con, thread_id, "user", user_content, text)
    except Exception as e:  # noqa: BLE001
        turn.finish("error: " + str(e))
        return json_error(str(e), 500)

    # Per-request system prompt: base + scope framing + seeded entity context +
    # today's date (the context is regenerated each turn, never persisted).
    context_block = _build_chat_context(con, th.scope, th.scope_id)
    system = chat_pkg.system_prompt(th.scope, context_block, datetime.now())

    db_path = state.config.db_path
    client = state.chat.client
    model = state.chat.model

    def runner() -> None:
        worker_con = connect(db_path)
        try:
            engine = chat_pkg.Engine(con=worker_con, client=client)
            engine.model = model
            engine.run(thread_id, system, turn.emit, turn.emit_activity)
            turn.finish("done")
        except Exception as e:  # noqa: BLE001
            turn.finish("error: " + str(e))
        finally:
            worker_con.close()

    threading.Thread(target=runner, daemon=True).start()
    return json_response({"thread_id": thread_id, "started": True}, 202)


# --- GET /api/chat/{thread}/stream (SSE) -------------------------------------


def _chat_sse(event: str, data: str) -> bytes:
    """One SSE event, preserving newlines across multiple data: lines."""
    out = [f"event: {event}\n"]
    for line in data.split("\n"):
        out.append(f"data: {line}\n")
    out.append("\n")
    return "".join(out).encode()


@router.get("/api/chat/{thread_id}/stream")
def chat_stream(thread_id: str, request: Request) -> Response:
    """Stream the active turn as SSE: a `delta` event per text fragment, an
    `activity` event per tool/web-search status line, then a final `end` event
    carrying the status. No turn running -> `end: idle`."""
    turn = _hub(request).get(thread_id)

    def gen():
        if turn is None:
            yield _chat_sse("end", "idle")
            return
        backlog, ch, done, status = turn.subscribe()
        for kind, data in backlog:
            yield _chat_sse(kind, data)
        if done:
            yield _chat_sse("end", status or "done")
            return
        while True:
            item = ch.get()
            if item is None:
                yield _chat_sse("end", turn.status_safe())
                return
            kind, data = item
            yield _chat_sse(kind, data)

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )


# --- seeded entity context ---------------------------------------------------


def _or_dash(s: str) -> str:
    return s if s != "" else "—"


def _truncate(s: str, n: int) -> str:
    if len(s) <= n:
        return s
    return s[:n] + "…"


def _build_chat_context(con, scope: str, scope_id: str) -> str:
    if scope == chat_store.CHAT_SCOPE_COMPANY:
        return _company_context(con, scope_id)
    if scope == chat_store.CHAT_SCOPE_POSTING:
        return _posting_context(con, scope_id)
    return ""


def _company_context(con, company_id: str) -> str:
    d = detail_store.get_company_detail(con, company_id)
    if d is None:
        return ""
    b: list[str] = []
    b.append(f"You are chatting about this company (company_id: {d.company_id}).\n")
    b.append(f"Name: {d.name}\n")
    if d.domain != "":
        b.append(f"Domain: {d.domain}\n")
    if d.location != "" or d.vertical != "" or d.headcount > 0 or d.funding_stage != "":
        b.append(
            f"Location: {d.location} | Vertical: {d.vertical} | Headcount: {d.headcount} | Stage: {d.funding_stage}\n"
        )
    if d.has_verdict:
        b.append(f"Verdict: {d.verdict} — {d.reason}\n")
    if d.website_summary != "":
        b.append(f"Website summary: {d.website_summary}\n")
    if d.notes != "":
        b.append(f"Notes: {d.notes}\n")
    if len(d.postings) > 0:
        b.append("Postings:\n")
        for p in d.postings:
            b.append(
                f"  - {_or_dash(p.title)} (posting_id: {p.id}) stage:{_or_dash(p.application_status)}\n"
            )
    return "".join(b)


def _posting_context(con, posting_id: str) -> str:
    p = postings_store.get_posting(con, posting_id)
    if p is None:
        return ""
    name, _ = detail_store.get_company_name(con, p.company_id)
    b: list[str] = []
    b.append(
        f"You are chatting about this job posting (posting_id: {p.id}, company_id: {p.company_id}).\n"
    )
    b.append(f"Role: {_or_dash(p.title)} at {_or_dash(name)}\n")
    if p.location != "" or p.workplace_type != "" or p.employment_type != "":
        b.append(
            f"Location: {p.location} | Workplace: {p.workplace_type} | Type: {p.employment_type}\n"
        )
    if p.comp_range != "":
        b.append(f"Comp: {p.comp_range}\n")
    b.append(f"Application: stage:{_or_dash(p.application_status)} outreach:{p.outreach_count}\n")
    if p.url != "":
        b.append(f"URL: {p.url}\n")
    if p.description != "":
        b.append(f"Description:\n{_truncate(p.description, 4000)}\n")
    return "".join(b)
