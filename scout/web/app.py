"""The FastAPI app factory.

create_app(config) stands up the whole web layer the way cmd/scout/main.go's
cmdServe builds the Go web.Server:

  1. Run migrations ONCE (open_db then close); per-request connections come from
     store.db.connect via the get_db dependency.
  2. Build the process-lifetime singletons (Anthropic client, optional brain
     client + criteria resolver) into an AppState on app.state.scout, then load
     the taste/playbook cache.
  3. Register the store-exception handlers, include the feature routers, and mount
     the SPA fallback last.

Part 1 wires the core router; part 2 adds the remaining feature routers by
calling app.include_router on its own APIRouter (see PORTING.md → "Web layer
conventions").
"""
from __future__ import annotations

import importlib
import mimetypes
import pkgutil
from pathlib import Path

from fastapi import FastAPI, Request
from starlette.responses import FileResponse, Response

from scout import anthropic as anthropic_pkg
from scout import brainbot as brainbot_pkg
from scout import criteria as criteria_pkg
from scout import distill as distill_pkg
from scout.store import db as db_module

from . import routes as routes_pkg
from .config import Config
from .deps import AppState
from .responses import install_error_handlers, json_error

# Go's default MIME table has no .webmanifest entry; register it so the PWA
# manifest is served as application/manifest+json (matching server.go's init()).
mimetypes.add_type("application/manifest+json", ".webmanifest")


def create_app(config: Config | None = None) -> FastAPI:
    config = config or Config()

    # 1. Migrate once, then close. Requests open their own connections.
    db_module.open_db(config.db_path).close()

    # 2. Process-lifetime singletons (mirrors cmdServe's wiring).
    ac = anthropic_pkg.new(config.anthropic_api_key)  # key falls back to env
    bc = None
    resolver = None
    if config.brain_url:
        bc = brainbot_pkg.new(config.brain_url)  # shared with the health probes
        resolver = criteria_pkg.Resolver(
            brain=bc,
            distiller=distill_pkg.Distiller(brain=bc, client=ac, model=config.distill_model),
            taste_md_path=config.taste_md_path,
            ttl=config.brain_cache_ttl,
        )

    state = AppState(config, anthropic_client=ac, brainbot=bc, resolver=resolver)
    # Seed the shared client's key from the DB-over-env resolver, then load
    # taste + playbook (folds the playbook into the version, like `scout verdict`).
    _seed_key(state)
    state.reload_taste()

    # 3. App.
    app = FastAPI()
    app.state.scout = state
    install_error_handlers(app)
    _include_routers(app)
    _mount_spa(app, config)
    return app


def _include_routers(app: FastAPI) -> None:
    """Auto-discover every feature router: include `router` from each module in
    scout/web/routes/. Dropping a new routes/<feature>.py with a top-level
    `router = APIRouter()` registers it — no edit here (see PORTING.md → "Web
    layer conventions")."""
    for info in pkgutil.iter_modules(routes_pkg.__path__):
        module = importlib.import_module(f"{routes_pkg.__name__}.{info.name}")
        router = getattr(module, "router", None)
        if router is not None:
            app.include_router(router)


def _seed_key(state: AppState) -> None:
    """Re-key the shared Anthropic client from the DB-over-env resolver so a
    dashboard-stored key from a prior run is in effect at boot."""
    con = db_module.connect(state.config.db_path)
    try:
        state.ensure_anthropic_key(con)
    finally:
        con.close()


def _mount_spa(app: FastAPI, config: Config) -> None:
    """Serve the built PWA from config.static_dir: existing files directly, any
    other non-/api path falls back to index.html (the client-side hash router owns
    navigation). Mirrors server.go's handleIndex.

    Implemented as a 404 handler rather than a catch-all route on purpose: a
    catch-all GET would full-match a method-mismatched /api path and turn its 405
    into a 404. The router raises 404 only for genuinely unmatched paths (a
    method mismatch raises 405, which never reaches here), so the SPA fallback
    fires exactly where Go's handleIndex would. Absent dist → plain 404s, no
    crash."""
    static_dir = config.static_path()  # resolved Path, or None when absent

    @app.exception_handler(404)
    def spa_fallback(request: Request, _exc) -> Response:
        path = request.url.path
        # Defense-in-depth: never serve the SPA shell for an /api path, and only
        # for read methods.
        if (
            request.method in ("GET", "HEAD")
            and not path.startswith("/api/")
            and static_dir is not None
        ):
            rel = path.lstrip("/")
            if rel:
                candidate = (static_dir / rel).resolve()
                if candidate.is_file() and candidate.is_relative_to(static_dir):
                    return FileResponse(candidate)
            index = static_dir / "index.html"
            if index.is_file():
                return FileResponse(index)
        return json_error("not found", 404)
