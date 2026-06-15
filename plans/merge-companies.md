# Plan: Merge two companies

Fold a duplicate company into another — re-point everything it owns (jobs,
enrichment, verdict, history) onto the survivor and delete the husk. Status:
**proposed** (not built).

## Motivation

Duplicates are unavoidable: a Crunchbase CSV row and a captured posting stub for
the same company key differently (one by domain, one by name), or two CSVs spell
a name differently. You end up with "Automat" (a bare stub) next to "Automat AI"
(the enriched, scored row). The [relink modal](../web/src/app.ts) already lets
you move a *single* job between companies; merge is the bulk version that also
removes the husk, so the duplicate stops cluttering the table and bulk runs.

This is also scout's first user-facing way to **delete** a company — today
there's no delete endpoint at all (companies only disappear via the internal
twin auto-fold). Merge is the deliberate, safe path: nothing is destroyed, it's
re-pointed.

## The good news: the hard part already exists

`internal/store/companies.go` already has `MergeCompany(oldID, newID)` and
`foldChildren` — built for the ingest-time name→domain twin auto-fold. In one
transaction it re-points every company-scoped child row from old→new, resolves
the 1:1 conflicts in the survivor's favor, then deletes the old parent. It is
guarded against schema drift by `TestCompanyChildTablesMatchSchema`
(`merge_guard_test.go`), which derives the FK child-table list from the live
schema and fails if `companyChildTables` falls behind.

Child tables it already handles (FK `company_id` → `companies(id)`):

| Table              | Cardinality | On merge |
|--------------------|-------------|----------|
| `enrichment`       | 1:1         | survivor's row kept, loser's dropped |
| `verdicts`         | 1:1         | survivor's row kept, loser's dropped |
| `verdict_trace`    | many        | re-pointed (both histories coexist) |
| `verdict_override` | many        | re-pointed |
| `job_postings`     | many        | re-pointed (drafts/answers ride along — they're posting-scoped, `ON DELETE CASCADE` from the posting, no `company_id` of their own) |

So **building merge is mostly UI + an endpoint + survivor-field reconciliation**,
not new data plumbing.

## What the existing fold does NOT cover

1. **Survivor scalar fields.** `foldChildren` only moves child rows; it leaves
   the survivor's own `companies` row untouched and discards the loser's. That's
   wrong for a user merge where the husk may hold the one good field (a domain,
   notes). Add a reconciliation step (survivor wins; loser fills only blanks):
   - `name`, `domain`, `headcount`, `funding_stage`, `location`, `vertical`:
     survivor's non-empty value wins; otherwise backfill from the loser
     (`BackfillCompanyBlanks` already does exactly this — reuse it).
   - `notes`: **append** the loser's notes if any (human-written — never silently
     drop). e.g. survivor notes + `\n\n— merged from "<loser name>" —\n` + loser
     notes.
   - `flagged_at`: keep flagged if **either** was flagged (OR).
   - `reviewed_at`: keep the earliest non-null (reviewed stays reviewed).

2. **`chat_threads` is NOT an FK.** Chat threads scope to a company via
   `scope='company', scope_id=<company_id>` — a plain TEXT column, no
   `REFERENCES companies`. So `foldChildren` won't touch them and the guard test
   won't flag them: a loser's company chat threads would dangle (their `scope_id`
   points at a deleted id). Decide one of:
   - **(a) re-point** them in the merge txn (`UPDATE chat_threads SET scope_id=?
     WHERE scope='company' AND scope_id=?`) — one extra statement; or
   - **(b) leave them** (chat is disposable scratch) and just document it.
   Recommend (a): it's one line and avoids confusing orphans. Note it explicitly
   in `MergeCompany` since the schema guard can't.

3. **Not company-scoped, no action:** `brain_profile_cache` (singleton by brain
   URL), all the outreach/playbook/settings singletons.

## UX

Reuse the company-search modal pattern that the relink feature just shipped.

- **Entry point:** the company detail panel gets a **"Merge…"** action (in the
  pane footer, next to the existing controls). It opens the same search modal
  ("Merge with another company"), search-as-you-type over the other companies,
  each result showing name + verdict + vertical/location (the current company is
  excluded from results).
- **Pick the other company → a confirm step**, because a merge is destructive of
  one row. Show the two side by side and let the user choose **which survives**
  (radio; default the more-complete one — has a verdict, or has enrichment, or
  more jobs). Preview what moves: "N jobs, enrichment, verdict + M trace
  entries, and any drafts/answers move onto <survivor>. <loser> is deleted."
- **Confirm → merge → close**, re-point the open pane to the survivor's id
  (`state.openId`), and refresh the list + jobs (mirrors `saveCompanyDomain`,
  which already re-keys a company and re-points the pane).

Optional later: multi-select two rows in the companies table → "Merge" in a bulk
action bar. Start with the panel path; it's the common case (you're looking at
the dup when you notice it).

## Backend

One endpoint, survivor in the path:

`POST /api/companies/{survivorID}/merge` `{"from": "<loserID>"}` → runs the merge
in `MergeCompany`'s transaction (extended with the scalar reconciliation +
`chat_threads` re-point above), returns the refreshed survivor detail. Errors:
`404` if either id is unknown; `400` if `survivorID == from` (can't merge into
itself).

`MergeCompany(oldID, newID)` already has the right shape — generalize it:
- add the survivor-field reconciliation (read the loser row before deleting it;
  apply blanks/notes/flag/reviewed merge to the survivor inside the txn),
- add the `chat_threads` re-point,
- keep everything in the single existing transaction so a crash can't half-merge.

The existing ingest twin-fold caller (`UpsertAndFoldName`) keeps its current
behavior — the new reconciliation should be a no-op when the loser has no extra
scalar data, so both callers can share the path (or give the user path its own
thin wrapper that calls `foldChildren` + reconcile).

## Tests

- Store: merge a loser with jobs + enrichment + verdict + trace into a survivor
  that also has them → survivor keeps its 1:1 rows, gains the loser's jobs +
  trace, loser is gone, survivor blanks backfilled, notes appended, flag OR'd.
  Merge a *bare* loser (relink's exact case) → jobs move, nothing else lost.
- `chat_threads` re-point covered (a company thread on the loser ends up on the
  survivor).
- The existing `TestCompanyChildTablesMatchSchema` keeps guarding the FK list;
  add a sibling assertion/comment that `chat_threads` is handled out-of-band.
- Web: `POST …/merge` happy path (200 + survivor detail), self-merge `400`,
  unknown id `404`.

## Effort

Small–medium. The transactional re-point already exists and is schema-guarded;
the real work is the scalar reconciliation, the `chat_threads` line, the
endpoint, and the confirm UI (the search modal is already built). Roughly a
half-day including tests.

## Open questions

- **Survivor default:** more-complete (verdict/enrichment present, else more
  jobs) vs. always the company whose panel is open? Lean more-complete, since the
  whole point is keeping the enriched row.
- **Notes merge:** append with a separator (proposed) vs. survivor-only? Append
  is safer — never lose human text.
- **Undo:** none in v1 (the loser row is gone). The transaction makes it
  all-or-nothing; a mistaken merge is recovered by re-adding + relinking. Add a
  confirm step (above) rather than an undo.
