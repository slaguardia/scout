"""Web-layer configuration.

The Config dataclass holds everything create_app needs to stand up the FastAPI
app and wire the shared dependencies — the analogue of the fields `cmdServe`
fills into the Go web.Server plus the serve flags. Defaults mirror the Go
`scout serve` flag defaults so a zero-arg Config behaves like `scout serve`.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

# The PWA build (Vite output). The app serves it from disk. Resolved relative to
# the repo root (three parents up: scout/web/config.py → scout/web → scout →
# repo-root; the dist lives at repo-root/web/dist).
_REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_STATIC_DIR = _REPO_ROOT / "web" / "dist"

# Model defaults mirror cmd/scout/main.go's serve flags.
DEFAULT_DISTILL_MODEL = "claude-sonnet-4-6"
DEFAULT_OUTREACH_MODEL = "claude-sonnet-4-6"
DEFAULT_BRAIN_URL = "http://127.0.0.1:8100"
DEFAULT_BRAIN_CACHE_TTL = 6 * 60 * 60.0  # seconds


@dataclass
class Config:
    """Everything the app factory needs. db_path is the only required field in
    practice; the rest default to the `scout serve` flag defaults."""

    db_path: str = "scout.db"
    # The built PWA directory served at /. None → the committed repo dist.
    # A path that doesn't exist is tolerated (the SPA handler 404s); the app
    # still boots so the API is usable headless and tests need no assets.
    static_dir: str | None = None
    taste_md_path: str = "taste.md"
    ingest_source: str = "crunchbase"
    anthropic_api_key: str = ""  # "" → fall back to ANTHROPIC_API_KEY at the client
    distill_model: str = DEFAULT_DISTILL_MODEL
    outreach_model: str = DEFAULT_OUTREACH_MODEL
    brain_url: str = ""  # "" disables the brain (taste.md fallback)
    brain_cache_ttl: float = DEFAULT_BRAIN_CACHE_TTL

    def static_path(self) -> Path | None:
        """The resolved static dir, or None when it is absent on disk."""
        p = Path(self.static_dir) if self.static_dir else DEFAULT_STATIC_DIR
        p = p.resolve()
        return p if p.is_dir() else None
