# Data model

SQLite. One file (`scout.db` by default). Migrations live in
`internal/store/migrations/` and are embedded via `//go:embed`; they apply
on every `Open()` and are tracked in `schema_migrations`.

Three pragmas: `foreign_keys=ON`, `journal_mode=WAL`. WAL because most
stages do bursts of writes from worker pools and WAL handles that better
than the default rollback journal.

## Tables

### `companies` — the inventory
```sql
companies (
    id            INTEGER PK,
    source        TEXT NOT NULL,     -- 'crunchbase' | 'manual' | ...
    source_id     TEXT,              -- UUID from source, or 'name:<name>' fallback
    name          TEXT NOT NULL,
    domain        TEXT,              -- normalized: no scheme, no www, no path
    headcount     INTEGER,
    funding_stage TEXT,
    location      TEXT,
    vertical      TEXT,
    raw_json      TEXT NOT NULL,     -- full original row, ordered by header
    ingested_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(source, source_id)
)
```

Indexes on `name`, `location`, `headcount`, `vertical`. Headcount/vertical
indexes are mostly speculative — drop if profiling says so.

`raw_json` is the escape hatch. Anything Crunchbase exports that we don't
have a column for is preserved. Useful when the LLM gets a verdict wrong
and you want to see what extra signal *was* in the row.

---

### `status` — review state
```sql
status (
    company_id INTEGER PK FK companies(id) ON DELETE CASCADE,
    state      TEXT NOT NULL DEFAULT 'new',  -- new | reviewed | tracked | dismissed
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

Decoupled from ingest so re-ingest doesn't clobber review state. Seeded on
first upsert via `INSERT OR IGNORE`.

There's no UI write-back yet (PRD §8). Changing state today means UPDATE-ing
the row by hand or via a CLI flag we haven't built. For v1 the only
practical use is filtering the triage UI by state.

---

### `enrichment` — cached about-page text
```sql
enrichment (
    company_id      INTEGER PK FK companies(id) ON DELETE CASCADE,
    website_url     TEXT,             -- URL we successfully fetched
    website_summary TEXT,             -- stripped text, ≤3000 runes
    fetch_status    TEXT NOT NULL,    -- 'ok' | 'no_domain' | 'http_<code>' | 'timeout' | 'dns' | 'refused' | 'error'
    fetch_error     TEXT,             -- detail when status != ok
    fetched_at      DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

One row per company, max. `fetched_at` vs `companies.ingested_at` is the
cache key — re-ingest invalidates.

Failed rows are kept (with `fetch_status` set) so we don't hot-loop on
permanently broken sites. Use `--force` on `scout enrich` to retry.

---

### `verdicts` — LLM decisions
```sql
verdicts (
    company_id    INTEGER PK FK companies(id) ON DELETE CASCADE,
    verdict       TEXT NOT NULL,     -- 'yes' | 'maybe' | 'no'
    reason        TEXT NOT NULL,
    taste_version TEXT NOT NULL,     -- sha256[:12] of the taste block used
    model         TEXT NOT NULL,     -- 'claude-haiku-4-5'
    scored_at     DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

One row per company per current verdict. `taste_version` is the cache key
— changing `taste.md` changes the hash and triggers re-scoring. We don't
keep verdict history; if a re-score happens the old row is overwritten.
Brainbot is the place for "what did Alex think before."

---

### `episodes_sent` — write-back dedup
```sql
episodes_sent (
    company_id    INTEGER FK companies(id) ON DELETE CASCADE,
    taste_version TEXT NOT NULL,
    sent_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (company_id, taste_version)
)
```

Marks that an episode was successfully POSTed to brainbot for this
`(company_id, taste_version)` pair. `scout episodes` only ships rows
missing from this table.

If a verdict gets re-scored (new taste_version), it'll get re-shipped —
that's intentional. Brainbot should treat each episode as immutable and
let the latest one win at read time.

---

### `schema_migrations` — migration ledger
```sql
schema_migrations (name TEXT PK, applied_at DATETIME DEFAULT CURRENT_TIMESTAMP)
```

One row per applied migration filename. The `migrate()` loop in
`internal/store/store.go` skips anything already in here.

## Relationships

```
companies (1) ─── (0..1) status
          (1) ─── (0..1) enrichment
          (1) ─── (0..1) verdicts
          (1) ─── (0..N) episodes_sent
```

`FOREIGN KEY ... ON DELETE CASCADE` everywhere. Delete a company, the rest
goes with it.

## Idempotency keys at a glance

| Stage | Idempotency key | Bust the cache by |
|---|---|---|
| ingest | `(source, source_id)` | (re-ingest is upsert; not really "bust") |
| filter | n/a (read-only) | — |
| enrich | `companies.ingested_at <= enrichment.fetched_at` | re-ingest, or `--force` |
| verdict | `verdicts.taste_version == taste.Version` | edit `taste.md`, or `--force` |
| episodes | row in `episodes_sent` | nothing — by design |

## Why not Postgres / per-stage tables / event sourcing

SQLite is plenty for low-thousand-row company sets. One file is the entire
working set; nuke it and start over costs nothing. Per-stage tables would
add joins for no benefit at this size. Event sourcing would be the right
shape if scout needed to reconstruct history — but it doesn't; brainbot
does. Scout is deliberately stateless across runs in everything except
the current snapshot.
