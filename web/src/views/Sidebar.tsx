// The sidebar rail: brand, view tabs, action buttons, the per-view filter blocks
// (search + Filters dropdown + jobs queue-nav), the Columns dropdown, and the
// footer (Settings / How it works). It's the vanilla `.sidebar` markup +
// setView/openRunConfirm/openAdd wiring, driven by the UI store + Query data.
import { useEffect, useMemo, useRef } from "react";
import { useUI, useDispatch } from "../store/ui";
import { useMeta, useVocab, vocabColorClass } from "../api/queries";
import { useCompanies } from "../api/companies";
import { useJobs } from "../api/jobs";
import { COLUMNS, JCOLUMNS } from "../components/columns";
import {
  FilterDropdown,
  FDropItem,
  FDropHead,
  FDropHeadToggle,
} from "../components/FilterDropdown";
import {
  IconCompanies,
  IconJobs,
  IconBell,
  IconPlus,
  IconEnrich,
  IconVerdict,
  IconSearch,
  IconFilterLead,
  IconColumnsLead,
  IconGear,
  IconHelp,
  IconNextUp,
} from "../components/icons";
import { useNotifications } from "../api/notifications";
import { useRuns } from "../api/runs";
import type { Company, Posting, StatusVocab } from "../api/types";

const VERDICT_ITEMS: [string, string, string][] = [
  ["yes", "yes", "fdrop-dot--yes"],
  ["maybe", "maybe", "fdrop-dot--maybe"],
  ["no", "no", "fdrop-dot--no"],
  ["__none__", "unscored", "fdrop-dot--none"],
];

function toggleInSet(set: Set<string>, key: string): Set<string> {
  const next = new Set(set);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
}

export function Sidebar() {
  const ui = useUI();
  const dispatch = useDispatch();
  const meta = useMeta().data;
  const vocabQuery = useVocab();
  const vocab = vocabQuery.data;
  const companies = useCompanies().data ?? [];
  const jobs = useJobs().data ?? [];
  const notifs = useNotifications().data;
  const busyStage = useRuns().data?.busy_stage || "";

  const { view } = ui;

  // Reconcile the jobs stage/status selection whenever the vocab changes (seed to
  // all on first load; drop removed stages; default new ones to visible). Skip the
  // placeholder vocab — reconciling against it would seed knownStages without
  // server-only stages (e.g. "archived"), so when the real vocab arrives they'd
  // look brand-new and get force-selected, clobbering a persisted deselection.
  useEffect(() => {
    if (vocab && !vocabQuery.isPlaceholderData)
      dispatch({
        type: "reconcileJobsVocab",
        stages: vocab.applicationStages,
        statuses: vocab.outreachStatuses,
      });
  }, [vocab, vocabQuery.isPlaceholderData, dispatch]);

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="brand">scout</div>
      </div>

      <div className="block" id="block-view">
        <h3>Tabs</h3>
        <div className="view-switch" title="switch the main area">
          <button
            className={"tab" + (view === "companies" ? " active" : "")}
            title="companies"
            aria-label="companies"
            onClick={() => dispatch({ type: "setView", view: "companies" })}
          >
            <IconCompanies />
            <span className="tab-label">companies</span>
          </button>
          <button
            className={"tab" + (view === "jobs" ? " active" : "")}
            title="jobs"
            aria-label="jobs"
            onClick={() => dispatch({ type: "setView", view: "jobs" })}
          >
            <IconJobs />
            <span className="tab-label">jobs</span>
          </button>
          <button
            className={"tab" + (view === "inbox" ? " active" : "")}
            title="Inbox — replies, application updates, follow-ups due"
            aria-label="inbox"
            onClick={() => dispatch({ type: "setView", view: "inbox" })}
          >
            <IconBell />
            <span className="tab-label">inbox</span>
            <span
              className="notif-badge"
              id="notif-badge"
              style={{ display: notifs && notifs.unread ? "" : "none" }}
            >
              {notifs && notifs.unread > 99 ? "99+" : (notifs?.unread ?? 0)}
            </span>
          </button>
        </div>
      </div>

      <div className="block" id="block-actions">
        <h3>Actions</h3>
        <div className="view-switch">
          <button
            className="navrow"
            title="add a company or job from a link — or bulk-import a CSV"
            onClick={() => dispatch({ type: "openModal", modal: { kind: "add" } })}
          >
            <IconPlus />
            <span className="tab-label">Add</span>
          </button>
          {view === "companies" ? (
            <>
              <button
                className={"navrow" + (busyStage === "enrich" ? " busy" : "")}
                title="fetch + summarize each company's pages"
                disabled={!meta?.control}
                onClick={() => dispatch({ type: "openModal", modal: { kind: "run", stage: "enrich" } })}
              >
                <IconEnrich />
                <span className="tab-label">Enrich</span>
              </button>
              <button
                className={"navrow" + (busyStage === "verdict" ? " busy" : "")}
                title={
                  meta?.verdict ? "score each enriched company against your criteria" : "set ANTHROPIC_API_KEY in the server env to enable"
                }
                disabled={!meta?.control || !meta?.verdict}
                onClick={() => dispatch({ type: "openModal", modal: { kind: "run", stage: "verdict" } })}
              >
                <IconVerdict />
                <span className="tab-label">Verdict</span>
              </button>
            </>
          ) : null}
        </div>
        {busyStage ? (
          <div className="run-busy" id="run-busy">
            <span className="spinner"></span>
            <span id="run-busy-label">{busyStage} running…</span>
          </div>
        ) : null}
      </div>

      {view === "companies" ? (
        <CompaniesFilterBlock companies={companies} />
      ) : null}
      {view === "jobs" ? <JobsFilterBlock jobs={jobs} vocab={vocab} /> : null}

      {(view === "companies" || view === "jobs") ? <ColumnsBlock /> : null}

      <div className="sidebar-bottom">
        <div className="sidebar-foot">
          <button
            className={"doc-btn foot-btn" + (view === "settings" ? " is-active" : "")}
            title="Settings — criteria, playbook, email template"
            aria-label="settings"
            onClick={() => dispatch({ type: "setView", view: "settings" })}
          >
            <IconGear />
            <span className="ft-label">Settings</span>
          </button>
          <button
            className={"doc-btn foot-btn" + (view === "docs" ? " is-active" : "")}
            title="How scout works — ingestion, prompts, files, triage"
            aria-label="how it works"
            onClick={() => dispatch({ type: "setView", view: "docs" })}
          >
            <IconHelp />
            <span className="ft-label">How it works</span>
          </button>
        </div>
      </div>
    </aside>
  );
}

/* ---- companies filter block ------------------------------------------------ */

function CompaniesFilterBlock({ companies }: { companies: Company[] }) {
  const ui = useUI();
  const dispatch = useDispatch();
  const f = ui.companiesFilter;

  const counts = useMemo(() => {
    const n: Record<string, number> = { yes: 0, maybe: 0, no: 0, __none__: 0 };
    let flaggedN = 0;
    let enrichedN = 0;
    for (const r of companies) {
      const key = r.verdict || "__none__";
      n[key] = (n[key] | 0) + 1;
      if (r.flagged) flaggedN++;
      if (r.enriched) enrichedN++;
    }
    return { n, flaggedN, enrichedN };
  }, [companies]);

  const active = f.verdict.size + (f.flagOnly ? 1 : 0) + (f.enrichedOnly ? 1 : 0);

  return (
    <div className="block" id="block-filter-companies">
      <div className="filter-row">
        <div className="search-wrap">
          <IconSearch />
          <input
            id="q"
            placeholder="search name, vertical, reason…"
            value={f.q}
            onChange={(e) => dispatch({ type: "setCompaniesFilter", patch: { q: e.target.value } })}
          />
        </div>
      </div>
      <div className="filter-row">
        <div className="filter-dropdowns">
          <FilterDropdown
            label="Filters"
            leadIcon={<IconFilterLead className="fdrop-lead" />}
            title="filter companies"
            count={active}
            active={active > 0}
          >
            <FDropHead>Verdict</FDropHead>
            {VERDICT_ITEMS.map(([v, label, dot]) => (
              <FDropItem
                key={v}
                checked={f.verdict.has(v)}
                label={label}
                dot={dot}
                count={counts.n[v] | 0}
                onClick={() =>
                  dispatch({ type: "setCompaniesFilter", patch: { verdict: toggleInSet(f.verdict, v) } })
                }
              />
            ))}
            <div className="fdrop-sep"></div>
            <FDropHead>Flags</FDropHead>
            <FDropItem
              checked={f.flagOnly}
              label="⚑ Flagged"
              count={counts.flaggedN}
              onClick={() => dispatch({ type: "setCompaniesFilter", patch: { flagOnly: !f.flagOnly } })}
            />
            <FDropItem
              checked={f.enrichedOnly}
              label="Enriched"
              count={counts.enrichedN}
              onClick={() =>
                dispatch({ type: "setCompaniesFilter", patch: { enrichedOnly: !f.enrichedOnly } })
              }
            />
          </FilterDropdown>
        </div>
      </div>
    </div>
  );
}

/* ---- jobs filter block ----------------------------------------------------- */

function JobsFilterBlock({ jobs, vocab }: { jobs: Posting[]; vocab: StatusVocab | undefined }) {
  const ui = useUI();
  const dispatch = useDispatch();
  const f = ui.jobsFilter;
  const stages = vocab?.applicationStages ?? [];
  const statuses = vocab?.outreachStatuses ?? [];

  const stageSel = f.stages ?? new Set(["", ...stages]);
  const statusSel = f.statuses ?? new Set(["", ...statuses]);

  const counts = useMemo(() => {
    const stageN: Record<string, number> = {};
    const statusN: Record<string, number> = {};
    let nextN = 0;
    let due = 0;
    for (const j of jobs) {
      const st = j.application_status || "";
      stageN[st] = (stageN[st] | 0) + 1;
      const os = j.outreach_status || "";
      statusN[os] = (statusN[os] | 0) + 1;
      if (j.next_up) nextN++;
      due += j.followups_due | 0;
    }
    return { stageN, statusN, nextN, due };
  }, [jobs]);

  // Badge counts every active narrowing vs the every-item default.
  const stageDef = ["", ...stages];
  const appDefault = stageSel.size === stageDef.length && stageDef.every((s) => stageSel.has(s));
  const statusDef = ["", ...statuses];
  const statusDefault =
    statusSel.size === statusDef.length && statusDef.every((s) => statusSel.has(s));
  const badge = (appDefault ? 0 : stageSel.size) + (statusDefault ? 0 : statusSel.size);

  const allStagesOn = stageDef.every((s) => stageSel.has(s));
  const allStatusesOn = statusDef.every((s) => statusSel.has(s));

  // Queue-nav visibility: a button appears only while it has matches; when its
  // count drops to zero its filter releases so the table never strands empty.
  useEffect(() => {
    if (!counts.nextN && f.nextUpOnly) dispatch({ type: "setJobsFilter", patch: { nextUpOnly: false } });
    if (!counts.due && f.dueOnly) dispatch({ type: "setJobsFilter", patch: { dueOnly: false } });
  }, [counts.nextN, counts.due, f.nextUpOnly, f.dueOnly, dispatch]);

  return (
    <div className="block" id="block-filter-jobs">
      <div className="filter-row">
        <div className="search-wrap">
          <IconSearch />
          <input
            id="jq"
            placeholder="search title, company, contacts…"
            value={f.q}
            onChange={(e) => dispatch({ type: "setJobsFilter", patch: { q: e.target.value } })}
          />
        </div>
      </div>
      <div className="filter-row">
        <div className="filter-dropdowns">
          <FilterDropdown
            label="Filters"
            leadIcon={<IconFilterLead className="fdrop-lead" />}
            title="filter jobs"
            count={badge}
            active={badge > 0}
          >
            <FDropHeadToggle
              label="Application stage"
              allOn={allStagesOn}
              onToggle={() =>
                dispatch({
                  type: "setJobsFilter",
                  patch: { stages: allStagesOn ? new Set() : new Set(stageDef) },
                })
              }
            />
            <FDropItem
              checked={stageSel.has("")}
              label="not applied"
              count={counts.stageN[""] | 0}
              onClick={() => dispatch({ type: "setJobsFilter", patch: { stages: toggleInSet(stageSel, "") } })}
            />
            {stages.map((s) => (
              <FDropItem
                key={s}
                checked={stageSel.has(s)}
                label={s}
                dot={vocabColorClass(s, stages)}
                count={counts.stageN[s] | 0}
                onClick={() => dispatch({ type: "setJobsFilter", patch: { stages: toggleInSet(stageSel, s) } })}
              />
            ))}
            <div className="fdrop-sep"></div>
            <FDropHeadToggle
              label="Reply status"
              allOn={allStatusesOn}
              onToggle={() =>
                dispatch({
                  type: "setJobsFilter",
                  patch: { statuses: allStatusesOn ? new Set() : new Set(statusDef) },
                })
              }
            />
            <FDropItem
              checked={statusSel.has("")}
              label="not reached out"
              count={counts.statusN[""] | 0}
              onClick={() => dispatch({ type: "setJobsFilter", patch: { statuses: toggleInSet(statusSel, "") } })}
            />
            {statuses.map((s) => (
              <FDropItem
                key={s}
                checked={statusSel.has(s)}
                label={s}
                dot={vocabColorClass(s, statuses)}
                count={counts.statusN[s] | 0}
                onClick={() =>
                  dispatch({ type: "setJobsFilter", patch: { statuses: toggleInSet(statusSel, s) } })
                }
              />
            ))}
          </FilterDropdown>
        </div>
      </div>
      {counts.nextN || counts.due ? (
        <div className="filter-row" id="jobs-followup-nav">
          {counts.nextN ? (
            <button
              className={"queue-nav-btn queue-nav-btn--nextup" + (f.nextUpOnly ? " is-active" : "")}
              title={
                f.nextUpOnly
                  ? "showing only these — click to show all jobs"
                  : "show only jobs queued next up for outreach"
              }
              onClick={() => dispatch({ type: "setJobsFilter", patch: { nextUpOnly: !f.nextUpOnly } })}
            >
              <span className="fn-icon">
                <IconNextUp />
              </span>
              <span className="fn-text">
                <strong>{counts.nextN}</strong> next up
              </span>
            </button>
          ) : null}
          {counts.due ? (
            <button
              className={"queue-nav-btn" + (f.dueOnly ? " is-active" : "")}
              title={
                f.dueOnly
                  ? "showing only these — click to show all jobs"
                  : "show only jobs owing a follow-up"
              }
              onClick={() => dispatch({ type: "setJobsFilter", patch: { dueOnly: !f.dueOnly } })}
            >
              <span className="fn-icon">
                <IconBell />
              </span>
              <span className="fn-text">
                <strong>{counts.due}</strong> follow-up{counts.due > 1 ? "s" : ""} due
              </span>
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/* ---- columns block --------------------------------------------------------- */

function ColumnsBlock() {
  const ui = useUI();
  const dispatch = useDispatch();
  const isJobs = ui.view === "jobs";
  const cols = isJobs ? JCOLUMNS : COLUMNS;
  const hidden = isJobs ? ui.jHiddenCols : ui.hiddenCols;
  const setHidden = (next: Set<string>) =>
    dispatch(isJobs ? { type: "setJHiddenCols", cols: next } : { type: "setHiddenCols", cols: next });
  const hiddenCount = cols.filter((c) => hidden.has(c.k)).length;

  return (
    <div className="block" id="block-columns">
      <div className="filter-dropdowns">
        <FilterDropdown
          label="Columns"
          leadIcon={<IconColumnsLead className="fdrop-lead" />}
          title="show or hide table columns"
          count={hiddenCount}
          countMuted
        >
          <FDropHead>Visible columns</FDropHead>
          {cols.map((c) => (
            <FDropItem
              key={c.k}
              checked={!hidden.has(c.k)}
              label={c.label}
              onClick={() => setHidden(toggleInSet(hidden, c.k))}
            />
          ))}
        </FilterDropdown>
      </div>
    </div>
  );
}
