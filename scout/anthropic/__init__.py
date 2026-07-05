"""scout.anthropic — Anthropic Messages API client (a façade over the official SDK).

Public surface (imported by capture, chat, distill, enrich, outreach, verdict):
    Client, new, verify
    Request, Message, Response, ContentBlock, Usage
    ToolDef, WebSearchTool, new_web_search_tool
    DEFAULT_MODEL, ADAPTIVE_THINKING, AnthropicError, StreamError
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
    StreamError,
    ToolDef,
    Usage,
    WebSearchTool,
    new,
    new_web_search_tool,
    verify,
)

__all__ = [
    "ADAPTIVE_THINKING",
    "DEFAULT_MODEL",
    "AnthropicError",
    "Client",
    "ContentBlock",
    "Message",
    "Request",
    "Response",
    "StreamError",
    "ToolDef",
    "Usage",
    "WebSearchTool",
    "new",
    "new_web_search_tool",
    "verify",
]
