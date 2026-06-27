"""A scripted Gmail REST stub for the read-sync tests (served via httpstub).

Handles the handful of endpoints the poller hits: token, profile, history.list,
messages.list, messages.get. Build messages with `gmail_message`.
"""
from __future__ import annotations

import base64
import json

_J = {"Content-Type": "application/json"}


def gmail_message(mid, frm, to, subject, body, thread="", internal="170000000000"):
    """A messages.get(full) payload with a text/plain body."""
    data = base64.urlsafe_b64encode(body.encode()).decode().rstrip("=")
    return {
        "id": mid,
        "threadId": thread or ("t-" + mid),
        "internalDate": internal,
        "snippet": body[:80],
        "payload": {
            "mimeType": "text/plain",
            "headers": [
                {"name": "From", "value": frm},
                {"name": "To", "value": to},
                {"name": "Subject", "value": subject},
            ],
            "body": {"data": data},
        },
    }


def oauth_env(monkeypatch, base):
    """Point the OAuth token endpoint + Gmail API base at the stub."""
    monkeypatch.setenv("GMAIL_CLIENT_ID", "cid")
    monkeypatch.setenv("GMAIL_CLIENT_SECRET", "sec")
    monkeypatch.setenv("GMAIL_TOKEN_URL", base + "/token")
    monkeypatch.setenv("GMAIL_API_BASE", base)


class FakeGmail:
    def __init__(self, *, profile_history_id="100", history=None, messages=None,
                 history_404=False, list_ids=None):
        self.profile_history_id = profile_history_id
        self.history = history or []          # message ids reported as messagesAdded
        self.messages = messages or {}        # id -> full message dict
        self.history_404 = history_404
        self.list_ids = list_ids or []        # ids for the bounded re-list
        self.calls: list = []

    def handle(self, req):
        self.calls.append((req.method, req.path))
        if req.path == "/token":
            return 200, _J, json.dumps({"access_token": "AT"})
        if req.path.endswith("/profile"):
            return 200, _J, json.dumps({"emailAddress": "me@gmail.com", "historyId": self.profile_history_id})
        if req.path.endswith("/history"):
            if self.history_404:
                return 404, _J, '{"error":{"code":404,"message":"historyId too old"}}'
            added = [{"message": {"id": mid}} for mid in self.history]
            return 200, _J, json.dumps({"history": [{"messagesAdded": added}], "historyId": self.profile_history_id})
        if req.path.endswith("/messages"):  # messages.list (re-list)
            return 200, _J, json.dumps({"messages": [{"id": mid} for mid in self.list_ids]})
        if "/messages/" in req.path:         # messages.get
            mid = req.path.rsplit("/", 1)[1]
            m = self.messages.get(mid)
            if m is None:
                return 404, _J, "{}"
            return 200, _J, json.dumps(m)
        return 404, _J, "{}"
