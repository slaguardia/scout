"""SSE stream parsing for the Messages API.

The streamed blocks are RECONSTRUCTED, not handed over whole — a tool_use block's
input arrives as input_json_delta fragments and a thinking block as
thinking_delta + signature_delta, so we accumulate each block and re-marshal it
at content_block_stop. StopReason / Usage come from message_delta.

This module holds the protocol machinery; Client.stream (in client.py) owns the
HTTP + retry scaffolding and feeds the decoded line iterator here.
"""

from __future__ import annotations

import json
from collections.abc import Callable, Iterable
from typing import TYPE_CHECKING

if TYPE_CHECKING:  # avoid a circular import at runtime — only for type hints
    from .client import ContentBlock, Response


class _BlockAcc:
    """Accumulates one content block as its deltas arrive. base is the
    content_block from content_block_start (carries type/id/name and any
    fully-formed fields); the typed buffers overlay the streamed fields at
    finalize()."""

    __slots__ = ("base", "typ", "text", "thinking", "sig", "input_json", "has_input")

    def __init__(self) -> None:
        self.base: dict | None = None
        self.typ: str = ""
        self.text: list[str] = []
        self.thinking: list[str] = []
        self.sig: str = ""
        self.input_json: list[str] = []
        self.has_input: bool = False

    def finalize(self) -> ContentBlock:
        from .client import ContentBlock

        m: dict = dict(self.base) if self.base is not None else {}
        text = "".join(self.text)
        if text:
            m["text"] = text
        thinking = "".join(self.thinking)
        if thinking:
            m["thinking"] = thinking
        if self.sig:
            m["signature"] = self.sig
        if self.has_input:
            # The accumulated partial_json is the block's input object. An empty
            # stream means no arguments — leave the base's {} input untouched.
            js = "".join(self.input_json)
            if js.strip():
                try:
                    m["input"] = json.loads(js)
                except json.JSONDecodeError as e:
                    raise StreamError(f"tool_use input JSON: {e} (raw={js!r})")
        cb = ContentBlock(type=self.typ, raw=m)
        if self.typ == "text":
            cb.text = text
        return cb


class StreamError(Exception):
    """A malformed or error SSE stream."""


def parse_sse(lines: Iterable[str], on_text: Callable[[str], None] | None) -> Response:
    """Read the event stream, reconstruct the content blocks, and return the
    assembled Response. on_text (None-safe) is invoked with each text delta for
    live forwarding to the UI."""
    from .client import Response

    out = Response()
    blocks: dict[int, _BlockAcc] = {}
    data_buf: list[str] = []
    saw_stop = False

    def flush() -> None:
        nonlocal saw_stop
        if not data_buf:
            return
        data = "".join(data_buf)
        data_buf.clear()
        if data == "[DONE]":  # not part of the Anthropic protocol, but harmless to ignore
            return
        try:
            ev = json.loads(data)
        except json.JSONDecodeError as e:
            raise StreamError(f"anthropic stream: bad event JSON: {e} (raw={data!r})")
        typ = ev.get("type")
        if typ == "message_start":
            msg = ev.get("message") or {}
            out.id = msg.get("id", "")
            out.model = msg.get("model", "")
            u = msg.get("usage") or {}
            out.usage.input_tokens = u.get("input_tokens", 0)
            out.usage.cache_creation_input_tokens = u.get("cache_creation_input_tokens", 0)
            out.usage.cache_read_input_tokens = u.get("cache_read_input_tokens", 0)
        elif typ == "content_block_start":
            acc = _BlockAcc()
            cb = ev.get("content_block")
            if cb:
                acc.base = cb
                if isinstance(cb.get("type"), str):
                    acc.typ = cb["type"]
            if acc.typ in ("tool_use", "server_tool_use"):
                acc.has_input = True
            blocks[ev["index"]] = acc
        elif typ == "content_block_delta":
            acc = blocks.get(ev["index"])
            if acc is None:
                raise StreamError(f"anthropic stream: delta for unknown block {ev['index']}")
            d = ev.get("delta") or {}
            dt = d.get("type")
            if dt == "text_delta":
                t = d.get("text", "")
                acc.text.append(t)
                if on_text is not None and t != "":
                    on_text(t)
            elif dt == "input_json_delta":
                acc.input_json.append(d.get("partial_json", ""))
            elif dt == "thinking_delta":
                acc.thinking.append(d.get("thinking", ""))
            elif dt == "signature_delta":
                acc.sig += d.get("signature", "")
        elif typ == "content_block_stop":
            pass  # finalized below, once all deltas are in
        elif typ == "message_delta":
            d = ev.get("delta") or {}
            if d.get("stop_reason"):
                out.stop_reason = d["stop_reason"]
            u = ev.get("usage") or {}
            if u.get("output_tokens", 0) > 0:
                out.usage.output_tokens = u["output_tokens"]
        elif typ == "message_stop":
            saw_stop = True
        elif typ == "error":
            raise StreamError(f"anthropic stream error: {json.dumps(ev.get('error'))}")
        elif typ == "ping":
            pass  # keep-alive — ignore

    for line in lines:
        if line == "":  # event boundary
            flush()
        elif line.startswith("data:"):
            # Anthropic sends one data line per event; concatenate defensively in
            # case a payload is ever split across multiple data: lines.
            data_buf.append(line[len("data:") :].removeprefix(" "))
        else:
            # `event:` lines and comments — the payload carries its own type.
            pass
    flush()  # a trailing event with no closing blank line

    for i in sorted(blocks):
        out.content.append(blocks[i].finalize())

    if out.stop_reason == "" and not saw_stop:
        raise StreamError("anthropic stream: ended without stop_reason")
    return out
