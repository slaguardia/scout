# Gmail integration — send + read-sync + status tracking

**Goal:** make scout the **send button** and a **board of where every job stands** —
both *outreach* (who replied, who's owed a follow-up, what was last said) and
*application* status (applied → interviewing → rejected/offer), updated automatically
from a 2.5-minute Gmail poll. Kill the copy-paste and the inbox-digging.

Personal, single-user, scout-local (the Python backend owns the OAuth + Gmail calls;
the brain is not involved). Sends go from the user's `…@gmail.com`, added to Spark as
a send-from identity so reading stays unified.

> **Note — empty mailbox today.** The user has been on iCloud, so Gmail starts empty.
> No backfill needed; value accrues **going forward**. **Load-bearing habit:** the user
> must use this Gmail address for job mail — send outreach *from* it **and** enter it on
> application forms — or the application-status grep has nothing to read.

## The two streams (central model)

Outreach and application mail never collide — they're always to/from different
addresses — so sync routes by sender identity:

| Stream | Trigger | Updates | Source addresses |
|--------|---------|---------|------------------|
| **Outreach** | message to/from a **known contact** (`contacts.email`) | `outreach_status`, follow-up arming | recruiters / people you logged |
| **Application** | message from a **non-contact** address matching a tracked company/ATS | `application_status` (via LLM classify) | ATS no-reply, company HR |

A message matching neither is ignored and never stored.

## The scope split (policy)

| Half | Scope | Google class | Policy cost |
|------|-------|--------------|-------------|
| Send from scout | `gmail.send` | **sensitive** | light — production-unverified, **non-expiring tokens**, no audit |
| Read inbox | `gmail.readonly` | **restricted** | heavy to *verify* (CASA audit); for personal self-access runs **production-unverified** — one click-through **once**, then non-expiring |

**Fallback:** if Google ever stops allowing unverified restricted self-access, the read
poller fails auth and the inbound board goes dark — **send keeps working**, synced data
stays local, nothing breaks. Graceful degradation. We take the bet.

## One-time Google Cloud setup (user-owned)

Same GCP project as the app's Google SSO:
1. Enable the **Gmail API**.
2. Consent screen → scopes `gmail.send`, `gmail.readonly`, `openid`, `email`.
3. **OAuth client (Web)** with redirects: prod `https://<scout-domain>/api/gmail/callback`;
   dev `http://localhost:5173/api/gmail/callback` + `http://localhost:8765/api/gmail/callback`.
4. **Publish → "In production"** (stays unverified — this is what makes tokens non-expiring).
5. First connect: one-time "unverified app" screen → continue. Seen **once**.

Callback rides the existing oauth2-proxy session (user already logged in) → **no edge change**.

## Architecture

Zero new Python deps — `httpx` + stdlib `sqlite3`/`email` cover it. OAuth code-exchange
and refresh hand-rolled (one POST each to `oauth2.googleapis.com/token`), matching the
"direct HTTP, no SDK" house style. (Fallback: add `google-auth` for token mgmt only.)

```
scout/gmail/
  client.py     # httpx Gmail REST: token refresh, messages.send/get/list, history.list
  oauth.py      # consent URL, exchange code, refresh
  sync.py       # poller: history.list → route → write; sync_loop(stop, interval, ...)
  match.py      # message → (stream, contact?, posting?) resolution; role-in-email parse
  classify.py   # application-stream: Haiku reads an email → one of the app_status labels
scout/store/
  gmail.py      # cursor, gmail_messages, notifications, dedupe helpers
  migrations/0055_gmail.sql
scout/web/routes/
  gmail.py      # /api/gmail/{status,connect,callback,sync,disconnect}; send-gmail; notifications; link
scout/cli.py    # `scout gmail auth|sync`; start poller in cmd_serve
web/src/app.ts  # "Send via Gmail" on the draft card; notifications panel; manual-link control
```

### Token model
Stored in `settings`: `gmail_refresh_token`, `gmail_address`, `gmail_sync_cursor`
(historyId). Access tokens ephemeral (refreshed in-client). `application_status_autoflip`
(bool, default `false`) also lives here.

### Data model — `migrations/0055_gmail.sql`
```sql
-- scout schema, M55: Gmail link

-- Tie each logged send to its Gmail message/thread (dedupe synced sends; thread follow-ups).
ALTER TABLE outreach_log ADD COLUMN gmail_message_id TEXT NOT NULL DEFAULT '';
ALTER TABLE outreach_log ADD COLUMN gmail_thread_id  TEXT NOT NULL DEFAULT '';
CREATE UNIQUE INDEX idx_outreach_log_gmail_msg
    ON outreach_log(gmail_message_id) WHERE gmail_message_id <> '';

-- Inbound replies on tracked outreach threads (sends stay in outreach_log).
CREATE TABLE gmail_messages (
    id            TEXT PRIMARY KEY,                                  -- gmail message id
    thread_id     TEXT NOT NULL,
    posting_id    TEXT REFERENCES job_postings(id) ON DELETE CASCADE,
    contact_id    TEXT REFERENCES contacts(id)     ON DELETE SET NULL,
    from_email    TEXT NOT NULL DEFAULT '',
    subject       TEXT NOT NULL DEFAULT '',
    snippet       TEXT NOT NULL DEFAULT '',
    body          TEXT NOT NULL DEFAULT '',
    internal_date INTEGER NOT NULL,
    synced_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_gmail_messages_thread  ON gmail_messages(thread_id);
CREATE INDEX idx_gmail_messages_posting ON gmail_messages(posting_id);

-- Unified notifications feed (replies, application-status suggestions/changes).
CREATE TABLE notifications (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    kind             TEXT NOT NULL,                                  -- 'reply' | 'app_status'
    posting_id       TEXT REFERENCES job_postings(id) ON DELETE CASCADE,
    gmail_message_id TEXT NOT NULL DEFAULT '',
    title            TEXT NOT NULL DEFAULT '',
    detail           TEXT NOT NULL DEFAULT '',
    suggested_status TEXT NOT NULL DEFAULT '',                       -- app_status suggestion (when autoflip off)
    created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    seen_at          DATETIME,                                       -- NULL = unread (drives the badge)
    actioned_at      DATETIME                                        -- NULL = suggestion still pending
);
```
`application_status` already exists on `job_postings` (M51); we set it (auto or via a
notification's one-click apply), never add columns to it.

### Sync engine (`scout/gmail/sync.py`)
Cursor-based incremental poll every **150s**, daemon thread in `cmd_serve` (mirrors the
existing `criteria.reconcile_loop`), only when a refresh token is present. Also
`POST /api/gmail/sync` ("Sync now") and `scout gmail sync`.

1. **Bootstrap (no cursor):** `getProfile` → store `historyId`. Go-forward only (empty mailbox; no backfill).
2. **Incremental:** `history.list?startHistoryId=<cursor>&historyTypes=messageAdded`;
   `messages.get` each. On `404` (cursor expired) → bounded re-list + reset cursor.
3. **Route** (`match.py`): sender is a known contact → **outreach stream**; else sender
   matches a tracked company/ATS (by domain/board token, company name) → **application
   stream**; else drop.
4. **Outreach stream:** upsert `gmail_messages`; if the posting's `outreach_status` is
   blank/first-label, flip to the configured "replied" label (auto — low stakes, silences
   the ⏰ nag); write a `reply` notification. Outbound sends seen here but not yet in
   `outreach_log` (sent from Spark) → insert an `outreach_log` row + arm follow-up.
   Posting resolution: thread-id first; new thread → role named in the email vs the
   company's open postings; else most-recent open posting; manual-link control covers misses.
5. **Application stream:** `classify.py` (Haiku) reads the email → one of the existing
   `application_status` labels + confidence. Match to a posting by company/ATS + the role
   named. If `application_status_autoflip` **on** → set the status and write an
   `app_status` notification (FYI); if **off** → write an `app_status` notification with
   `suggested_status` (one-click apply in the panel). Never silently wrong without a trail.
6. Advance `gmail_sync_cursor`.

*Privacy/footprint:* only messages matching a tracked contact **or** a tracked
company/ATS are stored; the general inbox is never ingested.

### Send path + email template restructure
**Template restructure** (existing `outreach_template` singleton → structured):
- **subject** — configurable default with `{{role}}`/`{{company}}` substitution (no LLM).
- **body** — the existing mostly-fixed prose with the writer's generated holes (unchanged).
- **signature** — fixed configurable block appended.
- Editor (Settings → email template) splits into the three fields; the follow-up template
  gains a subject field too.

**`POST /api/outreach/drafts/{id}/send-gmail`:** input recipient `contact_id` (picker on
the draft card; defaults to the posting's primary contact). Build MIME (stdlib
`EmailMessage`) from `gmail_address` → contact, subject (rendered from template) + body +
signature; base64url. Thread a follow-up via prior `thread_id` + `In-Reply-To`/`References`.
`messages.send` → record `outreach_log` (reusing `contacts.log_outreach`) with `body` +
gmail ids; mark draft sent; follow-up auto-arms. Lands in the real Gmail Sent.

### Notifications panel (`web/src/app.ts`)
- A bell/indicator with an unread count (`notifications.seen_at IS NULL`).
- Panel lists, newest first: **replies** (open → the thread + reply body, sets seen),
  **application-status** items (when autoflip off, an **Apply** button sets the status and
  stamps `actioned_at`; when on, shown as FYI), and **follow-ups due** (derived from
  `outreach_log`, folded in — not duplicated into the table).
- **Manual link control:** on a reply/app-status item that mis-matched, "link to role…"
  re-points it at the right posting.
- Settings → a single **auto-update application status** toggle (`application_status_autoflip`).

### Other web routes (`scout/web/routes/gmail.py`)
- `GET /api/gmail/status` · `GET /api/gmail/connect` · `GET /api/gmail/callback` ·
  `POST /api/gmail/sync` · `DELETE /api/gmail/disconnect`
- `GET /api/notifications` · `POST /api/notifications/{id}/seen` ·
  `POST /api/notifications/{id}/apply` (apply a suggested status) ·
  `POST /api/notifications/{id}/link` (manual re-link)
- `POST /api/outreach/drafts/{id}/send-gmail`

## Build order (each slice shippable)

1. **OAuth plumbing** — `oauth.py`, `client.py`, connect/callback/status/disconnect,
   `scout gmail auth`. **Validate** restricted-scope grant works on the account here.
2. **Send** — `send-gmail` + draft-card button + recipient picker, using a **configurable
   default subject** (minimal). Ships the copy-paste kill on the clean `gmail.send` scope.
3. **Outreach read-sync** — migration `0055`, `sync.py`/`match.py`, the 2.5-min poller,
   `gmail_messages`, reply notifications, `outreach_status` auto-flip.
4. **Application-status sync** — `classify.py`, ATS/company matching, role-in-email parse,
   `app_status` notifications + the autoflip toggle.
5. **Notifications panel + manual link** — surfaces 3 & 4; folds in follow-ups-due.
6. **Template restructure** — subject/body/signature editor + follow-up subject (can land
   anytime after step 2's minimal subject).

## Acceptance criteria

**Global (every slice):** `pytest` green; new code typed/linted to repo norms; tests
never bind the canonical ports `:8765`/`:5173` (use a throwaway `--addr`/`--db`); the
Vite frontend builds; **all Gmail + Anthropic HTTP is mocked in tests** — no live calls.

**External gate (live verification only):** real OAuth connect, a real send, and real
reply/status detection need the user's one-time Google Cloud setup (OAuth client
id/secret + published consent screen) and an empty starting mailbox — so they can't be
agent-verified. Read client id/secret + redirect from env/`settings`; **ship code +
automated tests without blocking on credentials**, and document the setup steps. The
six slices below are each "done" on their automated criteria; live checks are the user's.

1. **OAuth** — `connect` → Google consent (4 scopes, `access_type=offline`, CSRF `state`);
   `callback` exchanges the code → stores `gmail_refresh_token` + `gmail_address`; `status`
   returns `{connected,email}`; `disconnect` clears it; the client refreshes a token and
   `getProfile` succeeds; `scout gmail auth` runs a loopback flow. *Tests:* URL build,
   exchange/refresh (mocked httpx), status/disconnect.
2. **Send** — `POST …/send-gmail` with a `contact_id` builds MIME, sends (mocked), writes
   an `outreach_log` row (body + gmail ids; unique-index dedupe holds), marks the draft
   sent; the draft card shows "Send via Gmail" + a recipient picker; a prior `thread_id`
   threads the message. *Tests:* MIME build, endpoint, log write + dedupe, draft-sent.
3. **Outreach read-sync** — migration `0055` applies clean; incremental sync advances the
   cursor; a contact-sender inbound → `gmail_messages` row + `reply` notification +
   `outreach_status`→replied; a Spark-sent outbound → new `outreach_log` row + armed
   follow-up; `historyId`-404 → bounded re-list + reset; the 2.5-min poller starts in
   `cmd_serve` when connected; `POST /api/gmail/sync` runs one pass. *Tests:* routing,
   dedupe, status flip, cursor advance, 404 fallback (mocked Gmail).
4. **Application-status** — a non-contact sender matching a tracked company/ATS →
   classified (mocked Haiku) to a live `application_status` label; matched to a posting by
   company/ATS + role-in-email; autoflip **on** → status set + FYI notification; **off**
   (default) → `app_status` notification carrying `suggested_status`. *Tests:* matching,
   classifier contract, autoflip branch.
5. **Notifications panel** — `GET /api/notifications`, `…/seen`, `…/apply` (sets status +
   `actioned_at`), `…/link` (re-point the posting); UI bell + unread count; panel lists
   replies / app-status / follow-ups-due; Apply and "link to role" work. *Tests:* the four
   endpoints + unread count.
6. **Template restructure** — `outreach_template` holds subject/body/signature; the editor
   splits into three fields; the follow-up template gains a subject; the subject renders via
   `{{role}}`/`{{company}}`; the send path uses it. *Tests:* render + persistence.

## Resolved decisions
- Outreach match: thread-id → role-in-email → most-recent open role; **manual link** for misses.
- Subject: configurable default template (substitution, no LLM); full subject/body/signature editor in step 6.
- "Replied"/status labels: reuse existing `outreach_status` / `application_status` labels.
- Streams never mixed (routed by contact vs non-contact sender).
- Auto-flip application status: **config toggle, default off** (suggest-and-confirm via the panel). Outreach reply-flip stays auto.
- Wider read for the application stream: OK; still job-mail only, never the whole inbox.
- Backfill: none (empty mailbox; go-forward).

## Residual (confirm at build, not blocking)
- Exact `application_status` label set the classifier emits (read from the live config).
- Classifier confidence threshold below which it stays a suggestion even when autoflip is on.
- Token at rest: refresh token stored plaintext in `settings` (same as the Anthropic key) —
  acceptable for a personal local DB.

## Risks
- Restricted-scope policy (covered) — validated at step 1; graceful fallback to send-only.
- Application-match precision from ATS mail — the autoflip-off default + manual link keep
  a wrong guess one click from corrected, never silently wrong.
- `historyId` expiry → bounded re-list fallback.
