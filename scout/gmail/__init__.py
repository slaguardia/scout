"""Gmail link: OAuth + REST client + the read-sync engine.

scout-local and single-user. The Python backend owns the OAuth code-exchange/
refresh and the Gmail REST calls (no SDK, httpx + stdlib); the brain is not
involved.
"""
from __future__ import annotations

from .client import GmailClient, GmailError, HistoryExpired
from .oauth import GmailAuthError, OAuthConfig, TokenResponse

__all__ = [
    "GmailClient",
    "GmailError",
    "HistoryExpired",
    "GmailAuthError",
    "OAuthConfig",
    "TokenResponse",
]
