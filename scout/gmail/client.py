"""A small Gmail REST client (no SDK).

Only the calls send + read-sync need: getProfile, messages.send/get/list, and
history.list. Mirrors the Anthropic client's shape — httpx, an injectable base
URL for tests (api_base, overridable via the GMAIL_API_BASE env), and a lazily
refreshed access token derived from the stored refresh token (scout/gmail/oauth).
"""
from __future__ import annotations

import os

import httpx

from . import oauth

GMAIL_API_BASE = "https://gmail.googleapis.com"


class GmailError(Exception):
    """A Gmail REST call failed (non-2xx, transport, or decode error)."""


class HistoryExpired(Exception):
    """history.list returned 404: the startHistoryId is older than Gmail's
    retention window. The poller falls back to a bounded re-list + cursor reset."""


def default_api_base() -> str:
    """The Gmail API base, env-overridable so tests point it at a local stub."""
    return os.environ.get("GMAIL_API_BASE") or GMAIL_API_BASE


class GmailClient:
    """One Gmail account, authenticated by a refresh token. Build one per sync pass
    / send; it refreshes its access token once on first use."""

    def __init__(
        self,
        cfg: oauth.OAuthConfig,
        refresh_token: str,
        api_base: str = "",
        http: httpx.Client | None = None,
        access_token: str = "",
    ) -> None:
        self.cfg = cfg
        self.refresh_token = refresh_token
        self.api_base = (api_base or default_api_base()).rstrip("/")
        self._own = http is None
        self.http = http or httpx.Client(timeout=60.0)
        self._access_token = access_token

    def close(self) -> None:
        if self._own:
            self.http.close()

    def __enter__(self) -> "GmailClient":
        return self

    def __exit__(self, *exc) -> None:
        self.close()

    # --- auth ----------------------------------------------------------------

    def _token(self) -> str:
        if not self._access_token:
            self._access_token = oauth.refresh_access_token(self.cfg, self.refresh_token, http=self.http)
        return self._access_token

    def _headers(self) -> dict:
        return {"Authorization": f"Bearer {self._token()}"}

    # --- transport -----------------------------------------------------------

    def _get(self, path: str, params: dict | None = None) -> dict:
        try:
            resp = self.http.get(self.api_base + path, params=params, headers=self._headers())
        except httpx.RequestError as e:
            raise GmailError(f"GET {path}: {e}")
        return self._parse(resp, path)

    def _post(self, path: str, json_body: dict) -> dict:
        try:
            resp = self.http.post(self.api_base + path, json=json_body, headers=self._headers())
        except httpx.RequestError as e:
            raise GmailError(f"POST {path}: {e}")
        return self._parse(resp, path)

    def _parse(self, resp: httpx.Response, path: str) -> dict:
        if resp.status_code == 404 and "/history" in path:
            raise HistoryExpired()
        if resp.status_code == 401:
            raise oauth.GmailAuthError(f"gmail 401 on {path}: {resp.text}")
        if resp.status_code // 100 != 2:
            raise GmailError(f"gmail HTTP {resp.status_code} on {path}: {resp.text}")
        try:
            return resp.json()
        except ValueError as e:
            raise GmailError(f"gmail decode {path}: {e}")

    # --- API surface ---------------------------------------------------------

    def get_profile(self) -> dict:
        """users.getProfile → {emailAddress, historyId, messagesTotal, …}."""
        return self._get("/gmail/v1/users/me/profile")

    def send_message(self, raw_b64: str, thread_id: str = "") -> dict:
        """messages.send with a base64url-encoded RFC 2822 message → {id, threadId}.
        A thread_id keeps a follow-up in the same conversation."""
        body: dict = {"raw": raw_b64}
        if thread_id:
            body["threadId"] = thread_id
        return self._post("/gmail/v1/users/me/messages/send", body)

    def get_message(self, message_id: str, fmt: str = "full") -> dict:
        """messages.get → the full message (headers, body parts, threadId, …)."""
        return self._get(f"/gmail/v1/users/me/messages/{message_id}", params={"format": fmt})

    def list_history(self, start_history_id: str, page_token: str = "") -> dict:
        """history.list for messageAdded events since start_history_id. Raises
        HistoryExpired on a 404 (cursor too old)."""
        params = {"startHistoryId": start_history_id, "historyTypes": "messageAdded"}
        if page_token:
            params["pageToken"] = page_token
        return self._get("/gmail/v1/users/me/history", params=params)

    def list_messages(self, q: str = "", max_results: int = 50, page_token: str = "") -> dict:
        """messages.list (the bounded re-list fallback when the cursor expires)."""
        params: dict = {"maxResults": max_results}
        if q:
            params["q"] = q
        if page_token:
            params["pageToken"] = page_token
        return self._get("/gmail/v1/users/me/messages", params=params)
