"""Anthropic Messages API client — a thin façade over the official SDK.

scout used to hand-roll the transport: httpx POSTs, exponential-backoff retries,
and an SSE stream parser (the old stream.py). All of that is gone. The official
`anthropic` SDK owns retries, streaming, and tracking the wire format, so this
module is now just:

  * the small dataclass surface (Request / Response / Message / ToolDef / …) the
    ~20 call sites already speak, and
  * a Client whose API key can be hot-swapped at runtime (the dashboard re-keys
    the one shared client live, so send/stream read the key under a lock).

Keeping the façade means the call sites and the live re-key flow don't change;
the bug-prone transport code is the SDK's problem now.
"""

from __future__ import annotations

import os
import threading
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

import anthropic as _sdk

# DEFAULT_MODEL is the default verdict model. Cheap, fast, good enough.
DEFAULT_MODEL = "claude-haiku-4-5"

# Per-call deadlines (seconds). Plain calls get a tight bound; hosted web_search
# requests run a server-side search loop that can sit well past a normal timeout
# before the first byte, so they get much more room.
DEFAULT_CALL_TIMEOUT = 90.0
TOOL_CALL_TIMEOUT = 5 * 60.0

# How many transient-failure retries the SDK performs per request.
MAX_RETRIES = 5

# webSearchToolType is the GA (non-beta) hosted web_search tool version.
_WEB_SEARCH_TOOL_TYPE = "web_search_20260209"

# AdaptiveThinking is the `thinking` config the chat engine pins: the model
# decides its own thinking depth and interleaves thinking between tool calls.
ADAPTIVE_THINKING = {"type": "adaptive"}


class AnthropicError(Exception):
    """Any client/transport/API failure from the Anthropic client."""


class StreamError(AnthropicError):
    """A streaming failure. Retained as a distinct type for call sites that catch
    it by name; it is now just a specialization of AnthropicError."""


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
    """The caller's intent for one /v1/messages request. build_kwargs maps it onto
    the SDK's keyword arguments.

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
    raw preserves the block as wire-shaped JSON (server_tool_use,
    web_search_tool_result, thinking, tool_use, …) so a pause_turn continuation
    can replay the assistant turn."""

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
        """The response's content blocks as wire JSON — for replaying the assistant
        turn in a continuation request after stop_reason 'pause_turn'."""
        return [c.raw for c in self.content]


def _tool_to_wire(t: Any) -> Any:
    """A tool element is either a dict (already wire-shaped) or a typed tool with
    a to_wire()."""
    if hasattr(t, "to_wire"):
        return t.to_wire()
    return t


def build_kwargs(req: Request) -> dict:
    """Map a Request onto the SDK's messages.create/stream keyword arguments.
    Fields left empty/at their default are omitted so the API applies its own."""
    kw: dict = {
        "model": req.model or DEFAULT_MODEL,
        "messages": [{"role": m.role, "content": m.content} for m in req.messages],
    }
    if req.system != "":
        if req.cached:
            kw["system"] = [
                {
                    "type": "text",
                    "text": req.system,
                    "cache_control": {"type": "ephemeral"},
                }
            ]
        else:
            kw["system"] = req.system
    if req.temperature is not None:
        kw["temperature"] = req.temperature
    if req.tools:
        kw["tools"] = [_tool_to_wire(t) for t in req.tools]
    if req.thinking is not None:
        kw["thinking"] = req.thinking
    return kw


def _to_response(msg: Any) -> Response:
    """Map an SDK Message onto scout's Response. Each content block is preserved as
    wire-shaped JSON (exclude_none drops SDK-only fields like parsed_output so a
    pause_turn replay sends nothing the API would reject)."""
    out = Response(
        id=msg.id or "",
        model=msg.model or "",
        stop_reason=msg.stop_reason or "",
    )
    for b in msg.content:
        raw = b.model_dump(mode="json", exclude_none=True)
        cb = ContentBlock(type=raw.get("type", ""), raw=raw)
        if cb.type == "text":
            cb.text = getattr(b, "text", "") or ""
        out.content.append(cb)
    u = msg.usage
    out.usage = Usage(
        input_tokens=getattr(u, "input_tokens", 0) or 0,
        output_tokens=getattr(u, "output_tokens", 0) or 0,
        cache_creation_input_tokens=getattr(u, "cache_creation_input_tokens", 0) or 0,
        cache_read_input_tokens=getattr(u, "cache_read_input_tokens", 0) or 0,
    )
    return out


class Client:
    """Talks to the Anthropic Messages API via the official SDK.

    api_key is a construction-time seed. At runtime — when the dashboard re-keys
    the one shared client live while send/stream are in flight — it is read and
    written only through has_key()/set_api_key() under a lock, so a UI key change
    races no one. endpoint overrides the SDK base URL (used by tests to point at a
    local stub); empty uses the SDK default (api.anthropic.com).
    """

    def __init__(self, api_key: str = "", endpoint: str = ""):
        self._lock = threading.RLock()
        self._api_key = api_key
        # One SDK client; its api key is hot-swapped under the lock on re-key. The
        # SDK owns the httpx transport, retries, and streaming.
        self._sdk = _sdk.Anthropic(
            api_key=api_key or "",
            base_url=endpoint or None,
            max_retries=MAX_RETRIES,
        )

    def set_api_key(self, k: str) -> None:
        """Swap the key the next send/stream will use. Safe to call while requests
        are in flight."""
        with self._lock:
            self._api_key = k
            self._sdk.api_key = k

    def _key(self) -> str:
        with self._lock:
            return self._api_key

    def has_key(self) -> bool:
        """Whether a key is currently set."""
        return self._key() != ""

    def _bound(self, req: Request) -> Any:
        """The SDK client to use for this request, with the per-call timeout
        applied. Raises if no key is set."""
        with self._lock:
            if self._api_key == "":
                raise AnthropicError("anthropic: no API key (set ANTHROPIC_API_KEY)")
            sdk = self._sdk
        timeout = DEFAULT_CALL_TIMEOUT
        if req.tools:
            timeout = TOOL_CALL_TIMEOUT  # hosted web_search runs server-side — give it room
        if req.timeout > 0:
            timeout = req.timeout
        return sdk.with_options(timeout=timeout)

    def send(self, req: Request) -> Response:
        """Post a single Messages API request; the SDK retries transient failures."""
        client = self._bound(req)
        kw = build_kwargs(req)
        kw["max_tokens"] = req.max_tokens or 512
        try:
            msg = client.messages.create(**kw)
        except _sdk.APIError as e:
            raise AnthropicError(f"anthropic: {e}") from e
        return _to_response(msg)

    def stream(self, req: Request, on_text: Callable[[str], None] | None = None) -> Response:
        """Run a streamed /v1/messages request and return the fully-assembled
        Response, calling on_text with each text delta as it arrives (None skips)."""
        client = self._bound(req)
        kw = build_kwargs(req)
        kw["max_tokens"] = req.max_tokens or 1024
        try:
            with client.messages.stream(**kw) as stream:
                if on_text is not None:
                    for delta in stream.text_stream:
                        if delta:
                            on_text(delta)
                msg = stream.get_final_message()
        except _sdk.APIError as e:
            raise StreamError(f"anthropic stream: {e}") from e
        return _to_response(msg)


def new(api_key: str = "") -> Client:
    """Build a client with the key from ANTHROPIC_API_KEY when not given."""
    if api_key == "":
        api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    return Client(api_key=api_key)


def verify(api_key: str) -> None:
    """Check an API key with one cheap auth-only call (GET /v1/models?limit=1).
    Returns None if accepted; raises if rejected (401) or unreachable. Spends no
    tokens — used by the dashboard connect flow to validate a key before storing it."""
    try:
        _sdk.Anthropic(api_key=api_key).models.list(limit=1)
    except _sdk.AuthenticationError:
        raise AnthropicError("anthropic rejected the key")
    except _sdk.APIError as e:
        raise AnthropicError(f"anthropic verify failed: {e}") from e
