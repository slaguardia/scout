"""scout.web — the FastAPI web layer (port of internal/web).

create_app(config) is the app factory; Config holds everything it needs. The
domain packages are called through the get_db per-request connection and the
AppState singletons (see deps.py).
"""
from .app import create_app
from .config import Config

__all__ = ["create_app", "Config"]
