// Jobs view — the application tracker. One row per saved posting: role · company
// (+ a next-up star + draft badge), inline application-stage and reply-status
// selects, follow-up badge, last outreach, contacts (mailto), link. Row-click
// opens the pursuit pane. Faithful port of renderJobs + filteredJobs +
// compareJobs + the inline-control saves; the queue-nav + filters live in the
// sidebar (Phase 1).
import { useMemo, useState } from "react";
import { useJobs } from "../api/jobs";
import { useVocab, vocabColorClass } from "../api/queries";
import { useUI, useDispatch, DEFAULT_JSORT, type Sort } from "../store/ui";
import { useJobTracking } from "../hooks/useJobTracking";
import { parseContacts } from "../lib/contacts";
import { IconNextUp, IconBell } from "../components/icons";
import type { Posting } from "../api/types";

function stageOrder(j: Posting, stages: string[]): number {
  const s = j.application_status || "";
  if (!s) return stages.length + 1;
  const i = stages.indexOf(s);
  return i < 0 ? stages.length : i;
}

function compareJobs(a: Posting, b: Posting, k: string, dir: number, stages: string[]): number {
  if (k === "verdict") {
    const order: Record<string, number> = { yes: 0, maybe: 1, no: 2, "": 3 };
    return (order[a.verdict || ""] ?? 3) - (order[b.verdict || ""] ?? 3);
  }
  if (k === "application") return stageOrder(a, stages) - stageOrder(b, stages);
  if (k === "followups_due") return (b.followups_due! | 0) - (a.followups_due! | 0);
  if (k === "created_at" || k === "last_outreach_at") {
    const av = (a[k] as string) || "";
    const bv = (b[k] as string) || "";
    if (!av && !bv) return 0;
    if (!av) return dir;
    if (!bv) return -dir;
    return String(bv).localeCompare(String(av));
  }
  return String((a as unknown as Record<string, unknown>)[k] ?? "").localeCompare(
    String((b as unknown as Record<string, unknown>)[k] ?? ""),
  );
}

function options(current: string, vocab: string[]): [string, string][] {
  const opts: [string, string][] = [["", "none"]];
  for (const s of vocab) opts.push([s, s]);
  if (current && !vocab.includes(current)) opts.push([current, current + " (removed)"]);
  return opts;
}

export function JobsView({ active }: { active: boolean }) {
  const { data: jobs } = useJobs();
  const vocab = useVocab().data;
  const ui = useUI();
  const dispatch = useDispatch();
  const { toggleNextUp, saveTracking, bulkStage } = useJobTracking();
  const [sel, setSel] = useState<Set<string>>(() => new Set());
  const f = ui.jobsFilter;
  const sort = ui.jobsSort;
  const stages = vocab?.applicationStages ?? [];
  const statuses = vocab?.outreachStatuses ?? [];
  const hidden = ui.jHiddenCols;

  const stageSel = f.stages ?? new Set(["", ...stages]);
  const statusSel = f.statuses ?? new Set(["", ...statuses]);

  const rows = useMemo(() => {
    const q = f.q.trim().toLowerCase();
    const list = (jobs ?? []).filter((j) => {
      const stage = j.application_status || "";
      if (!stageSel.has(stage)) return false;
      if (f.nextUpOnly && !j.next_up) return false;
      if (f.dueOnly && !(j.followups_due! | 0)) return false;
      if (!statusSel.has(j.outreach_status || "")) return false;
      if (q) {
        const hay = (
          j.title +
          " " +
          j.company +
          " " +
          (j.location || "") +
          " " +
          (j.description || "") +
          " " +
          (j.contacts || "")
        ).toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    return list.sort((a, b) => sort.dir * compareJobs(a, b, sort.k, sort.dir, stages));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs, f, sort, stages, statuses]);

  const cycleSort = (k: string) => {
    let next: Sort;
    if (sort.k !== k) next = { k, dir: 1 };
    else if (sort.dir === 1) next = { k, dir: -1 };
    else next = { ...DEFAULT_JSORT };
    dispatch({ type: "setJobsSort", sort: next });
  };
  const colStyle = (col: string) => (hidden.has(col) ? { display: "none" } : undefined);
  const sortAttr = (k: string) => (sort.k === k ? { "data-sort": sort.dir < 0 ? "desc" : "asc" } : {});

  const hiddenRej =
    f.stages && !stageSel.has("rejected")
      ? (jobs ?? []).filter((j) => (j.application_status || "") === "rejected").length
      : 0;

  // Selection is pruned to what's on screen: narrowing the filter quietly drops
  // the hidden rows from the bulk action rather than moving something unseen.
  const selIds = useMemo(
    () => rows.filter((j) => sel.has(j.posting_id)).map((j) => j.posting_id),
    [rows, sel],
  );
  const allSel = rows.length > 0 && selIds.length === rows.length;
  const someSel = selIds.length > 0 && !allSel;
  const toggleOne = (id: string) =>
    setSel((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const applyStage = async (stage: string) => {
    if (await bulkStage(selIds, stage)) setSel(new Set());
  };

  return (
    <div className="table-wrap" id="jobs-view" style={{ display: active ? "" : "none" }}>
      {selIds.length ? (
        <div className="bulk-bar" id="jobs-bulk-bar">
          <span>
            <strong>{selIds.length}</strong> selected
          </span>
          <select
            className="bulk-stage-sel"
            title="move the selected jobs to an application stage"
            value="__pick__"
            onChange={(e) => {
              const v = e.target.value;
              if (v !== "__pick__") void applyStage(v);
            }}
          >
            <option value="__pick__" disabled>
              Set stage…
            </option>
            <option value="">not applied</option>
            {stages.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <button className="btn btn-sm" onClick={() => setSel(new Set())}>
            Clear
          </button>
        </div>
      ) : null}
      <table id="jt">
        <thead>
          <tr>
            <th className="jt-check">
              <input
                type="checkbox"
                checked={allSel}
                ref={(el) => {
                  if (el) el.indeterminate = someSel;
                }}
                onChange={() => setSel(allSel ? new Set() : new Set(rows.map((j) => j.posting_id)))}
                title={allSel ? "clear the selection" : "select every job shown"}
                aria-label="select every job shown"
              />
            </th>
            <th data-jk="company" {...sortAttr("company")} onClick={() => cycleSort("company")}>role · company</th>
            <th data-jk="application" data-col="application" style={colStyle("application")} {...sortAttr("application")} onClick={() => cycleSort("application")}>application</th>
            <th data-jk="followups_due" data-col="outreach" style={colStyle("outreach")} {...sortAttr("followups_due")} onClick={() => cycleSort("followups_due")}>outreach</th>
            <th data-jk="last_outreach_at" data-col="last_outreach" style={colStyle("last_outreach")} {...sortAttr("last_outreach_at")} onClick={() => cycleSort("last_outreach_at")}>last outreach</th>
            <th data-jk="contacts" data-col="contacts" style={colStyle("contacts")} {...sortAttr("contacts")} onClick={() => cycleSort("contacts")}>contacts</th>
            <th data-col="link" style={colStyle("link")}>link</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((j) => (
            <JobRow
              key={j.posting_id}
              j={j}
              stages={stages}
              statuses={statuses}
              colStyle={colStyle}
              selected={sel.has(j.posting_id)}
              onToggleSel={() => toggleOne(j.posting_id)}
              onOpen={() => dispatch({ type: "openPursuit", id: j.posting_id })}
              onToggleNextUp={() => toggleNextUp(j)}
              onStage={(v) => saveTracking(j, { application_status: v })}
              onStatus={(v) => saveTracking(j, { outreach_status: v })}
            />
          ))}
        </tbody>
      </table>
      <div id="jobs-empty" className="empty" style={{ display: rows.length ? "none" : "block" }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2m-13 0h18a1 1 0 011 1v11a1 1 0 01-1 1H3a1 1 0 01-1-1V8a1 1 0 011-1z" />
        </svg>
        <div className="t">No jobs match the current filters.</div>
        <div className="small dim">
          Paste a posting URL via <strong>Add…</strong> — the agent pass fills in the rest.
        </div>
      </div>
      <div className="hidden-note" id="jobs-hidden-note" style={{ display: hiddenRej ? "" : "none" }}>
        {hiddenRej ? (
          <>
            {hiddenRej} rejected application{hiddenRej > 1 ? "s" : ""} hidden —{" "}
            <a
              id="show-rejected-link"
              onClick={() =>
                dispatch({ type: "setJobsFilter", patch: { stages: new Set([...stageSel, "rejected"]) } })
              }
            >
              show
            </a>
          </>
        ) : null}
      </div>
    </div>
  );
}

function DraftBadge({ status }: { status?: string | null }) {
  if (status === "researching")
    return (
      <span className="draft-badge db-researching" title="drafting outreach…">
        <span className="spinner spinner-xs"></span>drafting
      </span>
    );
  if (status === "awaiting_review")
    return (
      <span className="draft-badge" title="an outreach draft is ready to review">
        draft ready
      </span>
    );
  if (status === "no_hook")
    return (
      <span className="draft-badge db-nohook" title="no honest hook — scout recommends not emailing">
        no hook
      </span>
    );
  return null;
}

function JobRow({
  j,
  stages,
  statuses,
  colStyle,
  selected,
  onToggleSel,
  onOpen,
  onToggleNextUp,
  onStage,
  onStatus,
}: {
  j: Posting;
  stages: string[];
  statuses: string[];
  colStyle: (c: string) => { display: string } | undefined;
  selected: boolean;
  onToggleSel: () => void;
  onOpen: () => void;
  onToggleNextUp: () => void;
  onStage: (v: string) => void;
  onStatus: (v: string) => void;
}) {
  const stage = j.application_status || "";
  const ostatus = j.outreach_status || "";
  const contacts = parseContacts(j.contacts);

  return (
    <tr
      data-id={j.posting_id}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("a, button, select, input")) return;
        onOpen();
      }}
    >
      <td className="jt-check">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSel}
          aria-label={`select ${j.title || j.company}`}
        />
      </td>
      <td>
        <div className="jt-namecell">
          <div className="jt-lead">
            <button
              className={"jt-nextup" + (j.next_up ? " is-on" : "")}
              title={j.next_up ? "queued next up for outreach — click to remove" : "mark next up for outreach"}
              aria-label="next up"
              onClick={onToggleNextUp}
            >
              <IconNextUp />
            </button>
            {j.followups_due ? (
              <span className="followup-badge" title={`${j.followups_due} follow-up${j.followups_due > 1 ? "s" : ""} due — open to act`}>
                <IconBell />
                {j.followups_due}
              </span>
            ) : null}
          </div>
          <div className="jt-namecol">
            <span className="row-name">{j.title || j.company}</span>
            <DraftBadge status={j.outreach_draft_status} />
            {j.title ? <div className="small dim">{j.company}</div> : null}
          </div>
        </div>
      </td>
      <td data-col="application" style={colStyle("application")}>
        <div className="jt-stage">
          <select
            className={"jt-stage-sel " + vocabColorClass(stage, stages)}
            title="application stage"
            value={stage}
            onChange={(e) => onStage(e.target.value)}
          >
            {options(stage, stages).map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </td>
      <td className="small" data-col="outreach" style={colStyle("outreach")}>
        <div className="jt-out">
          <select
            className={"jt-ostatus " + vocabColorClass(ostatus, statuses)}
            title="outreach reply status"
            value={ostatus}
            onChange={(e) => onStatus(e.target.value)}
          >
            {options(ostatus, statuses).map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </td>
      <td className="small" data-col="last_outreach" style={colStyle("last_outreach")}>
        {j.last_outreach_at ? j.last_outreach_at : <span className="dim">—</span>}
      </td>
      <td className="small td-contacts" data-col="contacts" style={colStyle("contacts")}>
        <ContactsCell contacts={contacts} />
      </td>
      <td data-col="link" style={colStyle("link")}>
        <a href={safeHref(j.url)} target="_blank" rel="noopener" title="open posting" aria-label="open posting">↗</a>
      </td>
    </tr>
  );
}

function ContactsCell({ contacts }: { contacts: { position: string; email: string }[] }) {
  if (!contacts.length) return <span className="dim">—</span>;
  return (
    <>
      {contacts.map((c, i) => {
        const label = c.position || c.email;
        const node = c.email ? (
          <a href={`mailto:${c.email}`} title={c.position ? `${c.position} — ${c.email}` : c.email}>
            {label}
          </a>
        ) : (
          <span>{label}</span>
        );
        return (
          <span key={i}>
            {i > 0 ? <span className="dim">, </span> : null}
            {node}
          </span>
        );
      })}
    </>
  );
}

function safeHref(u?: string | null): string {
  return /^https?:\/\//i.test(String(u ?? "")) ? String(u) : "#";
}
