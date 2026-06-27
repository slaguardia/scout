"""A small, SDK-free Anthropic Messages API client.

We don't pull the official SDK because our usage is one endpoint, two request
shapes, and we want a lean dependency footprint. Transport is httpx (the project
standard); the streaming SSE machinery lives in stream.py.
"""

from __future__ import annotations

import json
import os
import random
import threading
import time
from collections.abc import Callable
from dataclasses import dataclass, field, replace
from typing import Any

import httpx

from .stream import parse_sse

DEFAULT_ENDPOINT = "https://api.anthropic.com/v1/messages"
API_VERSION = "2023-06-01"
# DefaultModel is the default verdict model. Cheap, fast, good enough.
DEFAULT_MODEL = "claude-haiku-4-5"

# Per-call deadlines (seconds). Plain calls get a tight bound; hosted web_search
# requests run a server-side search loop that can sit well past a normal timeout
# before the first byte, so they get much more room.
DEFAULT_CALL_TIMEOUT = 90.0
TOOL_CALL_TIMEOUT = 5 * 60.0

# maxRetries bounds transient-failure retries per Send/Stream call.
MAX_RETRIES = 5

# webSearchToolType is the GA (non-beta) hosted web_search tool version.
_WEB_SEARCH_TOOL_TYPE = "web_search_20260209"

# AdaptiveThinking is the `thinking` config the chat engine pins: the model
# decides its own thinking depth and interleaves thinking between tool calls.
ADAPTIVE_THINKING = {"type": "adaptive"}


@dataclass
class Message:
    """A single turn. content is a plain string for normal turns; pass a
    Response.raw_content() to replay a prior assistant turn verbatim (the
    pause_turn continuation)."""

    role: str
    content: Any


@dataclass
class ToolDef:
    """A custom (client-executed) tool definition. The model emits a tool_use
    block naming the tool; the caller runs the handler and feeds back a
    tool_result. The request carries only the schema, never a handler."""

    name: str
    description: str
    input_schema: dict

    def to_wire(self) -> dict:
        return {
            "name": self.name,
            "description": self.description,
            "input_schema": self.input_schema,
        }


@dataclass
class WebSearchTool:
    """The hosted web_search server tool. The API runs the searches server-side
    and returns the results inline. max_uses caps the number of searches the
    model may run in one turn (0 omits the cap)."""

    type: str
    name: str
    max_uses: int = 0

    def to_wire(self) -> dict:
        out: dict = {"type": self.type, "name": self.name}
        if self.max_uses > 0:
            out["max_uses"] = self.max_uses
        return out


def new_web_search_tool(max_uses: int) -> WebSearchTool:
    """Build the hosted web_search server tool with a use cap; max_uses <= 0
    omits the cap (API default)."""
    return WebSearchTool(type=_WEB_SEARCH_TOOL_TYPE, name="web_search", max_uses=max(max_uses, 0))


@dataclass
class Request:
    """Mirrors the Anthropic /v1/messages request body. The fields are the
    caller's intent; build_wire maps them onto the on-the-wire shape.

    When cached is True, system is sent as a single ephemeral cache block so
    identical system prompts across calls within ~5 minutes hit the prompt cache.
    """

    model: str = ""
    system: str = ""
    max_tokens: int = 0
    messages: list[Message] = field(default_factory=list)
    cached: bool = False
    temperature: float | None = None
    tools: list[Any] | None = None
    thinking: Any | None = None
    timeout: float = 0.0  # per-call deadline override (seconds); 0 uses the default


@dataclass
class Usage:
    input_tokens: int = 0
    output_tokens: int = 0
    cache_creation_input_tokens: int = 0
    cache_read_input_tokens: int = 0


@dataclass
class ContentBlock:
    """One response content block. type/text cover the text blocks scout reads;
    raw preserves the block verbatim (server_tool_use, web_search_tool_result,
    thinking, tool_use, ...) so a pause_turn continuation can replay the
    assistant turn."""

    type: str = ""
    text: str = ""
    raw: dict = field(default_factory=dict)


@dataclass
class Response:
    """The shape we care about from the API."""

    id: str = ""
    model: str = ""
    content: list[ContentBlock] = field(default_factory=list)
    stop_reason: str = ""
    usage: Usage = field(default_factory=Usage)

    def text(self) -> str:
        """The concatenated text content, skipping every non-text block."""
        return "".join(c.text for c in self.content if c.type == "text")

    def raw_content(self) -> list[dict]:
        """The response's content blocks verbatim — for replaying the assistant
        turn in a continuation request after stop_reason 'pause_turn'."""
        return [c.raw for c in self.content]


def _tool_to_wire(t: Any) -> Any:
    """A tool element is either a dict (already wire-shaped) or a typed tool with
    a to_wire()."""
    if hasattr(t, "to_wire"):
        return t.to_wire()
    return t


def build_wire(req: Request, stream: bool) -> dict:
    """Map a Request onto the on-the-wire JSON shape, shared by send and stream.
    Fields left empty/at their default are omitted from the request body."""
    wire: dict = {
        "model": req.model,
        "max_tokens": req.max_tokens,
        "messages": [{"role": m.role, "content": m.content} for m in req.messages],
    }
    if req.temperature is not None:
        wire["temperature"] = req.temperature
    if req.tools:
        wire["tools"] = [_tool_to_wire(t) for t in req.tools]
    if req.thinking is not None:
        wire["thinking"] = req.thinking
    if stream:
        wire["stream"] = True
    if req.system != "":
        if req.cached:
            wire["system"] = [
                {
                    "type": "text",
                    "text": req.system,
                    "cache_control": {"type": "ephemeral"},
                }
            ]
        else:
            wire["system"] = req.system
    return wire


def _parse_response(raw: bytes) -> Response:
    data = json.loads(raw)
    out = Response(
        id=data.get("id", ""), model=data.get("model", ""), stop_reason=data.get("stop_reason", "")
    )
    for b in data.get("content") or []:
        out.content.append(ContentBlock(type=b.get("type", ""), text=b.get("text", ""), raw=b))
    u = data.get("usage") or {}
    out.usage = Usage(
        input_tokens=u.get("input_tokens", 0),
        output_tokens=u.get("output_tokens", 0),
        cache_creation_input_tokens=u.get("cache_creation_input_tokens", 0),
        cache_read_input_tokens=u.get("cache_read_input_tokens", 0),
    )
    return out


def retryable_status(code: int) -> bool:
    """Whether an HTTP status is worth retrying: rate limit, overload, and the
    transient 5xx family."""
    return code in (429, 500, 502, 503, 504, 529)


def backoff_delay(attempt: int, retry_after: float) -> float:
    """How long to wait before the given retry attempt (seconds). A
    server-provided retry-after wins; otherwise exponential (0.5s, 1s, 2s, …)
    capped at 8s with ±10% jitter so a worker pool doesn't retry in lockstep."""
    if retry_after > 0:
        return retry_after
    d = (1 << (attempt - 1)) * 0.5
    if d > 8.0:
        d = 8.0
    jitter = random.uniform(0, d / 5) - d / 10
    return d + jitter


def parse_retry_after(h: str) -> float:
    """Read an integer-seconds retry-after header; returns 0 when absent or
    unparseable."""
    if not h:
        return 0.0
    try:
        secs = int(h.strip())
    except ValueError:
        return 0.0
    return float(secs) if secs >= 0 else 0.0


class Client:
    """Talks to the Anthropic Messages API.

    api_key is a construction-time seed. At runtime — when the dashboard can
    re-key the one shared client live while send/stream are in flight — it is
    read and written only through has_key()/set_api_key() under a lock, so a UI
    key change races no one.
    """

    def __init__(
        self, api_key: str = "", endpoint: str = DEFAULT_ENDPOINT, http: httpx.Client | None = None
    ):
        self._lock = threading.RLock()
        self.api_key = api_key
        self.endpoint = endpoint or DEFAULT_ENDPOINT
        # Generous backstop only; the real per-call deadline is applied per request.
        self.http = http if http is not None else httpx.Client(timeout=10 * 60.0)

    def set_api_key(self, k: str) -> None:
        """Swap the key the next send/stream will use. Safe to call while requests
        are in flight."""
        with self._lock:
            self.api_key = k

    def _key(self) -> str:
        with self._lock:
            return self.api_key

    def has_key(self) -> bool:
        """Whether a key is currently set."""
        return self._key() != ""

    def _headers(self, api_key: str, accept: str | None = None) -> dict:
        h = {
            "Content-Type": "application/json",
            "x-api-key": api_key,
            "anthropic-version": API_VERSION,
        }
        if accept:
            h["Accept"] = accept
        return h

    def send(self, req: Request) -> Response:
        """Post a single Messages API request, retrying transient failures."""
        api_key = self._key()
        if api_key == "":
            raise AnthropicError("anthropic: no API key (set ANTHROPIC_API_KEY)")
        # Apply defaults on a copy — don't mutate the caller's Request.
        req = replace(req, max_tokens=req.max_tokens or 512, model=req.model or DEFAULT_MODEL)

        body = json.dumps(build_wire(req, False)).encode()

        call_timeout = DEFAULT_CALL_TIMEOUT
        if req.tools:
            call_timeout = TOOL_CALL_TIMEOUT  # hosted web_search runs server-side — give it room
        if req.timeout > 0:
            call_timeout = req.timeout

        last_err: Exception | None = None
        retry_after = 0.0
        for attempt in range(MAX_RETRIES + 1):
            if attempt > 0:
                time.sleep(backoff_delay(attempt, retry_after))
                retry_after = 0.0
            try:
                resp = self.http.post(
                    self.endpoint,
                    content=body,
                    headers=self._headers(api_key),
                    timeout=call_timeout,
                )
            except httpx.RequestError as e:
                last_err = AnthropicError(f"anthropic POST: {e}")  # transient — retry
                continue

            raw = resp.content
            if resp.status_code // 100 == 2:
                try:
                    return _parse_response(raw)
                except (ValueError, json.JSONDecodeError) as e:
                    raise AnthropicError(
                        f"anthropic decode: {e} (body={raw.decode(errors='replace')})"
                    )

            last_err = AnthropicError(
                f"anthropic HTTP {resp.status_code}: {raw.decode(errors='replace')}"
            )
            if not retryable_status(resp.status_code):
                raise last_err
            retry_after = parse_retry_after(resp.headers.get("retry-after", ""))
        raise AnthropicError(f"anthropic: giving up after {MAX_RETRIES} retries: {last_err}")

    def stream(self, req: Request, on_text: Callable[[str], None] | None = None) -> Response:
        """Run a streamed /v1/messages request and return the fully-assembled
        Response, calling on_text with each text delta as it arrives (None skips).

        Retries cover only establishing the stream (a transient non-2xx before the
        first byte); once bytes flow, a mid-stream failure raises.
        """
        api_key = self._key()
        if api_key == "":
            raise AnthropicError("anthropic: no API key (set ANTHROPIC_API_KEY)")
        # Apply defaults on a copy — don't mutate the caller's Request.
        req = replace(req, max_tokens=req.max_tokens or 1024, model=req.model or DEFAULT_MODEL)

        body = json.dumps(build_wire(req, True)).encode()
        headers = self._headers(api_key, accept="text/event-stream")

        last_err: Exception | None = None
        retry_after = 0.0
        for attempt in range(MAX_RETRIES + 1):
            if attempt > 0:
                time.sleep(backoff_delay(attempt, retry_after))
                retry_after = 0.0
            try:
                with self.http.stream("POST", self.endpoint, content=body, headers=headers) as resp:
                    if resp.status_code // 100 != 2:
                        raw = resp.read()
                        last_err = AnthropicError(
                            f"anthropic HTTP {resp.status_code}: {raw.decode(errors='replace')}"
                        )
                        if not retryable_status(resp.status_code):
                            raise last_err
                        retry_after = parse_retry_after(resp.headers.get("retry-after", ""))
                        continue
                    # 2xx — stream the body. No retry past this point (partial output).
                    return parse_sse(_iter_lines(resp), on_text)
            except httpx.RequestError as e:
                last_err = AnthropicError(f"anthropic POST: {e}")  # transient network — retry
                continue
        raise AnthropicError(f"anthropic: giving up after {MAX_RETRIES} retries: {last_err}")


def _iter_lines(resp: httpx.Response):
    """Yield text lines from a streaming response, splitting on '\\n' and dropping
    a trailing '\\r', preserving the empty strings that mark SSE event
    boundaries."""
    buf = ""
    for chunk in resp.iter_text():
        buf += chunk
        while True:
            nl = buf.find("\n")
            if nl < 0:
                break
            line = buf[:nl]
            buf = buf[nl + 1 :]
            if line.endswith("\r"):
                line = line[:-1]
            yield line
    if buf:
        if buf.endswith("\r"):
            buf = buf[:-1]
        yield buf


class AnthropicError(Exception):
    """Any client/transport/API failure from the Anthropic client."""


def new(api_key: str = "") -> Client:
    """Build a client with the key from ANTHROPIC_API_KEY when not given."""
    if api_key == "":
        api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    return Client(api_key=api_key, endpoint=DEFAULT_ENDPOINT)


def verify(api_key: str) -> None:
    """Check an API key with one cheap auth-only call (GET /v1/models?limit=1).
    Returns None if accepted; raises if rejected (401) or unreachable. Spends no
    tokens — used by the dashboard connect flow to validate a key before storing it."""
    resp = httpx.get(
        "https://api.anthropic.com/v1/models?limit=1",
        headers={"x-api-key": api_key, "anthropic-version": API_VERSION},
        timeout=30.0,
    )
    if resp.status_code == 401:
        raise AnthropicError("anthropic rejected the key")
    if resp.status_code >= 400:
        raise AnthropicError(f"anthropic verify failed: {resp.status_code}")
