"""Shared dependencies + the server-held state.

Python's sqlite3 connection is not safe to share across threads, so the
long-lived process state and the per-request database handle are kept separate:

  - AppState holds the process-lifetime singletons (clients, runner, optional
    engines, and the taste/playbook cache behind a lock). One instance lives on
    app.state.scout.
  - get_db opens a FRESH connection per request via store.db.connect (migrations
    already ran once at create_app time) and closes it in finally — each request
    owns its own connection, never shared.

Sync `def` endpoints run in the threadpool, so the blocking sqlite3/httpx calls
never stall the event loop.
"""

from __future__ import annotations

import os
import threading
from collections.abc import Iterator

from fastapi import Request

from scout import anthropic as anthropic_pkg
from scout import playbook as playbook_pkg
from scout import taste as taste_pkg
from scout.store import db as db_module
from scout.store import settings as settings_store

from .config import Config


class AppState:
    """Process-lifetime singletons + the taste/playbook cache.

    Holds the state that outlives a request. Per-request SQLite connections come
    from get_db, never from here. The optional engines
    (runner/outreach/answers/chat) stay None in part 1 — meta reports them off
    until they are wired.
    """

    def __init__(
        self,
        config: Config,
        anthropic_client: anthropic_pkg.Client | None = None,
        brainbot=None,
        resolver=None,
        runner=None,
        outreach=None,
        answers=None,
        chat=None,
        key_verifier=None,
    ) -> None:
        self.config = config
        self.anthropic = anthropic_client
        self.brainbot = brainbot
        self.resolver = resolver
        self.runner = runner
        self.outreach = outreach
        self.answers = answers
        self.chat = chat
        self.key_verifier = key_verifier

        # taste/playbook cache, recomputed by reload_taste; guarded because
        # /api/stats reads it while an editor PUT (part 2) can reload it.
        self._lock = threading.RLock()
        self._taste: taste_pkg.Block | None = None
        self._playbook: str = ""

    # --- taste / playbook cache ------------------------------------------------

    def reload_taste(self) -> None:
        """Resolve the criteria block (cached brain brief → taste.md, via the
        resolver) and fold the playbook into the version, matching `scout
        verdict`. Runs at startup and after every editor PUT (part 2). Holds a
        dedicated connection for the duration so it never shares a request's."""
        with self._lock:
            con = db_module.connect(self.config.db_path)
            try:
                tb: taste_pkg.Block | None = None
                if self.resolver is not None:
                    self.resolver.store = con
                    try:
                        tb = self.resolver.resolve()
                    except Exception:  # noqa: BLE001 - any failure → taste.md fallback
                        tb = None
                if tb is None and self.config.taste_md_path:
                    try:
                        tb = taste_pkg.load_file(self.config.taste_md_path)
                    except OSError:
                        tb = None
                pb = playbook_pkg.content_or_default(con)
            finally:
                con.close()
            if tb is not None and pb:
                # Stamp each new verdict with the exact criteria (brief + playbook)
                # it was scored under, recorded in the decision trail.
                tb.version = taste_pkg.hash(pb + "\n---taste---\n" + tb.version)
                tb.source = tb.source + " + playbook"
            self._taste = tb
            self._playbook = pb

    def current_taste(self) -> taste_pkg.Block | None:
        with self._lock:
            return self._taste

    def current_playbook(self) -> str:
        with self._lock:
            return self._playbook

    def current_taste_version(self) -> str:
        with self._lock:
            return self._taste.version if self._taste is not None else ""

    # --- Anthropic key resolution ----------------------------------------------

    def active_anthropic_key(self, con) -> tuple[str, str]:
        """The key in effect and its source: a UI-stored key ("db") wins over
        ANTHROPIC_API_KEY ("env"); neither → ("", "")."""
        try:
            v = settings_store.get_setting(con, settings_store.ANTHROPIC_KEY_SETTING)
        except Exception:  # noqa: BLE001
            v = ""
        if v:
            return v, "db"
        env = os.environ.get("ANTHROPIC_API_KEY", "")
        if env:
            return env, "env"
        return "", ""

    def ensure_anthropic_key(self, con) -> str:
        """Resolve the live key and re-key the shared client so a dashboard change
        takes effect with no restart. Returns the resolved key for the call-time
        gates (`if state.ensure_anthropic_key(con) == "": 412`)."""
        key, _ = self.active_anthropic_key(con)
        if self.anthropic is not None:
            self.anthropic.set_api_key(key)
        return key

    # --- brain health ----------------------------------------------------------

    def brain_healthy(self) -> bool:
        """Whether the brain is configured AND currently reachable."""
        if self.brainbot is None or not self.brainbot.enabled():
            return False
        try:
            self.brainbot.health()
            return True
        except Exception:  # noqa: BLE001
            return False


def get_state(request: Request) -> AppState:
    """The process-lifetime AppState attached to the app at create_app time."""
    return request.app.state.scout


def get_db(request: Request) -> Iterator:
    """A fresh per-request SQLite connection, closed in finally. Each request
    owns one, never shared across requests."""
    state: AppState = request.app.state.scout
    con = db_module.connect(state.config.db_path)
    try:
        yield con
    finally:
        con.close()
