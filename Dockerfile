# scout — Python backend (FastAPI on uvicorn). Serves the UI + /api on :8765,
# reads the brain on the internal docker network, keeps its working set in local
# SQLite on a volume (never the brain/Postgres). Auth lives at the edge — scout
# holds no login code.
FROM python:3.12-slim
WORKDIR /app

# Install deps + the package first (own layer for caching). pyproject + the
# scout/ package are all `pip install .` needs; the .sql migrations ship inside
# the package via [tool.setuptools.package-data].
COPY pyproject.toml ./
COPY scout ./scout
RUN pip install --no-cache-dir .

# The built PWA (Vite output, committed) served at / by the app, and the
# criteria narrative fallback (the live DB is on /data; the playbook + pre-filter
# defaults ship inside the scout package).
COPY web/dist ./web/dist
COPY taste.md ./

RUN mkdir -p /data
EXPOSE 8765
# Serve on :8765; reach the brain at http://brain:8100 on brainnet; DB on the volume.
CMD ["scout","serve","--addr",":8765","--db","/data/scout.db","--brainbot","http://brain:8100"]
