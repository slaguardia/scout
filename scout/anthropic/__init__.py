"""scout.anthropic — SDK-free Anthropic Messages API client (port of internal/anthropic).

Public surface (imported by capture, chat, distill, enrich, outreach, verdict):
    Client, new, verify
    Request, Message, Response, ContentBlock, Usage
    ToolDef, WebSearchTool, new_web_search_tool
    DEFAULT_MODEL, ADAPTIVE_THINKING, AnthropicError
"""
from .client import (
    ADAPTIVE_THINKING,
    DEFAULT_MODEL,
    AnthropicError,
    Client,
    ContentBlock,
    Message,
    Request,
    Response,
    ToolDef,
    Usage,
    WebSearchTool,
    new,
    new_web_search_tool,
    verify,
)
from .stream import StreamError, parse_sse

__all__ = [
    "ADAPTIVE_THINKING",
    "DEFAULT_MODEL",
    "AnthropicError",
    "Client",
    "ContentBlock",
    "Message",
    "Request",
    "Response",
    "ToolDef",
    "Usage",
    "WebSearchTool",
    "new",
    "new_web_search_tool",
    "verify",
    "StreamError",
    "parse_sse",
]
