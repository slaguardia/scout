# Porting guide — Go → Python (scout backend)

This is the single source of truth for the Go→Python port. Every module follows
these conventions so the codebase reads as one consistent author. The Go tree
under `internal/` and its `*_test.go` files **are the spec** — port faithfully,
port the tests, make them pass.

## Stack & layout

- **FastAPI** (web) · **raw `sqlite3`** (no ORM) · **httpx** (Anthropic + brain).
- Python package under `py/scout/`, mirroring Go's `internal/<pkg>` →
  `scout/<pkg>/` (or `scout/<pkg>.py` for small ones).
- Tests in `py/tests/`, one `test_<module>.py` per Go `<module>_test.go`.
- Run tests: `cd py && ../.venv/bin/python -m pytest`.
- Frontend (`web/`) is NOT rewritten — the web layer serves the built `web/dist/`
  as static files.

## Store-module pattern (canonical example: `scout/store/settings.py`)

- **Free functions, not methods.** A Go method `func (db *DB) X(...)` becomes a
  free function `def x(con, ...)` taking the `sqlite3.Connection` first. Lower
  snake_case the Go name (`UpsertCompany` → `upsert_company`).
- **One module per Go file** (`companies.go` → `companies.py`), same grouping.
- **Parameterized SQL** with `?` placeholders and a tuple of args — never string
  interpolation of values. (Column/table names validated against an allow-list
  may be interpolated, exactly as Go does it.)
- **Connection** comes from `scout/store/db.py::open_db` (already ported). It sets
  `row_factory = sqlite3.Row` (rows are dict-like *and* index-like) and
  autocommit mode (`isolation_level=None`).

## Domain types

- A Go struct → a `@dataclass` in the module that owns it (`Company` in
  `companies.py`, `Posting` in `postings.py`). Cross-module references import it.
- **Field names are snake_case and match the Go JSON tags** (`json:"company_id"`
  → `company_id`), so the web layer serializes a dataclass straight to the same
  JSON shape.
- Nullable text that Go exposes as `""`-when-null (via `COALESCE(x,'')` in the
  SELECT) → a `str` field defaulting to `""`. Genuinely nullable ints →
  `int | None`. Booleans derived from a nullable timestamp (Go's
  `nextUpAt.Valid`) → `bool`.

## NULL / empty handling

- Writing: `from ._helpers import null` — `null(s)` returns `None` (SQL NULL) for
  an empty string, else `s`. Mirrors Go's `store.NullString`. Trim first where Go
  does: `null(s.strip())`.
- Reading: SELECTs keep the Go `COALESCE(col, '')` / `COALESCE(col, default)` so
  Python reads a concrete value, not `None`.

## Transactions

- `from ._helpers import tx` — a context manager:
  ```python
  with tx(con):
      _upsert_company(con, domain_key, c)
      _fold_children(con, name_key, domain_key)
  ```
  Commits on success, rolls back on exception. This is Go's `db.Begin()` /
  `defer tx.Rollback()` / `tx.Commit()`. Because the connection is shared, inner
  helpers just use `con` (no separate tx object — that's the Go `execer`
  interface, which collapses away in Python).

## Errors (Go sentinels → exceptions), in `scout/store/errors.py`

| Go | Python | Web maps to |
|----|--------|-------------|
| `sql.ErrNoRows` (returned as the error) | raise `errors.NotFound` | 404 |
| `ErrDomainTaken` | raise `errors.DomainTaken` | 409 |
| `ErrUnknownCompany` | raise `errors.UnknownCompany` | 400 |
| validation error w/ field-prefixed msg | raise `ValueError(msg)` | 400 |

- Where Go returns `(value, exists bool, err)` or `(nil, nil)` for absent (e.g.
  `GetPosting`, `CompanyExists`), keep that shape — return `None` / `False`, do
  NOT raise. Only raise `NotFound` where Go specifically returns `sql.ErrNoRows`
  as the error (the update/delete-by-id paths).

## Deterministic IDs (data-critical — pinned)

Company primary keys are deterministic UUIDv5. Python's `uuid.uuid5` is identical
to Go's `uuid.NewSHA1` over the same RFC `NAMESPACE_URL`, so IDs match byte-for-
byte. **Pinned ground-truth values (assert these in tests):**

```python
import uuid
_NS = uuid.uuid5(uuid.NAMESPACE_URL, "github.com/slaguardia/scout/companies")
# _NS == 8f78c449-4bfc-501c-a610-a8f52b32b427

def company_id(domain: str, name: str) -> str:
    key = domain.strip().lower() or ("name:" + name.strip().lower())
    return str(uuid.uuid5(_NS, key))

# company_id("acme.com", "Acme") == "79517ca0-4cf4-51a9-a41a-71141a11d5ad"
# company_id("", "Acme")         == "ff0d9751-c6f0-5f03-ba1a-56ba9330cae1"
```

Random ids (Go `uuid.NewString()`) → `_helpers.new_uuid()`.

## Name folding

`norm_name(s) = s.strip().lower()` (Go's `normName`). Store it in the `name_key`
column and match on it (never SQLite `lower()`, which is ASCII-only). Accepted
micro-divergence: Python's full-Unicode `.lower()` differs from Go's simple
case-mapping on a few exotic codepoints (e.g. `İ`); irrelevant for real data.

## Tests

- Use the `db` fixture (`tests/conftest.py`) = Go's `openTestDB(t)`: a fresh
  migrated connection per test.
- Port each Go test function 1:1; keep the assertions and intent. Go's
  `mkCompany` helper etc. become small local helpers or a shared `tests/helpers`.
- A Go test that crosses modules (companies_test seeds enrichment, verdicts,
  drafts…) needs those modules ported too — the store layer is one unit.
- HTTP-client tests use `tests/httpstub.py::http_server(handle)` — a threaded
  127.0.0.1 server (the analogue of Go's `httptest.NewServer`). The handler
  *records* each request into a list; assert request shape AFTER the call (a
  handler thread can't raise into the test). No real network calls.

## Foundation package interfaces

The shared packages every domain module calls. Stateful HTTP clients are small
classes holding their config + an `httpx.Client`; stateless helpers are free
functions. Errors follow the table above (validation → `ValueError`).

### `scout.anthropic` (port of internal/anthropic)

- `Client(api_key="", endpoint=DEFAULT_ENDPOINT, http=None)` — thread-safe key.
  - `send(req: Request) -> Response` — one Messages call; retries 429/5xx/529
    with backoff (`MAX_RETRIES=5`); raises `AnthropicError`.
  - `stream(req: Request, on_text: Callable[[str],None] | None = None) -> Response`
    — SSE; reconstructs every block (tool_use input, thinking + signature) into
    `ContentBlock.raw`; `on_text` gets each text delta. Raises `StreamError`.
  - `has_key() -> bool`, `set_api_key(k: str)`.
- `new(api_key="") -> Client` (fills key from `ANTHROPIC_API_KEY`).
- `verify(api_key: str) -> None` — cheap auth probe; raises on reject. No tokens.
- `Request(model="", system="", max_tokens=0, messages=[], cached=False,
  temperature=None, tools=None, thinking=None, timeout=0.0)`. `cached=True`
  sends the system prompt as one ephemeral cache block.
- `Message(role, content)` — `content` is a str, or a `Response.raw_content()`
  for a pause_turn replay.
- `Response`: `.content: list[ContentBlock]`, `.stop_reason`, `.usage: Usage`,
  `.id`, `.model`; `.text() -> str` (text blocks only), `.raw_content() -> list[dict]`.
- `ContentBlock(type, text, raw: dict)` — `raw` is the verbatim block dict.
- `ToolDef(name, description, input_schema)`; `WebSearchTool`;
  `new_web_search_tool(max_uses) -> WebSearchTool` (≤0 omits the cap).
- Constants: `DEFAULT_MODEL`, `ADAPTIVE_THINKING`. Errors: `AnthropicError`,
  `StreamError`.

### `scout.brainbot` (port of internal/brainbot) — read-only brain client

- `Client(base_url, auth="", http=None)`; `new(base_url) -> Client` (auth from
  `BRAIN_BEARER_TOKEN`). `base_url=""` disables (every call raises).
  - `enabled() -> bool`
  - `health() -> None` (raises when down or `ok=false`)
  - `recall(query, k) -> RecallResult` (k≤0 omits the param)
  - `recall_complete(query, k) -> RecallResult` (sends `complete=true`)
  - `doc(id) -> Doc`
  - `map() -> MapResult`
  - `changes(since) -> ChangesResult` (`since` always sent, even empty)
- `is_not_found(err) -> bool`; `HTTPError(status, detail)` (non-2xx, body's
  `{"error":…}` in the detail). Scope is never sent — `recall(query)` is the whole
  interface.
- Dataclasses: `Chunk(id, heading, text, score, path)`, `RecallResult(chunks)`,
  `Doc(id, title, path, version, text)`,
  `MapSource(id, title, path, parent_id, version)`, `MapResult(sources)`,
  `ChangesResult(cursor, changed)`.

### `scout.ingest` (port of internal/ingest) — uses `scout.store`

- `CSV(source, con)`; `run(path) -> Result`. First row is the header (BOM-
  stripped); an unterminated quote is a surfaced per-row error (`csv.reader(...,
  strict=True)`), a missing name column raises `ValueError`.
- `Result(read, upserted, merged, collisions, skipped, errors: list[str],
  collision_details: list[Collision])`;
  `Collision(domain, incoming_name, overwrote_name)`.
- `add_manual(con, m: ManualCompany) -> str` — hand-add; raises
  `CompanyExists(company_id)` on a duplicate domain (carries the existing id),
  `ValueError` ("website …") on a bad/aggregator website.
- `ManualCompany(website, name, headcount, funding_stage, location, vertical)`.
- `set_company_domain(con, company_id, website) -> str` — validate + re-key.
- `ensure_company(con, c: CapturedCompany) -> (id: str, created: bool)` — capture
  path; resolves an existing row untouched, never overwrites; `ValueError` when
  neither name nor a usable domain.
- `CapturedCompany(name, domain, location, vertical, source_url, headcount,
  funding_stage)`.
- `identity_domain(raw) -> str` — "" when the host can't be a company identity
  (bare TLD / IPv4 / aggregator). `parse_headcount(s) -> int | None`.
- `upsert_with_merge(con, c: store.companies.Company) -> _UpsertOutcome` — the
  shared dedup/merge path (folds name↔domain twins both ways); used by all three
  write paths above.

## Web layer conventions (port of internal/web → FastAPI)

The Go `web.Server` (one struct + a pooled `*sql.DB`, `net/http` mux) becomes a
**FastAPI app factory**. Go's prefix handlers that hand-parse sub-paths/methods
(`/api/companies/` → reviewed/flagged/verdict/…) become **explicit FastAPI
routes**. The Go handlers + `*_test.go` are still the spec: faithful status
codes and JSON shapes.

### Structure

- `scout/web/config.py` — `Config` dataclass (db_path, static_dir, taste_md_path,
  ingest_source, anthropic key/models, brain url/ttl). Defaults mirror `scout
  serve`'s flags. `config.static_path()` returns the resolved dist dir or `None`.
- `scout/web/app.py::create_app(config) -> FastAPI` — the factory. It (1) runs
  migrations once (`open_db(path).close()`), (2) builds the process-lifetime
  singletons into an `AppState` on `app.state.scout` and calls `reload_taste()`,
  (3) installs the exception handlers, includes the feature routers, and mounts
  the SPA fallback.
- `scout/web/deps.py` — `AppState` (the long-lived singletons + the
  lock-guarded taste/playbook cache + the Anthropic-key/brain-health helpers, =
  the Go `Server`'s non-DB fields) and the FastAPI dependencies `get_db` and
  `get_state`.
- `scout/web/responses.py` — `json_response` / `json_error` + `install_error_handlers`.
- `scout/web/routes/<feature>.py` — one `APIRouter` per feature. `core.py` is part 1.

### Connection model (critical)

`sqlite3` connections are not thread-safe and FastAPI runs sync endpoints in a
threadpool, so there is **one connection per request**, never shared:

- `store.db.connect(path)` opens with the pragmas but does NOT migrate (the
  `open_db = connect + migrate` split). It sets `check_same_thread=False`
  because a request's dependency and its endpoint may run on different threadpool
  threads (never concurrently).
- `get_db` (in deps.py) opens a fresh connection via `connect`, `yield`s it, and
  closes it in `finally`. **Every endpoint that touches the DB takes
  `con=Depends(get_db)`** as the Go handler's `s.DB`.
- **Endpoints are sync `def`** (not `async`), so blocking sqlite3/httpx runs in
  the threadpool. To read a JSON body in a sync endpoint, depend on the async
  `raw_body` (reads `await request.body()`); decode with `decode_json` (malformed
  → `ValueError("invalid JSON: …")` → 400).
- Fire-and-forget background work (outreach draft/answer threads) must open its
  OWN connection with `connect` inside the worker thread — never the request's.

### Error mapping

`install_error_handlers(app)` maps the store sentinels to the Go body shape
`{"error": msg}`: `NotFound`→404, `DomainTaken`→409, `UnknownCompany`→400,
`ValueError`→400. So a handler can just CALL the store function and let the
exception propagate; only catch inline where Go does something special (e.g.
`ingest.CompanyExists`→409 with a named message, a `get_company_detail` that
returns `None`→404). Use `json_error(msg, code)` for inline cases and the JSON
no-write outcomes (e.g. recapture's 422).

### Static / SPA

The SPA fallback is a **404 exception handler**, NOT a catch-all route: a
catch-all `GET /{path}` would full-match a method-mismatched `/api` path and turn
its 405 into a 404. The router raises 404 only for genuinely unmatched paths (a
method mismatch is a 405 and never reaches the handler), so for a non-`/api/` GET
the handler serves the file from `static_dir` (path-traversal-guarded) or
`index.html`; otherwise it returns `{"error":"not found"}` 404. Absent dist → it
still boots and just 404s.

### How to add a feature router (part 2)

1. Create `scout/web/routes/<feature>.py` with `router = APIRouter()`.
2. Enumerate the Go dispatch as explicit routes — `@router.get("/api/x/{id}")`,
   `@router.api_route("/api/x/{id}/sub", methods=["PUT","POST"])` for multi-method
   handlers, etc. Distinct paths coexist with core's (FastAPI matches the most
   specific); a path registered for only some methods auto-405s the rest, matching
   Go's `default: method not allowed`.
3. Take `con=Depends(get_db)` and, when you need the clients / taste cache /
   engines, `state: AppState = Depends(get_state)`. Read a JSON body via
   `raw=Depends(raw_body)` + `decode_json(raw)`.
4. Return `json_response(value, status=200)` — it serializes dataclasses (and
   nested ones) by field name = the Go JSON tags. Use `json_error` for failures.
5. Wire optional engines (Runner/Outreach/Answers/Chat) into `AppState` in
   `create_app` and gate routes on their presence (503/412), like cmdServe does.
6. Include it in `create_app`: `app.include_router(<feature>.router)` BEFORE
   `_mount_spa`.
7. Port the Go `*_test.go` with `fastapi.testclient.TestClient` using the
   `tests/web_helpers.py::new_test_app` scaffold (temp DB + seeded company + a
   db_path for store-level assertions). Clear `ANTHROPIC_API_KEY` for the no-key
   paths.
