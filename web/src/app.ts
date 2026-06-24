// scout's UI logic, lifted VERBATIM from the <script> of internal/web/index.html.
//
// The original script was a flat module body: function declarations interleaved
// with top-level `document.getElementById(...).onclick = ...` wiring and a final
// boot sequence (loadList/loadJobs/loadStats/loadMeta/loadRuns/loadProfile).
// Wrapping the WHOLE body in initScout() preserves behavior exactly: JS hoists
// the nested function declarations, and the interleaved wiring + boot calls run
// in source order AFTER main.ts has injected SCOUT_MARKUP — so every
// getElementById target exists. The original had no import/export, no
// DOMContentLoaded/window.onload (only one document-level keydown listener,
// which still binds to document). All fetch("/api/...") + the SSE
// EventSource("/api/jobs/{id}/stream") + draft-status polling are untouched.
//
// @ts-nocheck — this is loosely-typed vanilla DOM code; esbuild transpiles it
// without type-checking. Intentional, to de-risk the faithful port.
// @ts-nocheck

export function initScout(_root) {
// Baseline order each table falls back to when an active sort is cleared.
const DEFAULT_SORT = { k: "verdict", dir: 1 };
const DEFAULT_JSORT = { k: "created_at", dir: 1 };
const state = {
  rows: [], sort: { ...DEFAULT_SORT }, openId: null, stats: null, profile: null,
  view: "companies",                       // "companies" | "jobs"
  jobs: [], jsort: { ...DEFAULT_JSORT }, // jobs view rows + sort
  // Configurable status vocabularies (loaded from the API; defaults until then).
  // applicationStages drives the application-stage pill; outreachStatuses the
  // outreach reply pill. "none" (empty) is always implicit, not in these lists.
  applicationStages: ["applied", "screening", "interview", "offer", "rejected"],
  outreachStatuses: ["initial contact", "no response", "replied", "followed up"],
  followupInterval: 5,                      // default business days to arm a follow-up (M51)
  followupTemplate: "",                     // the follow-up email template (M53; loaded at boot, default applied server-side)
  openDetail: null,                        // the open company pane's cached detail (for cross-panel sync)
  anthropicKey: null,                      // {has_key, key_source} from /api/integrations/anthropic
};

const pillClass = v => "pill pill-" + (v || "none");
// The flag bookmark glyph — pole first, banner last (the .is-on CSS fills the banner).
const FLAG_SVG = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 14V2.5"/><path d="M3.5 2.5c3-1.2 6 1.2 9 0V9c-3 1.2-6-1.2-9 0z"/></svg>';
const escapeHTML = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
// safeHref neutralizes hostile schemes (e.g. javascript:) for user-derived URLs:
// returns the URL only when it is http(s), otherwise "#". escapeHTML still guards
// the attribute syntax; safeHref guards the scheme.
const safeHref = u => /^https?:\/\//i.test(String(u ?? "")) ? escapeHTML(u) : "#";

async function loadList() {
  const r = await fetch("/api/companies");
  const data = await r.json();
  state.rows = data.rows || [];
  renderList();
}

async function loadJobs() {
  let data;
  try {
    const r = await fetch("/api/postings");
    if (!r.ok) return;
    data = await r.json();
  } catch { return; }
  state.jobs = data.rows || [];
  renderJobs();
  rebindPursuitRow();
  syncJobsDraftPoll();
}

// rebindPursuitRow re-points the open pursuit panel at the freshly-fetched row
// object (the panel holds a reference into the old array) so its header/pipeline
// reflect server-side moves (e.g. a sent draft bumping outreach_count).
function rebindPursuitRow() {
  if (!pursuit.postingId) return;
  const fresh = state.jobs.find(j => j.posting_id === pursuit.postingId);
  if (!fresh) return;
  pursuit.row = fresh;
  if (document.getElementById("pursuit-pane").classList.contains("open")) renderPursuit();
}

// Drafting is fire-and-forget: a draft researches server-side after the POST and
// the row's "draft ready" badge only appears once that finishes. While ANY job
// row is still researching, poll the jobs list so the badge surfaces on its own —
// independent of whether the pursuit panel is open (the pursuit poll dies when
// the panel closes). Re-render only on an actual status change, so a stable
// researching window doesn't churn the table or clobber an inline edit elsewhere.
let jobsDraftPoll = null;
function syncJobsDraftPoll() {
  const drafting = state.jobs.some(j => j.outreach_draft_status === "researching");
  if (drafting && !jobsDraftPoll) {
    jobsDraftPoll = setInterval(pollJobsDraftStatus, 4000);
  } else if (!drafting && jobsDraftPoll) {
    clearInterval(jobsDraftPoll);
    jobsDraftPoll = null;
  }
}
async function pollJobsDraftStatus() {
  let data;
  try {
    const r = await fetch("/api/postings");
    if (!r.ok) return;
    data = await r.json();
  } catch { return; }
  const rows = data.rows || [];
  const prev = new Map(state.jobs.map(j => [j.posting_id, j.outreach_draft_status]));
  const changed = rows.some(j => prev.get(j.posting_id) !== j.outreach_draft_status)
    || rows.length !== state.jobs.length;
  state.jobs = rows;
  if (changed) {
    renderJobs();
    rebindPursuitRow();
  }
  syncJobsDraftPoll(); // stop once nothing is researching
}

// loadStatusVocab fetches the two configurable status vocabularies (application
// stages + outreach statuses) that drive the jobs-view dropdowns. Cheap; loaded
// at boot and after the Settings editors save. Re-renders the jobs view + filter
// dropdowns so a vocab change shows immediately.
async function loadStatusVocab() {
  await Promise.all([
    fetch("/api/application-stages").then(r => r.ok ? r.json() : null).then(d => {
      if (d && Array.isArray(d.statuses) && d.statuses.length) state.applicationStages = d.statuses;
    }).catch(() => {}),
    fetch("/api/outreach-statuses").then(r => r.ok ? r.json() : null).then(d => {
      if (d && Array.isArray(d.statuses) && d.statuses.length) state.outreachStatuses = d.statuses;
    }).catch(() => {}),
    fetch("/api/followup-interval").then(r => r.ok ? r.json() : null).then(d => {
      if (d && Number.isInteger(d.days)) state.followupInterval = d.days;
    }).catch(() => {}),
    fetch("/api/followup-template").then(r => r.ok ? r.json() : null).then(d => {
      if (d && typeof d.content === "string") state.followupTemplate = d.content;
    }).catch(() => {}),
  ]);
  renderFilterMenus();
  if (state.view === "jobs") renderJobs();
}

// ---- view tabs ----
// render:false applies only the visibility toggle (used at boot, to restore the
// saved tab without wiping the skeleton with an empty-state before data loads).
function setView(v, { render = true } = {}) {
  state.view = v;
  try { localStorage.setItem("scout-view", v); } catch {}
  document.getElementById("tab-companies").classList.toggle("active", v === "companies");
  document.getElementById("tab-jobs").classList.toggle("active", v === "jobs");
  document.getElementById("companies-view").style.display = v === "companies" ? "" : "none";
  document.getElementById("jobs-view").style.display = v === "jobs" ? "" : "none";
  // Each view owns its own Filter block — state stays put across switches.
  document.getElementById("block-filter-companies").style.display = v === "companies" ? "" : "none";
  document.getElementById("block-filter-jobs").style.display = v === "jobs" ? "" : "none";
  renderColumnsMenu(); // the Columns dropdown follows the active view
  if (render) { if (v === "jobs") renderJobs(); else renderList(); }
}

async function loadStats() {
  let s;
  try {
    const r = await fetch("/api/stats");
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    s = await r.json();
  } catch (e) {
    console.warn(`stats failed: ${e.message}`);
    return;
  }
  state.stats = s;
  renderStats();
}

function renderStats() {
  // Verdict counts now ride the Verdict dropdown (see syncCompanyFilterCounts);
  // stats only feed the Criteria block (source + playbook) now.
  renderCriteria();
}


function compare(a, b, k) {
  const av = a[k] ?? ""; const bv = b[k] ?? "";
  if (k === "headcount") return (av|0) - (bv|0);
  if (k === "verdict") {
    const order = { yes: 0, maybe: 1, no: 2, "": 3 };
    return (order[av] ?? 3) - (order[bv] ?? 3);
  }
  return String(av).localeCompare(String(bv));
}

function sortRows(rows) {
  return rows.slice().sort((a, b) => state.sort.dir * compare(a, b, state.sort.k));
}

// Reflect the active sort onto its column header so the CSS arrow (data-sort)
// renders — otherwise a sorted table gives no hint which column drives it.
function syncSortIndicator(table, attr, sort) {
  document.querySelectorAll(`#${table} thead th[${attr}]`).forEach(th => {
    if (th.getAttribute(attr) === sort.k) th.dataset.sort = sort.dir < 0 ? "desc" : "asc";
    else delete th.dataset.sort;
  });
}

// Companies-view filter, surfaced as one "Verdict" dropdown: a verdict checklist
// (held in verdictFilter; empty = all) plus two quick toggles folded in below.
const verdictFilter = new Set();   // "yes"/"maybe"/"no"/"__none__" (unscored); empty = no filter
let flagOnly = false;              // show flagged companies only
let enrichedOnly = false;          // show only cleanly-enriched companies

const VERDICT_ITEMS = [
  ["yes", "yes", "fdrop-dot--yes"],
  ["maybe", "maybe", "fdrop-dot--maybe"],
  ["no", "no", "fdrop-dot--no"],
  ["__none__", "unscored", "fdrop-dot--none"],
];

// renderCompanyFilterMenu builds the companies "Filters" dropdown: a Verdict
// checklist plus a divided Flags section (flagged / enriched). Counts are filled
// in by syncCompanyFilterCounts on each renderList.
function renderCompanyFilterMenu() {
  const menu = document.getElementById("fdrop-cfilters-menu");
  if (!menu) return;
  menu.innerHTML = `<div class="fdrop-head">Verdict</div>`
    + VERDICT_ITEMS.map(([v, label, dot]) => fdropItem("data-v", v, label, dot, verdictFilter.has(v))).join("")
    + `<div class="fdrop-sep"></div><div class="fdrop-head">Flags</div>`
    + fdropItem("data-toggle", "flagged", "⚑ Flagged", "", flagOnly)
    + fdropItem("data-toggle", "enriched", "Enriched", "", enrichedOnly);
  syncCompanyFilterCounts();
}

// syncCompanyFilterCounts tallies verdicts/flags over the loaded companies and
// updates the menu item counts + the Filters button badge.
function syncCompanyFilterCounts() {
  const n = { yes: 0, maybe: 0, no: 0, __none__: 0 };
  let flaggedN = 0, enrichedN = 0;
  for (const r of state.rows) {
    const key = r.verdict || "__none__";
    n[key] = (n[key] | 0) + 1;
    if (r.flagged) flaggedN++;
    if (r.enriched) enrichedN++;
  }
  writeItemCounts("#fdrop-cfilters-menu [data-v]", "data-v", n);
  const fc = document.querySelector('#fdrop-cfilters-menu [data-toggle="flagged"] [data-count]');
  if (fc) fc.textContent = flaggedN || "";
  const ec = document.querySelector('#fdrop-cfilters-menu [data-toggle="enriched"] [data-count]');
  if (ec) ec.textContent = enrichedN || "";
  const active = verdictFilter.size + (flagOnly ? 1 : 0) + (enrichedOnly ? 1 : 0);
  setFilterBadge("fdrop-cfilters-btn", active, active > 0);
}

function filtered() {
  const q = document.getElementById("q").value.trim().toLowerCase();
  return state.rows.filter(r => {
    if (verdictFilter.size && !verdictFilter.has(r.verdict || "__none__")) return false;
    if (flagOnly && !r.flagged) return false;
    if (enrichedOnly && !r.enriched) return false;
    if (q) {
      const hay = (r.name + " " + (r.vertical||"") + " " + (r.reason||"")).toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

// ---- column visibility ----
// Every column except the row anchor (name / company) can be hidden. Each view
// has its own column set and its own persisted hidden-keys, and the sidebar
// Columns block always shows the ACTIVE view's toggles.
const COLUMNS = [
  { k: "flag",     label: "flag" },
  { k: "verdict",  label: "verdict" },
  { k: "reason",   label: "reason" },
  { k: "vertical", label: "vertical" },
  { k: "location", label: "location" },
  { k: "hc",       label: "hc" },
  { k: "stage",    label: "stage" },
  { k: "reviewed", label: "reviewed" },
  { k: "site",     label: "site" },
];
const JCOLUMNS = [
  { k: "application",   label: "application" },
  { k: "outreach",      label: "outreach" },
  { k: "last_outreach", label: "last outreach" },
  { k: "contacts",      label: "contacts" },
  { k: "link",          label: "link" },
];

function loadHidden(key) {
  try { return new Set(JSON.parse(localStorage.getItem(key) || "[]")); }
  catch { return new Set(); }
}
const hiddenCols = loadHidden("scout-hidden-cols");   // companies table
const jHiddenCols = loadHidden("scout-hidden-jcols"); // jobs table

// colState resolves the active view's column set, hidden-keys, and store key.
function colState() {
  return state.view === "jobs"
    ? { cols: JCOLUMNS, hidden: jHiddenCols, key: "scout-hidden-jcols" }
    : { cols: COLUMNS, hidden: hiddenCols, key: "scout-hidden-cols" };
}

function applyColumnVisibility() {
  document.querySelectorAll("#t [data-col]").forEach(el => {
    el.style.display = hiddenCols.has(el.dataset.col) ? "none" : "";
  });
  document.querySelectorAll("#jt [data-col]").forEach(el => {
    el.style.display = jHiddenCols.has(el.dataset.col) ? "none" : "";
  });
}

// renderColumnsMenu paints the active view's column checklist into the Columns
// dropdown (checked = visible). Clicks are delegated (wired once at boot), so a
// re-render on view-switch doesn't need to rebind. The button stays visually
// quiet — a muted count of hidden columns, no lit "filter active" state.
function renderColumnsMenu() {
  const cs = colState();
  const menu = document.getElementById("fdrop-columns-menu");
  if (!menu) return;
  menu.innerHTML = `<div class="fdrop-head">Visible columns</div>`
    + cs.cols.map(c => fdropItem("data-col", c.k, c.label, "", !cs.hidden.has(c.k))).join("");
  updateColumnsBadge();
}
function updateColumnsBadge() {
  const cs = colState();
  const hidden = cs.cols.filter(c => cs.hidden.has(c.k)).length;
  const b = document.querySelector("#fdrop-columns-btn .fdrop-count");
  if (b) { b.textContent = hidden || ""; b.style.display = hidden ? "" : "none"; }
}

// companyRowCells is the single source of truth for a company row's innards,
// shared by the full render and the in-place targeted patch.
function companyRowCells(r) {
  return `
      <td class="td-flag" data-col="flag"><button class="flag-btn${r.flagged ? " is-on" : ""}" data-id="${r.company_id}" title="${r.flagged ? "unflag" : "flag"}">${FLAG_SVG}</button></td>
      <td data-col="verdict"><span class="${pillClass(r.verdict)}">${escapeHTML(r.verdict || "—")}</span></td>
      <td><span class="row-name" data-id="${r.company_id}">${escapeHTML(r.name)}</span></td>
      <td class="reason" data-col="reason">${escapeHTML(r.reason || "")}</td>
      <td data-col="vertical">${escapeHTML(r.vertical || "")}</td>
      <td data-col="location">${escapeHTML(r.location || "")}</td>
      <td data-col="hc">${r.headcount || ""}</td>
      <td data-col="stage">${escapeHTML(r.stage || "")}</td>
      <td data-col="reviewed" class="muted" title="${escapeHTML(r.reviewed_at || "never reviewed")}">${r.reviewed_at ? escapeHTML(r.reviewed_at.slice(0, 10)) : "—"}</td>
      <td data-col="site">${r.website_url ? `<a href="${safeHref(r.website_url)}" target="_blank" rel="noopener" title="open website" aria-label="open website">↗</a>` : ""}</td>
    `;
}

// bindCompanyRow wires the flag button. The row-open click lives on the <tr>
// itself (set once at create), so it survives an innerHTML swap and is NOT
// re-added here — only the flag button, which is a replaced child.
function bindCompanyRow(tr) {
  const b = tr.querySelector(".flag-btn");
  if (b) b.addEventListener("click", () => onToggleFlag(b.dataset.id));
}

// ---- skeleton loading ----
// Column maps mirror the real row cells (data-col attr + a representative bar
// width per column) so the shimmer placeholders line up with the table and
// honor column-visibility toggles. `null` col = always-visible column (name).
const COMPANY_SKEL_COLS = [
  ["flag", "14px"], ["verdict", "46px"], [null, "62%"], ["reason", "85%"],
  ["vertical", "70%"], ["location", "60%"], ["hc", "26px"], ["stage", "55%"],
  ["reviewed", "44px"], ["site", "38px"],
];
const JOBS_SKEL_COLS = [
  [null, "72%"], ["applied", "58px"], ["response", "54px"], ["outreach", "22px"],
  ["last_outreach", "58px"], ["contacts", "55%"], ["link", "32px"],
];

// renderSkeleton paints shimmer placeholder rows into a table body while its
// first fetch is in flight. renderList/renderJobs wipe the tbody when real data
// lands, so this is purely the loading frame — it never needs explicit removal.
// Flexible (%) columns get a per-row jitter so the bars don't form a rigid grid.
function renderSkeleton(tbodySel, cols, n = 7) {
  const tbody = document.querySelector(tbodySel);
  if (!tbody) return;
  const jitter = [1, 0.82, 0.7, 0.95, 0.76, 0.9, 0.85];
  let html = "";
  for (let i = 0; i < n; i++) {
    const cells = cols.map(([col, w]) => {
      const width = w.endsWith("%")
        ? Math.round(parseFloat(w) * jitter[i % jitter.length]) + "%"
        : w;
      const attr = col ? ` data-col="${col}"` : "";
      return `<td${attr}><span class="skel" style="width:${width}"></span></td>`;
    }).join("");
    html += `<tr class="skel-row" aria-hidden="true">${cells}</tr>`;
  }
  tbody.innerHTML = html;
  applyColumnVisibility();
}

function renderList() {
  const tbody = document.querySelector("#t tbody");
  tbody.innerHTML = "";
  const rows = sortRows(filtered());
  syncCompanyFilterCounts(); // refresh the Verdict dropdown counts + badge
  document.getElementById("empty").style.display = rows.length ? "none" : "block";
  for (const r of rows) {
    const tr = document.createElement("tr");
    tr.dataset.id = r.company_id;
    tr.innerHTML = companyRowCells(r);
    // The whole row opens the detail pane; clicks on the site ↗ link or the
    // flag button do their own thing instead (closest() guards them).
    tr.addEventListener("click", e => {
      if (e.target.closest("a, .flag-btn")) return;
      openDetail(tr.dataset.id);
    });
    tbody.appendChild(tr);
    bindCompanyRow(tr);
  }
  syncSortIndicator("t", "data-k", state.sort);
  applyColumnVisibility();
}

// updateCompanyRows refetches the list and patches only the given rows in
// place — no tbody wipe, so the table doesn't flash on a targeted re-score with
// the side panel open. Falls back to a full renderList if the visible set or
// order would change (e.g. a new verdict re-sorts the table, or a company drops
// out of the active filter), so we never leave a stale or missing row.
async function updateCompanyRows(ids) {
  const r = await fetch("/api/companies");
  const data = await r.json();
  state.rows = data.rows || [];

  const tbody = document.querySelector("#t tbody");
  const want = sortRows(filtered()).map(x => x.company_id);
  const have = [...tbody.querySelectorAll("tr")].map(tr => tr.dataset.id);
  if (want.length !== have.length || want.some((id, i) => id !== have[i])) {
    renderList();
    return;
  }
  for (const id of ids) {
    const fresh = state.rows.find(x => x.company_id === id);
    const tr = tbody.querySelector(`tr[data-id="${CSS.escape(id)}"]`);
    if (!fresh || !tr) { renderList(); return; }
    tr.innerHTML = companyRowCells(fresh);
    bindCompanyRow(tr);
  }
  applyColumnVisibility();
}

// ---- jobs view ----
// The tracker: one row per saved posting, company name + application lifecycle
// (everything else lives in the side panel). The jobs Filter block is its own:
// a search box (matches title/company/location/description/contacts) plus two
// multi-select dropdowns —
//   • Application — an explicit-inclusion stage checklist, including a
//     "not applied" item (the empty stage). Default is every stage except
//     "rejected", plus "not applied" (this folds in the old "hide rejected"
//     default while still showing un-applied roles).
//   • Outreach — two quick toggles (next up / not reached out) plus a reply-
//     status checklist where an empty selection means "all".
let jobStageSel = null;          // Set<stage>; null until the first vocab load seeds it
let knownStages = null;          // last vocab seen, so new stages can default visible
let nextUpOnly = false;          // postings queued next up for outreach
let notReachedOnly = false;      // postings with zero outreach logged yet
let dueOnly = false;             // postings with a follow-up due today/overdue
const outreachSel = new Set();   // checked reply statuses ("" = none); empty = all

// reconcileStageSel keeps jobStageSel sensible across vocab changes: seed it to
// all-but-rejected on first run, then on a vocab edit drop stages that are gone
// and default genuinely-new stages to visible (a new "rejected" stays hidden).
function reconcileStageSel() {
  const all = state.applicationStages;
  if (jobStageSel === null) {
    // "" is the "not applied" bucket — shown by default (was: no-stage always shows).
    jobStageSel = new Set(["", ...all.filter(s => s !== "rejected")]);
  } else {
    for (const s of [...jobStageSel]) if (s !== "" && !all.includes(s)) jobStageSel.delete(s);
    if (knownStages) for (const s of all) if (s !== "rejected" && !knownStages.has(s)) jobStageSel.add(s);
  }
  knownStages = new Set(all);
}

function filteredJobs() {
  reconcileStageSel();
  const q = document.getElementById("jq").value.trim().toLowerCase();
  return state.jobs.filter(j => {
    const stage = j.application_status || "";
    if (!jobStageSel.has(stage)) return false;   // "" = the "not applied" filter item
    if (nextUpOnly && !j.next_up) return false;
    if (notReachedOnly && (j.outreach_count|0) > 0) return false;
    if (dueOnly && !(j.followups_due|0)) return false;
    if (outreachSel.size && !outreachSel.has(j.outreach_status || "")) return false;
    if (q) {
      const hay = (j.title + " " + j.company + " " + (j.location||"") + " " + (j.description||"") + " " + (j.contacts||"")).toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

// ---- jobs-view filter dropdowns ----
// fdropItem renders one checklist row: a checkbox, an optional color dot (the
// per-vocab .sc-N palette), a label, and a count slot filled in by syncFilterCounts.
function fdropItem(attr, key, label, dot, checked) {
  return `<button class="fdrop-item${checked ? " is-checked" : ""}" ${attr}="${escapeHTML(key)}" role="menuitemcheckbox" aria-checked="${checked}">`
    + `<span class="fdrop-check" aria-hidden="true"></span>`
    + (dot ? `<span class="fdrop-dot ${dot}"></span>` : "")
    + `<span class="fdrop-label">${escapeHTML(label)}</span>`
    + `<span class="fdrop-item-count" data-count></span></button>`;
}

// renderFilterMenus rebuilds the jobs "Filters" menu — application stage, the
// next-up/not-reached quick toggles, and the reply-status checklist, all in one
// panel. Called on vocab load and on structural selection changes (e.g. the
// footer's "show rejected" link flipping a selection the user didn't click).
function renderFilterMenus() {
  reconcileStageSel();
  const menu = document.getElementById("fdrop-jfilters-menu");
  if (!menu) return;
  menu.innerHTML = `<div class="fdrop-head">Application stage</div>`
    + fdropItem("data-stage", "", "not applied", "", jobStageSel.has(""))
    + state.applicationStages.map(s => fdropItem("data-stage", s, s, stageColorClass(s), jobStageSel.has(s))).join("")
    + `<div class="fdrop-sep"></div><div class="fdrop-head">Quick filters</div>`
    + fdropItem("data-toggle", "nextup", "★ Next up", "", nextUpOnly)
    + fdropItem("data-toggle", "notreached", "Not reached out", "", notReachedOnly)
    + `<div class="fdrop-sep"></div><div class="fdrop-head">Reply status</div>`
    + [["", "none", ""]].concat(state.outreachStatuses.map(s => [s, s, statusColorClass(s)]))
        .map(([v, label, dot]) => fdropItem("data-status", v, label, dot, outreachSel.has(v))).join("");
  syncFilterCounts();
}

// syncFilterCounts updates the per-item tallies and the Filters button badge
// from the full jobs list — cheap, called on every renderJobs so counts track edits.
function syncFilterCounts() {
  const stageN = {}, statusN = {};
  let nextN = 0, notReachedN = 0;
  for (const j of state.jobs) {
    const st = j.application_status || "";
    stageN[st] = (stageN[st] | 0) + 1;   // includes "" (not applied)
    const os = j.outreach_status || "";
    statusN[os] = (statusN[os] | 0) + 1;
    if (j.next_up) nextN++;
    if (!(j.outreach_count | 0)) notReachedN++;
  }
  writeItemCounts("#fdrop-jfilters-menu [data-stage]", "data-stage", stageN);
  writeItemCounts("#fdrop-jfilters-menu [data-status]", "data-status", statusN);
  setToggleCount("nextup", nextN);
  setToggleCount("notreached", notReachedN);
  // The badge counts every active narrowing in the panel: stages (when changed
  // from the all-but-rejected default) + the two toggles + reply-status picks.
  const def = ["", ...state.applicationStages.filter(s => s !== "rejected")];
  const appDefault = jobStageSel && jobStageSel.size === def.length && def.every(s => jobStageSel.has(s));
  const n = (appDefault ? 0 : (jobStageSel ? jobStageSel.size : 0))
    + (nextUpOnly ? 1 : 0) + (notReachedOnly ? 1 : 0) + outreachSel.size;
  setFilterBadge("fdrop-jfilters-btn", n, n > 0);
}
function writeItemCounts(sel, attr, counts) {
  document.querySelectorAll(sel).forEach(el => {
    const span = el.querySelector("[data-count]");
    if (span) { const c = counts[el.getAttribute(attr)] | 0; span.textContent = c || ""; }
  });
}
function setToggleCount(toggle, n) {
  const span = document.querySelector(`#fdrop-jfilters-menu [data-toggle="${toggle}"] [data-count]`);
  if (span) span.textContent = n || "";
}
function setFilterBadge(btnId, n, active) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.classList.toggle("is-active", active);
  const b = btn.querySelector(".fdrop-count");
  if (b) { const show = active && n > 0; b.textContent = show ? n : ""; b.style.display = show ? "" : "none"; }
}
// setItemChecked flips a single menu row's checkbox in place (no innerHTML rebuild).
function setItemChecked(it, on) {
  it.classList.toggle("is-checked", on);
  it.setAttribute("aria-checked", String(on));
}
function closeAllDropdowns() {
  document.querySelectorAll(".fdrop.is-open").forEach(d => {
    d.classList.remove("is-open");
    const btn = d.querySelector(".fdrop-btn");
    if (btn) btn.setAttribute("aria-expanded", "false");
  });
}
// The menus are position:fixed so the sidebar's overflow can't clip them. That
// means JS owns their coordinates: anchor under the button, match its width, and
// cap the height to the room below (it scrolls if a tall panel won't fit).
function positionMenu(drop) {
  const btn = drop.querySelector(".fdrop-btn");
  const menu = drop.querySelector(".fdrop-menu");
  if (!btn || !menu) return;
  const r = btn.getBoundingClientRect();
  menu.style.left = Math.round(r.left) + "px";
  menu.style.top = Math.round(r.bottom + 4) + "px";
  menu.style.minWidth = Math.round(r.width) + "px";
  menu.style.maxHeight = Math.max(160, Math.round(window.innerHeight - r.bottom - 12)) + "px";
}
function openDropdown(drop) {
  const btn = drop.querySelector(".fdrop-btn");
  drop.classList.add("is-open");
  if (btn) btn.setAttribute("aria-expanded", "true");
  positionMenu(drop);
}
// Keep an open menu glued to its button when the sidebar (or window) scrolls or
// resizes. Capture phase so it catches scroll from the overflow:auto sidebar.
function repositionOpenDropdown() {
  const drop = document.querySelector(".fdrop.is-open");
  if (drop) positionMenu(drop);
}
window.addEventListener("scroll", repositionOpenDropdown, true);
window.addEventListener("resize", repositionOpenDropdown);

const RE_EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;

// parseContacts turns the stored contacts value into [{position, email}] entries.
// The current format is a JSON array; legacy free-form strings ("VP Eng
// <jane@a.com>, cto@b.io") still parse — each comma-part's email-shaped token
// becomes the email and the remainder (minus brackets/separators) the position.
function parseContacts(s) {
  s = String(s || "").trim();
  if (!s) return [];
  if (s[0] === "[") {
    try {
      const a = JSON.parse(s);
      if (Array.isArray(a)) {
        return a
          .map(c => ({ position: String(c?.position || "").trim(), email: String(c?.email || "").trim() }))
          .filter(c => c.position || c.email);
      }
    } catch { /* fall through to legacy parse */ }
  }
  return s.split(",").map(t => t.trim()).filter(Boolean).map(part => {
    const m = part.match(RE_EMAIL);
    const email = m ? m[0] : "";
    let position = email ? part.replace(email, "") : part;
    position = position.replace(/[<>()]/g, "").replace(/[\s:–—-]+$/, "").trim();
    return { position, email };
  });
}

const isoToday = () => new Date().toISOString().slice(0, 10);

// ---- application stage (configurable vocab, single label) ----
// application_status is one configurable label (the current stage), mirroring
// outreach_status. "" = none.
// stageOptions builds the <select> options for a stage control: "none" plus the
// configured stages, and the posting's current stage even if it's no longer in
// the configured list (so a vocab change never silently drops a stored value).
function stageOptions(current) {
  const opts = [["", "none"]];
  for (const s of state.applicationStages) opts.push([s, s]);
  if (current && !state.applicationStages.includes(current)) opts.push([current, current + " (removed)"]);
  return opts;
}
// statusOptions does the same for the outreach reply status.
function statusOptions(current) {
  const opts = [["", "none"]];
  for (const s of state.outreachStatuses) opts.push([s, s]);
  if (current && !state.outreachStatuses.includes(current)) opts.push([current, current + " (removed)"]);
  return opts;
}
// VOCAB_COLORS is the size of the pill palette (see .sc-N in style.css). A
// value's color is fixed by its position in its configurable vocabulary, so each
// stage / status gets a distinct, stable color. "" (none) and removed values get
// no color class (the muted default).
const VOCAB_COLORS = 8;
function vocabColorClass(value, list) {
  const i = (list || []).indexOf(value);
  return i < 0 ? "" : "sc-" + (i % VOCAB_COLORS);
}
function stageColorClass(stage) { return vocabColorClass(stage, state.applicationStages); }
function statusColorClass(status) { return vocabColorClass(status, state.outreachStatuses); }

// contactsHTML renders the stored contacts as comma-separated entries — each is
// the position (or the email when none), linked as a mailto when an email exists.
function contactsHTML(s) {
  const cs = parseContacts(s);
  if (!cs.length) return '<span class="dim">—</span>';
  return cs.map(c => {
    const label = escapeHTML(c.position || c.email);
    if (!c.email) return label;
    const tip = escapeHTML(c.position ? `${c.position} — ${c.email}` : c.email);
    return `<a href="mailto:${escapeHTML(c.email)}" title="${tip}">${label}</a>`;
  }).join('<span class="dim">, </span>');
}

// stageOrder ranks a posting by its current application stage for sorting,
// using the configured progression order (untracked sinks to the end).
function stageOrder(j) {
  const s = j.application_status || "";
  if (!s) return state.applicationStages.length + 1;
  const i = state.applicationStages.indexOf(s);
  return i < 0 ? state.applicationStages.length : i;
}

function compareJobs(a, b, k) {
  if (k === "verdict") {
    const order = { yes: 0, maybe: 1, no: 2, "": 3 };
    return (order[a.verdict] ?? 3) - (order[b.verdict] ?? 3);
  }
  if (k === "application")
    return stageOrder(a) - stageOrder(b);
  if (k === "followups_due")
    return (b.followups_due|0) - (a.followups_due|0); // most follow-ups due first
  if (k === "created_at" || k === "last_outreach_at") {
    // Newest first on the first click; blanks sink regardless of direction.
    const av = a[k] || "", bv = b[k] || "";
    if (!av && !bv) return 0;
    if (!av) return state.jsort.dir;   // undo the outer dir so blanks stay last
    if (!bv) return -state.jsort.dir;
    return String(bv).localeCompare(String(av));
  }
  return String(a[k] ?? "").localeCompare(String(b[k] ?? ""));
}

// renderFollowupBanner shows "N follow-ups due" above the jobs table with a
// one-click filter to just those postings (M51). Total is over ALL postings (not
// the current filter); when it drops to zero the banner hides and the due-only
// filter releases so the table never strands empty.
function renderFollowupBanner() {
  const banner = document.getElementById("jobs-followup-banner");
  if (!banner) return;
  const due = state.jobs.reduce((n, j) => n + (j.followups_due | 0), 0);
  if (!due) {
    banner.style.display = "none";
    dueOnly = false;
    return;
  }
  banner.style.display = "";
  banner.classList.toggle("is-filtered", dueOnly);
  banner.innerHTML =
    `<span class="fb-icon">⏰</span>`
    + `<span class="fb-text"><strong>${due}</strong> follow-up${due > 1 ? "s" : ""} due</span>`
    + `<button class="btn fb-toggle">${dueOnly ? "show all jobs" : "show only these"}</button>`;
  banner.querySelector(".fb-toggle").onclick = () => { dueOnly = !dueOnly; renderJobs(); };
}

function renderJobs() {
  const tbody = document.querySelector("#jt tbody");
  tbody.innerHTML = "";
  renderFollowupBanner();
  const rows = filteredJobs().sort((a, b) => state.jsort.dir * compareJobs(a, b, state.jsort.k));
  document.getElementById("jobs-empty").style.display = rows.length ? "none" : "block";
  // Refresh the dropdown item counts + button badges against the live data.
  syncFilterCounts();
  // Say what the rejected-stage default is suppressing — a silently missing row
  // reads as a bug. The table gets a footer note with a one-click undo.
  const hiddenRej = (jobStageSel && !jobStageSel.has("rejected"))
    ? state.jobs.filter(j => (j.application_status || "") === "rejected").length : 0;
  const note = document.getElementById("jobs-hidden-note");
  note.style.display = hiddenRej ? "" : "none";
  if (hiddenRej) {
    note.innerHTML = `${hiddenRej} rejected application${hiddenRej > 1 ? "s" : ""} hidden — <a id="show-rejected-link">show</a>`;
    document.getElementById("show-rejected-link").onclick = () => {
      jobStageSel.add("rejected");
      renderFilterMenus();   // re-check the rejected row in the Application menu
      renderJobs();
    };
  }
  for (const j of rows) {
    const stage = j.application_status || "";
    const tr = document.createElement("tr");
    tr.dataset.id = j.posting_id;        // the pursuit panel keys on the posting
    // The application-stage and outreach cells carry inline controls so the
    // common lifecycle bumps don't require opening the pursuit panel.
    const stOpts = stageOptions(stage).map(([v, label]) =>
      `<option value="${escapeHTML(v)}"${stage === v ? " selected" : ""}>${escapeHTML(label)}</option>`).join("");
    const ostatus = j.outreach_status || "";
    const osOpts = statusOptions(ostatus).map(([v, label]) =>
      `<option value="${escapeHTML(v)}"${ostatus === v ? " selected" : ""}>${escapeHTML(label)}</option>`).join("");
    tr.innerHTML = `
      <td><div class="jt-namecell"><button class="jt-nextup${j.next_up ? " is-on" : ""}" title="${j.next_up ? "queued next up for outreach — click to remove" : "mark next up for outreach"}" aria-label="next up">${j.next_up ? "★" : "☆"}</button><div class="jt-namecol"><span class="row-name">${escapeHTML(j.title || j.company)}</span>${draftBadgeHTML(j.outreach_draft_status)}${j.title ? `<div class="small dim">${escapeHTML(j.company)}</div>` : ""}</div></div></td>
      <td data-col="application"><div class="jt-stage"><select class="jt-stage-sel ${stageColorClass(stage)}" title="application stage">${stOpts}</select></div></td>
      <td class="small" data-col="outreach"><div class="jt-out"><select class="jt-ostatus ${statusColorClass(ostatus)}" title="outreach reply status">${osOpts}</select>${j.followups_due ? `<span class="followup-badge" title="${j.followups_due} follow-up${j.followups_due > 1 ? "s" : ""} due — open to act">⏰ ${j.followups_due}</span>` : ""}</div></td>
      <td class="small" data-col="last_outreach">${j.last_outreach_at ? escapeHTML(j.last_outreach_at) : '<span class="dim">—</span>'}</td>
      <td class="small td-contacts" data-col="contacts">${contactsHTML(j.contacts)}</td>
      <td data-col="link"><a href="${safeHref(j.url)}" target="_blank" rel="noopener">open ↗</a></td>
    `;
    // Wire the inline controls to the cached row (the table re-renders from it).
    tr.querySelector(".jt-nextup").onclick = () => toggleNextUp(j, false);
    tr.querySelector(".jt-stage-sel").onchange = e => saveRowTracking(j, { application_status: e.target.value });
    tr.querySelector(".jt-ostatus").onchange = e =>
      saveRowTracking(j, { outreach_status: e.target.value });
    tbody.appendChild(tr);
  }
  syncSortIndicator("jt", "data-jk", state.jsort);
  applyColumnVisibility();
  // Row click opens the pursuit panel (role + pipeline + the outreach queue);
  // the external link and the inline tracking controls are guarded out.
  tbody.querySelectorAll("tr").forEach(tr => {
    tr.addEventListener("click", e => {
      if (e.target.closest("a, button, select")) return;
      openPursuit(tr.dataset.id);
    });
  });
}

// draftBadgeHTML marks a row whose latest draft is sitting in the review queue
// (awaiting_review / no_hook) — the fire-and-forget "draft ready" signal. A
// researching draft gets an in-row spinner so the table shows a run is in flight
// without opening the panel.
function draftBadgeHTML(status) {
  if (status === "researching")
    return '<span class="draft-badge db-researching" title="drafting outreach…"><span class="spinner spinner-xs"></span>drafting</span>';
  if (status === "awaiting_review")
    return '<span class="draft-badge" title="an outreach draft is ready to review">draft ready</span>';
  if (status === "no_hook")
    return '<span class="draft-badge db-nohook" title="no honest hook — scout recommends not emailing">no hook</span>';
  return "";
}

// ---- pursuit panel (jobs-view side panel) ----
// Redesigned around THE PURSUIT, not the company: role header + pipeline
// (tracking) + the outreach review queue + a "view company" footer. Built from
// the clicked jobs row (it already carries posting + company fields); the
// outreach queue fetches drafts and polls while one is researching.
const pursuit = { postingId: null, row: null, drafts: [], poll: null, openHist: false,
                  answers: [], answersStatus: "", answersPoll: null, detecting: false,
                  contacts: [], outreach: [], contactsLoaded: false };

async function openPursuit(postingId) {
  let row = state.jobs.find(j => j.posting_id === postingId);
  if (!row) {
    // Opened from the company pane before the jobs cache caught up — refetch.
    await loadJobs();
    row = state.jobs.find(j => j.posting_id === postingId);
  }
  if (!row) { toast("posting not found — refresh"); return; }
  stopPursuitPoll();
  stopAnswersPoll();
  pursuit.postingId = postingId;
  pursuit.row = row;
  pursuit.drafts = [];
  pursuit.openHist = false;
  pursuit.answers = [];
  pursuit.detecting = false;
  pursuit.contacts = [];
  pursuit.outreach = [];
  pursuit.contactsLoaded = false;
  // Seed the header from the cached row's detection status so the Application
  // section reads right before the per-posting fetch returns.
  pursuit.answersStatus = row.questions_status || "";
  document.getElementById("pursuit-pane").classList.add("open");
  document.getElementById("pursuit-scrim").classList.add("open");
  document.getElementById("pursuit-pane").setAttribute("aria-hidden", "false");
  raisePane("pursuit");
  renderPursuit();
  loadDrafts();
  loadAnswers();
  loadContactsAndLog();
}

// loadContactsAndLog fetches the company's contacts and this posting's outreach
// log together, then re-renders the outreach section. Both feed the per-contact
// tracking + follow-up controls (M51).
async function loadContactsAndLog() {
  const pid = pursuit.postingId, cid = pursuit.row && pursuit.row.company_id;
  if (!pid || !cid) return;
  try {
    const [cs, log] = await Promise.all([
      fetch(`/api/companies/${cid}/contacts`).then(r => r.ok ? r.json() : []),
      fetch(`/api/postings/${pid}/outreach-log`).then(r => r.ok ? r.json() : []),
    ]);
    if (pursuit.postingId !== pid) return;   // panel moved on while we fetched
    pursuit.contacts = Array.isArray(cs) ? cs : [];
    pursuit.outreach = Array.isArray(log) ? log : [];
  } catch { /* keep whatever we have */ }
  pursuit.contactsLoaded = true;
  renderOutreachSection();
}

// The company pane and the pursuit panel can stack either way — open a company,
// then a posting (pursuit over company); or open a pursuit, then "View company"
// (company over pursuit). raisePane lifts whichever opened last to the top
// layer and drops the other to the base layer; chat (z 56/57) stays above both.
// topPane records the winner so Escape peels the top one first.
let topPane = null;
function raisePane(which) {
  topPane = which;
  const company = which === "company";
  document.getElementById("scrim").style.zIndex = company ? "54" : "52";
  document.getElementById("pane").style.zIndex = company ? "55" : "53";
  document.getElementById("pursuit-scrim").style.zIndex = company ? "52" : "54";
  document.getElementById("pursuit-pane").style.zIndex = company ? "53" : "55";
}

function closePursuit() {
  stopPursuitPoll();
  stopAnswersPoll();
  pursuit.postingId = null; pursuit.row = null; pursuit.drafts = [];
  pursuit.answers = []; pursuit.answersStatus = "";
  document.getElementById("pursuit-pane").classList.remove("open");
  document.getElementById("pursuit-scrim").classList.remove("open");
  document.getElementById("pursuit-pane").setAttribute("aria-hidden", "true");
}

function stopPursuitPoll() {
  if (pursuit.poll) { clearInterval(pursuit.poll); pursuit.poll = null; }
}

// loadDrafts fetches the posting's drafts (newest first) and renders the queue.
// While the newest draft is still researching, it keeps a ~4s poll alive so the
// open panel updates itself; the closed-panel path relies on the row badge.
async function loadDrafts() {
  if (!pursuit.postingId) return;
  let data;
  try {
    const r = await fetch(`/api/postings/${pursuit.postingId}/outreach`);
    if (!r.ok) { renderOutreachSection(); return; }
    data = await r.json();
  } catch { renderOutreachSection(); return; }
  pursuit.drafts = data.drafts || [];
  renderOutreachSection();
  const latest = pursuit.drafts[0];
  if (latest && latest.status === "researching") startPursuitPoll();
  else stopPursuitPoll();
}

function startPursuitPoll() {
  if (pursuit.poll) return;
  pursuit.poll = setInterval(loadDrafts, 4000);
}

// wireInlineField makes a seamless input/textarea auto-save Linear-style:
// commit on blur or Enter (Cmd/Ctrl+Enter for a textarea), revert on Esc.
// save(value) is async and may throw — the field flashes saved or rolls back
// and flashes error. Nothing changed → no request.
function wireInlineField(el, save, { multiline = false } = {}) {
  if (!el) return;
  let committed = el.value;
  el.addEventListener("focus", () => { committed = el.value; });
  el.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { e.preventDefault(); el.value = committed; el.blur(); }
    else if (e.key === "Enter" && (!multiline || e.metaKey || e.ctrlKey)) {
      e.preventDefault(); el.blur();
    }
  });
  el.addEventListener("blur", async () => {
    const val = el.value.trim();
    if (val === committed.trim()) { el.value = committed; return; }
    el.classList.remove("is-saved", "is-error");
    el.classList.add("is-saving");
    try {
      await save(val);
      committed = el.value;
      el.classList.remove("is-saving");
      el.classList.add("is-saved");
      setTimeout(() => el.classList.remove("is-saved"), 1200);
    } catch (err) {
      el.value = committed;                  // roll back to the last good value
      el.classList.remove("is-saving");
      el.classList.add("is-error");
      setTimeout(() => el.classList.remove("is-error"), 1600);
      toast(`save failed: ${err.message}`);
    }
  });
}

// savePostingField PUTs the posting's editable content with one field changed,
// folds the refreshed posting back into the cached row, and refreshes the jobs
// table — but never rebuilds the role body, so focus survives field-to-field.
async function savePostingField(j, key, val) {
  const body = {
    title: j.title || "", location: j.location || "", comp_range: j.comp_range || "",
    employment_type: j.employment_type || "", workplace_type: j.workplace_type || "",
    department: j.department || "", description: j.description || "",
    [key]: val,
  };
  const resp = await fetch(`/api/postings/${j.posting_id}/details`, {
    method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error((await resp.text().catch(() => "")).trim() || "HTTP " + resp.status);
  const fresh = await resp.json();
  Object.assign(j, {
    title: fresh.title, location: fresh.location,
    employment_type: fresh.employment_type, workplace_type: fresh.workplace_type,
    department: fresh.department, comp_range: fresh.comp_range, description: fresh.description,
  });
  renderJobs();   // the table shows the role title — keep it current
  syncCompanyPosting(j.posting_id, {   // the company pane beneath shows these too
    title: fresh.title, location: fresh.location,
  });
}

// savePostingURL changes the posting's link via its own validated endpoint (the
// URL is the row's identity). Folds the fresh url back in and re-points the open
// affordance; throws so wireInlineField rolls back and flashes the error.
async function savePostingURL(j, val) {
  const resp = await fetch(`/api/postings/${j.posting_id}/url`, {
    method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: val }),
  });
  if (!resp.ok) throw new Error((await resp.text().catch(() => "")).trim() || "HTTP " + resp.status);
  const fresh = await resp.json();
  j.url = fresh.url;
  const open = document.querySelector("#role-body .role-url-open");
  if (open) open.setAttribute("href", safeHref(j.url));
  syncCompanyPosting(j.posting_id, { url: fresh.url });
}

// reenrichPosting re-runs the capture/enrich pass on the posting's stored link
// (the same pipeline as the Add dialog) and folds the refreshed details back in,
// so a posting added by hand needn't have its fields re-typed. The button shows
// a busy state — the LLM path can take a while — and the panel re-renders with
// whatever came back; blanks are filled, stored detail is never erased server-side.
async function reenrichPosting(j, btn) {
  if (btn.disabled) return;
  const label = btn.textContent;
  btn.disabled = true;
  btn.textContent = "re-enriching…";
  let resp;
  try {
    resp = await fetch(`/api/postings/${j.posting_id}/recapture`, { method: "POST" });
  } catch (e) {
    btn.disabled = false; btn.textContent = label;
    toast(`re-enrich failed: ${e.message}`);
    return;
  }
  if (!resp.ok) {
    const txt = (await resp.text().catch(() => "")).trim();
    let msg = txt || "HTTP " + resp.status;
    try { msg = JSON.parse(txt).error || msg; } catch { /* plain-text error */ }
    btn.disabled = false; btn.textContent = label;
    toast(`re-enrich failed: ${msg}`);
    return;
  }
  const fresh = await resp.json();
  Object.assign(j, {
    title: fresh.title, location: fresh.location,
    employment_type: fresh.employment_type, workplace_type: fresh.workplace_type,
    department: fresh.department, comp_range: fresh.comp_range, description: fresh.description,
    posted_at: fresh.posted_at, url: fresh.url, questions_status: fresh.questions_status,
  });
  renderJobs();      // the table shows the role title — keep it current
  renderPursuit();   // rebuild the role body so the filled-in fields show
  syncCompanyPosting(j.posting_id, { title: fresh.title, location: fresh.location, url: fresh.url });
  toast("re-enriched from the posting link");
}

// wireRelinkCompany binds the "change" affordance in the role footer that opens
// the relink search modal — moving a posting to a different *existing* company
// is the fix for a job captured under the wrong company twin (e.g. "Automat" vs
// the "Automat AI" row that has the real enrichment). The modal itself is global
// markup wired once (see the relink-modal block below); here we only re-bind the
// per-render button to open it against the current row.
function wireRelinkCompany(j) {
  const edit = document.getElementById("pursuit-company-edit");
  if (edit) edit.addEventListener("click", () => openRelinkModal(j));
}

// savePostingCompany re-links the posting to an existing company via its own
// endpoint, folds the new company id/name back into the cached row, and
// refreshes everything keyed on the company (the row's verdict, the company
// pane name). Throws on failure so the caller can flash the error.
async function savePostingCompany(j, companyId) {
  const resp = await fetch(`/api/postings/${j.posting_id}/company`, {
    method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ company_id: companyId }),
  });
  if (!resp.ok) throw new Error((await resp.text().catch(() => "")).trim() || "HTTP " + resp.status);
  const fresh = await resp.json();
  j.company_id = fresh.company_id;
  j.company = fresh.company_name;
  renderPursuit();   // the footer link, verdict context, and outreach target all key on the company
  loadJobs();        // the jobs table carries the company name + the new company's verdict
}

// ---- relink search modal ----
// The "change" affordance opens a search-as-you-type picker over the companies
// already in the DB (state.rows), showing each candidate's verdict + vertical /
// location so twins are easy to tell apart. Picking one moves the posting via
// savePostingCompany. relinkRow holds the posting being moved while it's open.
let relinkRow = null;

function openRelinkModal(j) {
  relinkRow = j;
  const meta = document.getElementById("relink-current");
  if (meta) meta.textContent = j.company ? `currently: ${j.company}` : "";
  const search = document.getElementById("relink-search");
  if (search) search.value = "";
  renderRelinkResults("");
  document.getElementById("relink-scrim").classList.add("open");
  if (search) search.focus();
}

function closeRelinkModal() {
  document.getElementById("relink-scrim").classList.remove("open");
  relinkRow = null;
}

// ---- delete a company ----
// Irreversible: removes the company and every row hanging off it (postings,
// outreach drafts, application answers, enrichment, verdict, decision trail).
// Gated behind a confirm modal that names the company and counts what goes with
// it, so a stray click can't wipe a tracked pursuit.
let deleteCompanyTarget = null;

function openDeleteCompanyModal(d) {
  deleteCompanyTarget = d;
  const n = (d.postings || []).length;
  const jobs = n ? ` and its ${n} job ${n === 1 ? "posting" : "postings"}` : "";
  const summary = document.getElementById("delcompany-summary");
  if (summary) summary.innerHTML = `Delete <strong>${escapeHTML(d.name || "this company")}</strong>${jobs}?`;
  const confirmBtn = document.getElementById("delcompany-confirm");
  if (confirmBtn) confirmBtn.disabled = false;
  document.getElementById("delcompany-scrim").classList.add("open");
}

function closeDeleteCompanyModal() {
  document.getElementById("delcompany-scrim").classList.remove("open");
  deleteCompanyTarget = null;
}

async function onConfirmDeleteCompany() {
  const d = deleteCompanyTarget;
  if (!d) return;
  const btn = document.getElementById("delcompany-confirm");
  if (btn) btn.disabled = true;
  let resp;
  try {
    resp = await fetch(`/api/companies/${d.company_id}`, { method: "DELETE" });
  } catch (e) {
    toast(`delete failed: ${e.message}`);
    if (btn) btn.disabled = false;
    return;
  }
  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    toast(`delete failed: HTTP ${resp.status}${txt ? " — " + txt : ""}`);
    if (btn) btn.disabled = false;
    return;
  }
  const name = d.name || "company";
  closeDeleteCompanyModal();
  if (state.openId === d.company_id) closeDetail(); // the pane is now stale
  loadList();   // drop the row from the company table
  loadJobs();   // its postings are gone from the jobs view
  loadStats();  // sidebar by-verdict counts shift
  toast(`deleted ${name}`);
}

// Delete a single job posting — the jobs-view mirror of the company delete. The
// posting and its outreach drafts + application answers go; the company stays.
// Gated behind a confirm modal that names the posting so a stray click can't
// wipe a tracked pursuit.
let deleteJobTarget = null;

function openDeleteJobModal(j) {
  deleteJobTarget = j;
  const label = (j.title || "").trim() || "this posting";
  const at = j.company ? ` at <strong>${escapeHTML(j.company)}</strong>` : "";
  const summary = document.getElementById("deljob-summary");
  if (summary) summary.innerHTML = `Delete <strong>${escapeHTML(label)}</strong>${at}?`;
  const confirmBtn = document.getElementById("deljob-confirm");
  if (confirmBtn) confirmBtn.disabled = false;
  document.getElementById("deljob-scrim").classList.add("open");
}

function closeDeleteJobModal() {
  document.getElementById("deljob-scrim").classList.remove("open");
  deleteJobTarget = null;
}

async function onConfirmDeleteJob() {
  const j = deleteJobTarget;
  if (!j) return;
  const btn = document.getElementById("deljob-confirm");
  if (btn) btn.disabled = true;
  let resp;
  try {
    resp = await fetch(`/api/postings/${j.posting_id}`, { method: "DELETE" });
  } catch (e) {
    toast(`delete failed: ${e.message}`);
    if (btn) btn.disabled = false;
    return;
  }
  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    toast(`delete failed: HTTP ${resp.status}${txt ? " — " + txt : ""}`);
    if (btn) btn.disabled = false;
    return;
  }
  const label = (j.title || "").trim() || "posting";
  closeDeleteJobModal();
  closePursuit();                              // the panel is now stale
  loadJobs();                                  // drop the row from the jobs table
  if (state.openId === j.company_id) openDetail(j.company_id); // refresh the company pane's postings list
  toast(`deleted ${label}`);
}

// renderRelinkResults paints the filtered company list. Empty query → all
// companies (alphabetical); a query ranks prefix matches first, then any
// substring hit on the name. The current company is shown but not selectable.
function renderRelinkResults(query) {
  const box = document.getElementById("relink-results");
  if (!box) return;
  const q = query.trim().toLowerCase();
  let rows = (state.rows || []).slice();
  if (q) {
    rows = rows.filter(r => (r.name || "").toLowerCase().includes(q));
    rows.sort((a, b) => {
      const ap = (a.name || "").toLowerCase().startsWith(q) ? 0 : 1;
      const bp = (b.name || "").toLowerCase().startsWith(q) ? 0 : 1;
      return ap - bp || (a.name || "").localeCompare(b.name || "");
    });
  } else {
    rows.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  }
  rows = rows.slice(0, 60);
  if (!rows.length) {
    box.innerHTML = `<div class="relink-empty">${(state.rows || []).length ? "no company matches" : "no companies yet — Add one first"}</div>`;
    return;
  }
  const curId = relinkRow ? relinkRow.company_id : "";
  box.innerHTML = rows.map(r => {
    const current = r.company_id === curId;
    const sub = [r.vertical, r.location].filter(Boolean).map(escapeHTML).join(" · ");
    return `<button type="button" class="relink-result${current ? " is-current" : ""}"
        data-id="${r.company_id}"${current ? " disabled" : ""}>
        <span class="rr-main">
          <span class="rr-name">${escapeHTML(r.name || "—")}</span>
          ${sub ? `<span class="rr-sub">${sub}</span>` : ""}
        </span>
        <span class="${pillClass(r.verdict)} rr-verdict">${escapeHTML(r.verdict || "—")}</span>
        ${current ? `<span class="rr-current-tag">current</span>` : ""}
      </button>`;
  }).join("");
}

// chooseRelinkCompany moves the posting to the picked company and closes. A
// no-op (just close) if it's already the current one.
async function chooseRelinkCompany(companyId) {
  const j = relinkRow;
  if (!j) { closeRelinkModal(); return; }
  if (companyId === j.company_id) { closeRelinkModal(); return; }
  try {
    await savePostingCompany(j, companyId);
    closeRelinkModal();
    toast(`moved to ${j.company}`);
  } catch (err) {
    toast(`move failed: ${err.message}`);
  }
}

// saveCompanyField mirrors savePostingField for the company pane. Name is
// required server-side; blanking it throws, the field rolls back.
async function saveCompanyField(d, key, val) {
  const body = {
    name: d.name || "", headcount: d.headcount || "",
    funding_stage: d.funding_stage || "", location: d.location || "",
    vertical: d.vertical || "",
    [key]: val,
  };
  if (!String(body.name).trim()) throw new Error("name is required");
  const resp = await fetch(`/api/companies/${d.company_id}`, {
    method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error((await resp.text().catch(() => "")).trim() || "HTTP " + resp.status);
  const fresh = await resp.json();
  Object.assign(d, {
    name: fresh.name, headcount: fresh.headcount, funding_stage: fresh.funding_stage,
    location: fresh.location, vertical: fresh.vertical,
  });
  loadList();   // the company table shows the name
  loadJobs();   // job rows carry the company name too
}

// saveCompanyDomain attaches/changes the company's website. Unlike the other
// fields the domain is the row's identity, so the server re-keys the company
// and returns it under a (possibly new) id — re-point the open pane to it and
// refresh everything keyed on the company. 409 = another company owns it.
async function saveCompanyDomain(d, val) {
  const resp = await fetch(`/api/companies/${d.company_id}/domain`, {
    method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ website: val }),
  });
  if (!resp.ok) throw new Error((await resp.text().catch(() => "")).trim() || "HTTP " + resp.status);
  const fresh = await resp.json();
  state.openId = fresh.company_id;   // the id changes when the row is re-keyed
  renderDetail(fresh);               // rebuild the pane (controls key on the id)
  loadTrace(fresh.company_id);       // renderDetail reset the trail to a spinner
  loadList();                        // re-keyed row may have merged a twin away
  loadJobs();
}

// saveCompanyNotes persists the free-form notes. A plain field write — the
// server never reverse-writes this column, so we just fold the saved value back
// into the cached detail. No re-render (the textarea keeps focus/caret).
async function saveCompanyNotes(d, val) {
  const resp = await fetch(`/api/companies/${d.company_id}/notes`, {
    method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ notes: val }),
  });
  if (!resp.ok) throw new Error((await resp.text().catch(() => "")).trim() || "HTTP " + resp.status);
  const fresh = await resp.json();
  d.notes = fresh.notes;
}

// renderPursuit lays out the whole panel: role header, pipeline, outreach,
// footer. The outreach queue is re-rendered on its own (renderOutreachSection)
// so polling doesn't rebuild the pipeline controls under the user's cursor.
// Tracks which posting the pursuit body currently shows, so a re-render of the
// same posting (the run-end / poll refresh path) can keep the user's scroll
// instead of jumping to the top — the pursuit-pane equivalent of openDetail's
// in-place refresh. A genuine open (different posting) resets to the top.
let pursuitRenderedId: string | null = null;

function renderPursuit() {
  const j = pursuit.row;
  if (!j) return;
  const pbody = document.getElementById("pursuit-body");
  const samePosting = !!pbody && pursuitRenderedId === j.posting_id
    && document.getElementById("pursuit-pane").classList.contains("open");
  const prevScroll = samePosting && pbody ? pbody.scrollTop : 0;
  document.getElementById("pursuit-title").innerHTML =
    `<input class="ie ie-title" id="pursuit-title-input" placeholder="role name" value="${escapeHTML(j.title || "")}">`;
  const stage = j.application_status || "";
  document.getElementById("pursuit-pills").innerHTML =
    `<span class="pill ${stage ? (stageColorClass(stage) || "pill-stage") : "pill-none"}">${escapeHTML(stage || "—")}</span>` +
    (j.verdict ? ` <span class="${pillClass(j.verdict)}">${escapeHTML(j.verdict)}</span>` : "");
  const pursuitChat = document.getElementById("pursuit-chat");
  if (pursuitChat) {
    pursuitChat.style.display = state.meta && state.meta.chat ? "" : "none";
    pursuitChat.onclick = () => openChat("posting", j.posting_id, j.title || j.company);
  }

  document.getElementById("pursuit-body").innerHTML = `
    <section class="pane-section role-head">
      <div id="role-body">${roleEditHTML(j)}</div>
    </section>

    <section class="pane-section">
      <h3>
        Pipeline
      </h3>
      <div class="pipeline-grid">
        <div class="pipeline-row">
          <span class="pl-label">application</span>
          <select class="input pl-appstatus" title="application stage">
            ${stageOptions(j.application_status || "").map(([v, label]) =>
              `<option value="${escapeHTML(v)}"${(j.application_status || "") === v ? " selected" : ""}>${escapeHTML(label)}</option>`).join("")}
          </select>
        </div>
        <div class="pipeline-row">
          <span class="pl-label">outreach</span>
          <select class="input pl-ostatus" title="outreach reply status — separate from the application stage">
            ${statusOptions(j.outreach_status || "").map(([v, label]) =>
              `<option value="${escapeHTML(v)}"${(j.outreach_status || "") === v ? " selected" : ""}>${escapeHTML(label)}</option>`).join("")}
          </select>
        </div>
        <div class="pipeline-row">
          <span class="pl-label">queue</span>
          <button class="pt-chip pt-nextup${j.next_up ? " is-on" : ""}" title="${j.next_up ? "unmark — it also clears itself when you log a +1 outreach" : "mark this pursuit next up for outreach"}">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 12.5v-9M4.5 7L8 3.5 11.5 7"/></svg>
            next up
          </button>
        </div>
      </div>
    </section>

    <section class="pane-section">
      <h3>
        Notes
      </h3>
      <textarea class="ie ie-notes" id="pursuit-notes-input" rows="4" placeholder="—">${escapeHTML(j.notes || "")}</textarea>
    </section>

    <section class="pane-section">
      <h3>
        Outreach
      </h3>
      <div id="outreach-section"></div>
    </section>

    ${(j.application_status || "") ? "" : `
    <section class="pane-section">
      <h3>
        Application
      </h3>
      <div id="answers-section"></div>
    </section>`}

    <div class="pane-danger">
      <button class="btn-delete" id="job-delete-btn" title="permanently delete this job posting and everything attached to it">Delete job</button>
    </div>
  `;

  wirePipeline();
  const co = document.getElementById("pursuit-company-link");
  if (co) co.addEventListener("click", () => openDetail(j.company_id));
  wireRelinkCompany(j);
  wireInlineField(document.getElementById("pursuit-title-input"),
    (v) => savePostingField(j, "title", v));
  wireInlineField(document.getElementById("pursuit-url-input"),
    (v) => savePostingURL(j, v));
  const reenrich = document.getElementById("pursuit-reenrich");
  if (reenrich) reenrich.addEventListener("click", () => reenrichPosting(j, reenrich));
  wireInlineField(document.getElementById("pursuit-notes-input"),
    (v) => savePursuitNotes(v), { multiline: true });
  document.querySelectorAll("#role-body [data-k]").forEach(el =>
    wireInlineField(el, (v) => savePostingField(j, el.dataset.k, v),
      { multiline: el.tagName === "TEXTAREA" }));
  const delBtn = document.getElementById("job-delete-btn");
  if (delBtn) delBtn.addEventListener("click", () => openDeleteJobModal(j));
  renderOutreachSection();
  renderAnswersSection();
  // Restore scroll on a same-posting refresh (0 on a fresh open), so a run/poll
  // finishing doesn't yank the panel to the top.
  if (pbody) pbody.scrollTop = prevScroll;
  pursuitRenderedId = j.posting_id;
}

// roleEditHTML is the always-editable role body: the URL (inline-editable — it's
// the posting's identity, so it has its own validated save path) with an open
// affordance, plus seamless inline fields for everything hand-editable. The role
// title lives in the pane header (pursuit-title-input); posted date and company
// are read-only context. Each field auto-saves on blur/Enter — see renderPursuit.
function roleEditHTML(j) {
  return `
    <div class="role-url ie-field">
      <div class="role-url-head">
        <label>link</label>
        <a class="role-url-open" href="${safeHref(j.url)}" target="_blank" rel="noopener" title="open the posting">↗</a>
        <button type="button" class="role-reenrich h3-action" id="pursuit-reenrich"
                title="re-fetch this posting's details from the link — fills in blanks, no re-typing">↻ re-enrich</button>
      </div>
      <input class="ie" id="pursuit-url-input" placeholder="https://…" value="${escapeHTML(j.url || "")}">
    </div>
    <div class="ie-grid">
      <div class="prow">
        <div class="ie-field"><label>location</label>
          <input class="ie" data-k="location" placeholder="—" value="${escapeHTML(j.location || "")}"></div>
        <div class="ie-field"><label>comp range</label>
          <input class="ie" data-k="comp_range" placeholder="—" value="${escapeHTML(j.comp_range || "")}"></div>
      </div>
      <div class="prow">
        <div class="ie-field"><label>employment</label>
          <input class="ie" data-k="employment_type" placeholder="—" value="${escapeHTML(j.employment_type || "")}"></div>
        <div class="ie-field"><label>workplace</label>
          <input class="ie" data-k="workplace_type" placeholder="—" value="${escapeHTML(j.workplace_type || "")}"></div>
      </div>
      <div class="ie-field"><label>department</label>
        <input class="ie" data-k="department" placeholder="—" value="${escapeHTML(j.department || "")}"></div>
      <div class="ie-field"><label>description</label>
        <textarea class="ie" data-k="description" rows="6" placeholder="—">${escapeHTML(j.description || "")}</textarea></div>
    </div>
    <div class="role-meta">
      ${j.posted_at ? `<span>posted ${escapeHTML(j.posted_at)}</span>` : ""}
      <span class="role-company-wrap">
        <button type="button" class="role-company role-company-link" id="pursuit-company-link"
                title="open the company panel">${escapeHTML(j.company)} ↗</button>
        <button type="button" class="role-company-relink-btn" id="pursuit-company-edit"
                title="move this job to a different company">change</button>
      </span>
    </div>`;
}

// wirePipeline binds the tracker controls; they PUT the posting and keep
// state.jobs + the table in sync via savePursuitTracking. The application stage
// and outreach reply status are independent single-label dropdowns.
function wirePipeline() {
  const appstatus = document.querySelector("#pursuit-body .pl-appstatus");
  if (appstatus) appstatus.addEventListener("change", e =>
    savePursuitTracking({ application_status: e.target.value }));
  const ostatus = document.querySelector("#pursuit-body .pl-ostatus");
  if (ostatus) ostatus.addEventListener("change", e =>
    savePursuitTracking({ outreach_status: e.target.value }));
  const nextUp = document.querySelector("#pursuit-body .pt-nextup");
  if (nextUp) nextUp.addEventListener("click", () => toggleNextUp(pursuit.row, true));
}

// toggleNextUp queues/unqueues a posting as "next up for outreach". Its own
// endpoint (not the tracking PUT) so the server can also clear the mark on its
// own when the outreach goes out. Shared by the pursuit panel and the inline
// jobs-row star; pass refreshPanel=true to also re-render the open panel.
async function toggleNextUp(j, refreshPanel) {
  let resp;
  try {
    resp = await fetch(`/api/postings/${j.posting_id}/next-up`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ next_up: !j.next_up }),
    });
  } catch (e) { toast(`save failed: ${e.message}`); return; }
  if (!resp.ok) {
    const txt = (await resp.text().catch(() => "")).trim();
    toast(`save failed: ${txt || "HTTP " + resp.status}`);
    return;
  }
  const fresh = await resp.json();
  j.next_up = fresh.next_up;
  renderJobs();
  syncCompanyPosting(j.posting_id, { next_up: fresh.next_up });
  if (refreshPanel) renderPursuit();
  toast(j.next_up ? "queued next up" : "removed from the queue");
}

// savePostingTracking PUTs an arbitrary posting row's full lifecycle (current
// overlaid with the change) and folds the fresh fields back into the cached
// row. Shared by the pursuit panel and the inline jobs-row controls; returns
// the fresh row (or null on failure) so callers can decide what to re-render.
async function savePostingTracking(j, patch) {
  const body = {
    application_status: j.application_status || "",
    outreach_status: j.outreach_status || "",
    notes: j.notes || "",
    ...patch,
  };
  let resp;
  try {
    resp = await fetch(`/api/postings/${j.posting_id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (e) { toast(`save failed: ${e.message}`); return null; }
  if (!resp.ok) {
    const txt = (await resp.text().catch(() => "")).trim();
    toast(`save failed: ${txt || "HTTP " + resp.status}`);
    return null;
  }
  const fresh = await resp.json();
  // Fold the posting fields back into the row (keep company/verdict/badge etc).
  // next_up rides along so the server-side auto-clear (+1 outreach completes
  // the queued to-do) reflects immediately.
  Object.assign(j, {
    application_status: fresh.application_status,
    outreach_count: fresh.outreach_count, last_outreach_at: fresh.last_outreach_at,
    outreach_status: fresh.outreach_status,
    contacts: fresh.contacts, notes: fresh.notes,
    next_up: fresh.next_up,
  });
  syncCompanyPosting(j.posting_id, {   // the company pane card shows the lifecycle too
    application_status: fresh.application_status,
    outreach_count: fresh.outreach_count, last_outreach_at: fresh.last_outreach_at,
    next_up: fresh.next_up,
  });
  return fresh;
}

// savePursuitNotes persists the posting's free-form notes through the tracking
// PUT (notes rides that human-only path — capture never writes it). It folds the
// fresh value back without a full re-render so the textarea keeps focus/caret,
// and throws on failure so wireInlineField rolls back and flashes the error.
async function savePursuitNotes(v) {
  const j = pursuit.row;
  const body = {
    application_status: j.application_status || "",
    outreach_status: j.outreach_status || "",
    notes: v,
  };
  const resp = await fetch(`/api/postings/${j.posting_id}`, {
    method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error((await resp.text().catch(() => "")).trim() || "HTTP " + resp.status);
  const fresh = await resp.json();
  j.notes = fresh.notes;
  renderJobs();   // keep the cached table row's notes in sync (search/export)
}

// savePursuitTracking saves a change made from the pursuit panel, then re-renders
// the table and the panel.
async function savePursuitTracking(patch) {
  const fresh = await savePostingTracking(pursuit.row, patch);
  if (!fresh) return;
  renderJobs();
  renderPursuit();
  toast("tracking saved");
}

// saveRowTracking saves a change made from an inline jobs-row control. The
// cached row is the same object the table renders from, so a plain renderJobs()
// reflects it; the pursuit panel is refreshed only if it's showing this posting.
async function saveRowTracking(j, patch) {
  const fresh = await savePostingTracking(j, patch);
  if (!fresh) return;
  renderJobs();
  if (pursuit.postingId === j.posting_id) { pursuit.row = j; renderPursuit(); }
  toast("tracking saved");
}

// renderOutreachSection draws the per-contact tracking + follow-ups (the
// contacts manager) above the draft queue (current draft expanded, history
// collapsed under it).
function renderOutreachSection() {
  const host = document.getElementById("outreach-section");
  if (!host) return;
  const drafts = pursuit.drafts;
  const current = drafts[0] || null;
  const history = drafts.slice(1);

  // The outer start button: hidden while a draft is active (it's shown in the
  // card) and while the current draft is failed (its in-card Retry covers it).
  const suppressStart = current && (isActiveStatus(current.status) || current.status === "failed");
  const draftBtn = suppressStart
    ? ""
    : `<button class="btn btn-primary" id="draft-start-btn">${current ? "Draft again" : "Draft outreach"}</button>`;

  const histBlock = history.length ? `
    <details class="draft-history" ${pursuit.openHist ? "open" : ""}>
      <summary>${history.length} earlier draft${history.length > 1 ? "s" : ""}</summary>
      <div id="draft-history-body">${history.map(d => draftCardHTML(d, true)).join("")}</div>
    </details>` : "";

  host.innerHTML = contactsManagerHTML() +
    `<div class="outreach-drafts-head">Drafts</div>` +
    `<div id="draft-current">${current ? draftCardHTML(current, false) : ""}</div>` +
    `<div class="draft-actions">${draftBtn}</div>` +
    histBlock;

  wireContacts();
  wireOutreach();
}

// ---- per-contact outreach tracking + follow-ups (M51) ----

// addBusinessDaysISO advances an ISO date by n weekdays (skips Sat/Sun), mirroring
// the server's auto-arm so a hand-set follow-up matches a logged one.
function addBusinessDaysISO(iso, n) {
  const d = new Date(iso + "T00:00:00");
  let added = 0;
  while (added < n) {
    d.setDate(d.getDate() + 1);
    const wd = d.getDay();
    if (wd !== 0 && wd !== 6) added++;
  }
  return d.toISOString().slice(0, 10);
}

// renderFollowupTemplate fills the user's follow-up template with this contact +
// the last send's variables ({{company}}, {{role}}, {{contact_name}},
// {{contact_role}}, {{last_sent}}, {{last_message}}). Mirrors the server's bareVarRE;
// an unknown {{token}} is left as-is so a typo stays visible.
function renderFollowupTemplate(contact, latest) {
  const j = pursuit.row || {};
  const vars = {
    company: j.company || "",
    role: j.title || "",
    contact_name: (contact && contact.name) || "",
    contact_role: (contact && contact.role) || "",
    last_sent: (latest && latest.sent_at) || "",
    last_message: (latest && latest.body) || "",
  };
  return (state.followupTemplate || "").replace(
    /\{\{\s*([A-Za-z][A-Za-z0-9_]*)\s*\}\}/g,
    (m, k) => (k in vars ? vars[k] : m));
}

// contactsManagerHTML renders the company contacts list with per-contact logging
// + follow-up controls, a derived send count, and the follow-up interval knob.
function contactsManagerHTML() {
  const j = pursuit.row;
  const meta = `<div class="outreach-meta">
      ${j.last_outreach_at ? `<span>last outreach ${escapeHTML(j.last_outreach_at)}</span>` : ""}
      <span class="om-interval" title="business days after a send to remind you to follow up (0 = off)">follow up after <input class="input fu-interval" type="number" min="0" max="90" value="${state.followupInterval}"> business days</span>
    </div>`;
  if (!pursuit.contactsLoaded) {
    return `<div class="contacts-mgr">${meta}<div class="loading-row"><span class="spinner"></span><span>loading contacts…</span></div></div>`;
  }
  const cards = pursuit.contacts.map(contactCardHTML).join("");
  const empty = pursuit.contacts.length ? ""
    : `<div class="cc-empty dim">No contacts yet — add the people you're reaching out to at ${escapeHTML(j.company)}.</div>`;
  return `<div class="contacts-mgr">
    ${meta}
    <div class="cc-cards">${cards}${empty}</div>
    <div class="cc-addwrap">
      <button class="btn cc-addbtn" type="button">+ add contact</button>
      <div class="cc-addform" style="display:none">
        <input class="input cc-f-name" placeholder="name" spellcheck="false">
        <input class="input cc-f-role" placeholder="role (e.g. recruiter)" spellcheck="false">
        <input class="input cc-f-email" type="email" placeholder="email" spellcheck="false">
        <div class="cc-form-actions"><button class="btn btn-primary cc-f-save" type="button">Add</button><button class="btn cc-f-cancel" type="button">Cancel</button></div>
      </div>
    </div>
  </div>`;
}

function contactCardHTML(c) {
  const entries = pursuit.outreach.filter(e => e.contact_id === c.id); // newest first (API order)
  const latest = entries[0] || null;
  const role = c.role ? `<span class="cc-role">${escapeHTML(c.role)}</span>` : "";
  const mail = c.email ? `<a class="cc-mail" href="mailto:${escapeHTML(c.email)}" title="${escapeHTML(c.email)}">${escapeHTML(c.email)}</a>` : "";
  return `<div class="contact-card" data-cid="${c.id}">
    <div class="cc-head">
      <span class="cc-name">${escapeHTML(c.name || c.email || "contact")}</span>${role}${mail}
      <span class="cc-acts"><button class="cc-edit" type="button" title="edit contact" aria-label="edit">✎</button><button class="cc-arch" type="button" title="remove contact" aria-label="remove">×</button></span>
    </div>
    <div class="cc-editform" style="display:none">
      <input class="input cc-e-name" value="${escapeHTML(c.name || "")}" placeholder="name" spellcheck="false">
      <input class="input cc-e-role" value="${escapeHTML(c.role || "")}" placeholder="role" spellcheck="false">
      <input class="input cc-e-email" type="email" value="${escapeHTML(c.email || "")}" placeholder="email" spellcheck="false">
      <div class="cc-form-actions"><button class="btn btn-primary cc-e-save" type="button">Save</button><button class="btn cc-e-cancel" type="button">Cancel</button></div>
    </div>
    <div class="cc-status">${followupStatusHTML(latest)}</div>
    <div class="cc-rowacts"><button class="btn cc-log" type="button">+ log outreach</button>${latest ? `<button class="btn cc-followup" type="button" title="copy a follow-up email from your template and pre-fill the log">Follow up ⧉</button>` : ""}</div>
    <div class="cc-logform" style="display:none">
      <input class="input cc-l-date" type="date" value="${isoToday()}" title="date sent">
      <textarea class="input cc-l-body" rows="5" placeholder="email body — what you sent (optional)" spellcheck="false"></textarea>
      <input class="input cc-l-note" placeholder="note (optional)" spellcheck="false">
      <div class="cc-form-actions"><button class="btn btn-primary cc-l-save" type="button">Log</button><button class="btn cc-l-cancel" type="button">Cancel</button></div>
    </div>
    ${entries.length ? `<details class="cc-history"><summary>${entries.length} send${entries.length > 1 ? "s" : ""}</summary><div class="cc-entries">${entries.map(outreachEntryHTML).join("")}</div></details>` : ""}
  </div>`;
}

// followupStatusHTML renders the contact's current outreach state from its latest
// send: last-sent date plus the active follow-up (editable date + "mark done"),
// or affordances to set one / log the first outreach.
function followupStatusHTML(latest) {
  if (!latest) return `<span class="dim">no outreach logged yet</span>`;
  const last = `last ${escapeHTML(latest.sent_at)}`;
  if (latest.followup_done_at) return `${last} · <span class="fu-done">followed up ✓</span>`;
  if (latest.followup_due_at) {
    const overdue = latest.followup_due_at <= isoToday();
    return `${last} · <span class="fu-wrap ${overdue ? "fu-overdue" : ""}">${overdue ? "⏰ " : ""}follow up by <input class="input fu-date" data-eid="${latest.id}" type="date" value="${escapeHTML(latest.followup_due_at)}"></span> <button class="btn cc-fu-done" data-eid="${latest.id}" type="button">mark followed up</button>`;
  }
  return `${last} · <span class="dim">no follow-up</span> <button class="btn cc-fu-set" data-eid="${latest.id}" type="button">set reminder</button>`;
}

function outreachEntryHTML(e) {
  const fu = e.followup_done_at ? `<span class="fu-done">followed up</span>`
    : e.followup_due_at ? `<span class="fu-mini">↳ follow up ${escapeHTML(e.followup_due_at)}</span>` : "";
  const body = e.body
    ? `<details class="cc-e-body"><summary>email sent</summary><pre>${escapeHTML(e.body)}</pre></details>` : "";
  return `<div class="cc-entry-wrap">
      <div class="cc-entry" data-eid="${e.id}">
        <span class="cc-e-date">${escapeHTML(e.sent_at)}</span>
        ${e.note ? `<span class="cc-e-note">${escapeHTML(e.note)}</span>` : ""}
        ${fu}
        <button class="cc-e-del" type="button" title="delete this send" aria-label="delete">×</button>
      </div>
      ${body}
    </div>`;
}

// contactApi is a thin fetch wrapper for the contact/outreach-log endpoints:
// returns the parsed body, or null (with a toast) on failure.
async function contactApi(method, url, body) {
  let resp;
  try {
    resp = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) { toast(`save failed: ${e.message}`); return null; }
  if (!resp.ok) {
    const t = (await resp.text().catch(() => "")).trim();
    toast(`save failed: ${t || "HTTP " + resp.status}`);
    return null;
  }
  try { return await resp.json(); } catch { return {}; }
}

// refreshAfterContactChange re-pulls the jobs table (derived count + due badge,
// and rebindPursuitRow re-points the open panel) then the panel's contacts/log,
// so a mutation reflects everywhere at once.
async function refreshAfterContactChange() {
  await loadJobs();
  await loadContactsAndLog();
}

// wireContacts binds the contacts manager: the interval knob, add/edit/archive,
// per-contact logging, and follow-up snooze/done/set + entry delete.
function wireContacts() {
  const host = document.getElementById("outreach-section");
  if (!host) return;
  const pid = pursuit.postingId;

  const interval = host.querySelector(".fu-interval");
  if (interval) interval.addEventListener("change", async () => {
    const days = Math.max(0, Math.min(90, parseInt(interval.value, 10) || 0));
    const r = await contactApi("PUT", "/api/followup-interval", { days });
    if (r) { state.followupInterval = days; toast("follow-up interval saved"); }
  });

  // Add contact.
  const addwrap = host.querySelector(".cc-addwrap");
  if (addwrap) {
    const form = addwrap.querySelector(".cc-addform");
    addwrap.querySelector(".cc-addbtn").addEventListener("click", () => {
      form.style.display = ""; addwrap.querySelector(".cc-addbtn").style.display = "none";
      form.querySelector(".cc-f-name").focus();
    });
    addwrap.querySelector(".cc-f-cancel").addEventListener("click", () => renderOutreachSection());
    addwrap.querySelector(".cc-f-save").addEventListener("click", async () => {
      const body = {
        name: form.querySelector(".cc-f-name").value,
        role: form.querySelector(".cc-f-role").value,
        email: form.querySelector(".cc-f-email").value,
      };
      const r = await contactApi("POST", `/api/companies/${pursuit.row.company_id}/contacts`, body);
      if (r) { toast("contact added"); refreshAfterContactChange(); }
    });
  }

  host.querySelectorAll(".contact-card").forEach(card => {
    const cid = card.dataset.cid;

    // Edit / archive.
    const editForm = card.querySelector(".cc-editform");
    card.querySelector(".cc-edit").addEventListener("click", () => {
      editForm.style.display = editForm.style.display === "none" ? "" : "none";
      if (editForm.style.display !== "none") editForm.querySelector(".cc-e-name").focus();
    });
    const ecancel = card.querySelector(".cc-e-cancel");
    if (ecancel) ecancel.addEventListener("click", () => { editForm.style.display = "none"; });
    const esave = card.querySelector(".cc-e-save");
    if (esave) esave.addEventListener("click", async () => {
      const body = {
        name: editForm.querySelector(".cc-e-name").value,
        role: editForm.querySelector(".cc-e-role").value,
        email: editForm.querySelector(".cc-e-email").value,
      };
      const r = await contactApi("PUT", `/api/contacts/${cid}`, body);
      if (r) { toast("contact saved"); refreshAfterContactChange(); }
    });
    card.querySelector(".cc-arch").addEventListener("click", async () => {
      const r = await contactApi("DELETE", `/api/contacts/${cid}`);
      if (r) { toast("contact removed"); refreshAfterContactChange(); }
    });

    // Log outreach (the body field records the actual email sent).
    const logForm = card.querySelector(".cc-logform");
    card.querySelector(".cc-log").addEventListener("click", () => {
      logForm.style.display = logForm.style.display === "none" ? "" : "none";
      if (logForm.style.display !== "none") logForm.querySelector(".cc-l-date").focus();
    });
    const lcancel = card.querySelector(".cc-l-cancel");
    if (lcancel) lcancel.addEventListener("click", () => { logForm.style.display = "none"; });
    const lsave = card.querySelector(".cc-l-save");
    if (lsave) lsave.addEventListener("click", async () => {
      const body = {
        contact_id: cid,
        sent_at: logForm.querySelector(".cc-l-date").value || isoToday(),
        body: logForm.querySelector(".cc-l-body").value,
        note: logForm.querySelector(".cc-l-note").value,
      };
      const r = await contactApi("POST", `/api/postings/${pid}/outreach-log`, body);
      if (r) { toast("outreach logged"); refreshAfterContactChange(); }
    });

    // Follow up: render the template (filled from this contact + the last send),
    // copy it to the clipboard, and pre-fill the log form so sending then logging
    // is one more click. Nothing is recorded until they hit Log.
    const fuBtn = card.querySelector(".cc-followup");
    if (fuBtn) fuBtn.addEventListener("click", () => {
      const c = pursuit.contacts.find(x => x.id === cid);
      const latest = pursuit.outreach.filter(e => e.contact_id === cid)[0] || null;
      const text = renderFollowupTemplate(c, latest);
      copyToClipboard(text, "follow-up copied — paste into your email");
      logForm.style.display = "";
      logForm.querySelector(".cc-l-body").value = text;
      logForm.querySelector(".cc-l-date").value = isoToday();
    });

    // Follow-up: snooze (date change), mark done, set from cleared. The PUT is
    // full-state, so each carries the entry's current body + sent_at + note unchanged.
    const entryEdit = (eid, patch) => {
      const e = pursuit.outreach.find(x => String(x.id) === String(eid)) || {};
      return { sent_at: e.sent_at || "", body: e.body || "", note: e.note || "", followup_due_at: e.followup_due_at || "", done: !!e.followup_done_at, ...patch };
    };
    const fuDate = card.querySelector(".fu-date");
    if (fuDate) fuDate.addEventListener("change", async () => {
      const r = await contactApi("PUT", `/api/outreach-log/${fuDate.dataset.eid}`, entryEdit(fuDate.dataset.eid, { followup_due_at: fuDate.value, done: false }));
      if (r) { toast("follow-up updated"); refreshAfterContactChange(); }
    });
    const fuDone = card.querySelector(".cc-fu-done");
    if (fuDone) fuDone.addEventListener("click", async () => {
      const r = await contactApi("PUT", `/api/outreach-log/${fuDone.dataset.eid}`, entryEdit(fuDone.dataset.eid, { done: true }));
      if (r) { toast("marked followed up"); refreshAfterContactChange(); }
    });
    const fuSet = card.querySelector(".cc-fu-set");
    if (fuSet) fuSet.addEventListener("click", async () => {
      const due = addBusinessDaysISO(isoToday(), state.followupInterval || 5);
      const r = await contactApi("PUT", `/api/outreach-log/${fuSet.dataset.eid}`, entryEdit(fuSet.dataset.eid, { followup_due_at: due, done: false }));
      if (r) { toast("reminder set"); refreshAfterContactChange(); }
    });

    // Delete a logged send.
    card.querySelectorAll(".cc-e-del").forEach(b => b.addEventListener("click", async () => {
      const eid = b.closest(".cc-entry").dataset.eid;
      const r = await contactApi("DELETE", `/api/outreach-log/${eid}`);
      if (r) { toast("send deleted"); refreshAfterContactChange(); }
    }));
  });
}

function isActiveStatus(st) {
  return st === "researching" || st === "awaiting_review" || st === "needs_work" || st === "no_hook";
}

// Inline icons for the draft action buttons — same 16×16 stroke idiom as the
// pane section headers.
const ICON_COPY = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M2.5 10.5v-7a1 1 0 011-1h7"/></svg>';
const ICON_SEND = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2L7.3 8.7"/><path d="M14 2L9.7 14l-2.4-5.3L2 6.3z"/></svg>';

// The copy button lives in the card head, top right next to the timestamp.
const COPY_BTN = `<button class="dh-copy draft-copy-btn" title="copy the email to the clipboard" aria-label="copy email">${ICON_COPY}</button>`;

// The outreach pipeline's stages, in run order — the engine stamps the active
// one on the draft row (the `stage` field) and the panel polls it. `label` is
// the chip under each node; `active` is the present-tense status line shown
// while that stage is running.
const OUTREACH_STAGES = [
  { key: "research", label: "Research", active: "Researching the company" },
  { key: "fill",     label: "Draft",    active: "Writing the draft" },
  { key: "humanize", label: "Polish",   active: "Polishing the voice" },
  { key: "honesty",  label: "Fact-check", active: "Fact-checking against your experience" },
];
const STAGE_CHECK = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 8.5l3 3 6-7"/></svg>';

// outreachProgressHTML renders the staged progress bar shown on a researching
// draft card: a connected row of nodes (done / active / pending) plus a
// spinner'd status line for the active stage. An unknown/empty stage falls back
// to the first node so a freshly-started run still reads as in-progress.
function outreachProgressHTML(stage) {
  let idx = OUTREACH_STAGES.findIndex(s => s.key === stage);
  if (idx < 0) idx = 0;
  const segs = OUTREACH_STAGES.map((s, i) => {
    const cls = i < idx ? "is-done" : i === idx ? "is-active" : "is-pending";
    const dot = i < idx ? STAGE_CHECK : "";
    return `<div class="dp-seg ${cls}"><span class="dp-dot">${dot}</span><span class="dp-name">${s.label}</span></div>`;
  }).join("");
  return `<div class="draft-progress">
    <div class="dp-track">${segs}</div>
    <div class="dp-status"><span class="spinner"></span><span>${OUTREACH_STAGES[idx].active}…</span></div>
  </div>`;
}

// draftCardHTML renders one draft by status. `readonly` collapses history items
// to a read-only summary (no edit/save controls).
function draftCardHTML(d, readonly) {
  const head = (cls, label, extra = "") => `
    <div class="draft-head">
      <span class="${cls}">${label}</span>${extra}
    </div>`;

  if (d.status === "researching") {
    return `<div class="draft-card dc-busy">
      ${outreachProgressHTML(d.stage)}
      <div class="draft-note">This usually takes a minute or two — leave the panel or check back later.</div>
    </div>`;
  }

  if (d.status === "failed") {
    const vio = renderViolations(d.violations);
    return `<div class="draft-card dc-failed" data-did="${d.id}">
      ${head("pill pill-no", "failed")}
      ${d.fail_reason ? `<div class="draft-note">${escapeHTML(d.fail_reason)}</div>` : ""}
      ${vio}
      ${renderTrace(d)}
      ${readonly ? "" : `<div class="draft-actions"><button class="btn btn-primary draft-retry-btn">${REFRESH}Retry</button></div>`}
    </div>`;
  }

  if (d.status === "superseded") {
    // A draft retired by a regenerate — read-only, history only.
    return `<div class="draft-card dc-sent" data-did="${d.id}">
      ${head("pill pill-info", "replaced")}
      <div class="draft-note">Replaced by a newer draft.</div>
      <div class="draft-sentbody">${escapeHTML(draftText(d) || "(empty)")}</div>
      ${renderTrace(d)}
    </div>`;
  }

  if (d.status === "sent") {
    return `<div class="draft-card dc-sent" data-did="${d.id}">
      ${head("pill pill-yes", "sent", readonly ? "" : COPY_BTN)}
      ${d.sent_at ? `<div class="draft-note">Sent ${escapeHTML((d.sent_at || "").replace("T", " ").slice(0, 16))}</div>` : ""}
      <div class="draft-sentbody">${escapeHTML(draftText(d) || "(empty)")}</div>
      ${renderTrace(d)}
    </div>`;
  }

  // awaiting_review or no_hook — both editable; no_hook is NEUTRAL, not an error.
  const text = draftText(d);
  const noHook = d.status === "no_hook";
  const label = noHook
    ? `<span class="pill pill-info">no honest hook</span>`
    : `<span class="pill pill-maybe">awaiting review</span>`;
  // no_hook means there is nothing true to say (yet) — scout recommends NOT
  // emailing. No template fallback; writing anyway is a manual override.
  let noHookReason = "";
  if (noHook) {
    try { noHookReason = (JSON.parse(d.hook || "{}").reasoning) || ""; } catch (e) { /* reasoning optional */ }
  }
  const note = noHook
    ? `<div class="draft-note">No honest hook found — nothing true to say yet; scout recommends not emailing.${noHookReason ? " " + escapeHTML(noHookReason) : ""}</div>`
    : "";

  if (readonly) {
    return `<div class="draft-card ${noHook ? "dc-nohook" : "dc-review"}" data-did="${d.id}">
      <div class="draft-head">${label}</div>
      ${note}
      <div class="draft-sentbody">${escapeHTML(text || "(empty)")}</div>
      ${renderTrace(d)}
    </div>`;
  }

  const editable = text || noHook; // show the editor unless there's truly nothing
  return `<div class="draft-card ${noHook ? "dc-nohook" : "dc-review"}" data-did="${d.id}">
    <div class="draft-head">${label}${text ? COPY_BTN : ""}</div>
    ${note}
    ${editable ? `<textarea class="draft-textarea" id="draft-edit-${d.id}" spellcheck="false">${escapeHTML(text)}</textarea>
    ${renderLintChips(d.lint)}
    <div class="draft-actions">
      <button class="btn btn-primary draft-sent-btn" title="mark this email sent — bumps the outreach count">${ICON_SEND}Mark sent</button>
      <button class="btn draft-regen-btn" title="discard this draft (kept in history) and re-run — picks up backfilled info">${REFRESH}Regenerate</button>
    </div>` : `<div class="draft-actions">
      <button class="btn draft-regen-btn" title="re-run the draft — picks up backfilled info">${REFRESH}Regenerate</button>
    </div>`}
    ${renderTrace(d)}
  </div>`;
}

// draftText resolves the body shown/edited: the user's edit wins over the
// pipeline's draft (mirrors the server's edited-non-empty-wins rule).
function draftText(d) {
  return (d.edited && d.edited.trim()) ? d.edited : (d.draft || "");
}

// renderTrace shows the pipeline's stage outputs — what the researcher found
// and what the hook selector decided — as collapsible sections on the draft
// card. The data is stored on every draft row; this is the visibility layer.
function renderTrace(d) {
  let out = "";
  let research = null, hook = null;
  try { research = JSON.parse(d.research || "null"); } catch (e) { /* shown raw below */ }
  try { hook = JSON.parse(d.hook || "null"); } catch (e) { /* optional */ }

  if (research && typeof research === "object") {
    const line = (k, v) => v ? `<div class="tr-line"><span class="tr-key">${k}:</span> ${escapeHTML(String(v))}</div>` : "";
    const role = research.role || {};
    const hooks = Array.isArray(research.hooks) ? research.hooks : [];
    const hookItems = hooks.map(h => `
      <div class="tr-line">
        <span class="tr-key">${escapeHTML(h.type || "hook")}</span>
        ${safeHref(h.source_url) !== "#" ? ` · <a href="${safeHref(h.source_url)}" target="_blank" rel="noopener">source</a>` : ""}
        <span class="tr-quote">${escapeHTML(h.quote || "")}</span>
        ${h.context ? `<span class="tr-key">${escapeHTML(h.context)}</span>` : ""}
      </div>`).join("");
    out += `<details class="draft-trace"><summary>research — ${hooks.length} hook candidate${hooks.length === 1 ? "" : "s"}</summary>
      <div class="trace-body">
        ${line("what they do", research.what_they_do)}
        ${line("customer", research.customer)}
        ${line("stage / headcount", [research.stage, research.headcount_est].filter(Boolean).join(" / "))}
        ${line("role", role.title)}
        ${(role.jd_quotes || []).map(q => `<span class="tr-quote">${escapeHTML(q)}</span>`).join("")}
        ${hookItems}
        ${line("disambiguation", research.disambiguation)}
        ${line("confidence", research.confidence)}
      </div></details>`;
  }

  if (hook && typeof hook === "object" && hook.decision) {
    const h = hook.hook || {};
    out += `<details class="draft-trace"><summary>hook — ${escapeHTML(hook.decision)}${hook.closer_mode ? " · " + escapeHTML(hook.closer_mode) : ""}</summary>
      <div class="trace-body">
        ${h.quote ? `<span class="tr-quote">${escapeHTML(h.quote)}</span>` : ""}
        ${h.thread ? `<div class="tr-line"><span class="tr-key">thread:</span> ${escapeHTML(h.thread)}</div>` : ""}
        ${safeHref(h.source_url) !== "#" ? `<div class="tr-line"><a href="${safeHref(h.source_url)}" target="_blank" rel="noopener">source</a></div>` : ""}
        ${hook.reasoning ? `<div class="tr-line"><span class="tr-key">reasoning:</span> ${escapeHTML(hook.reasoning)}</div>` : ""}
      </div></details>`;
  }
  return out;
}

function renderLintChips(lintJSON) {
  let findings = [];
  try { findings = JSON.parse(lintJSON || "[]") || []; } catch { findings = []; }
  if (!findings.length) return "";
  return `<div class="lint-chips">` + findings.map(f =>
    `<span class="lint-chip" title="${escapeHTML(f.message || "")}"><code>${escapeHTML(f.code || "")}</code>${escapeHTML(f.message || "")}</span>`
  ).join("") + `</div>`;
}

function renderViolations(vioJSON) {
  let vios = [];
  try { vios = JSON.parse(vioJSON || "[]") || []; } catch { vios = []; }
  if (!vios.length) return "";
  return `<ul class="violation-list">` + vios.map(v =>
    `<li>${escapeHTML(v.claim || v.message || String(v))}${v.why ? ` <span class="vl-why">— ${escapeHTML(v.why)}</span>` : ""}</li>`
  ).join("") + `</ul>`;
}

// wireOutreach binds the outreach-section controls after each render.
function wireOutreach() {
  const host = document.getElementById("outreach-section");
  if (!host) return;

  const start = host.querySelector("#draft-start-btn");
  if (start) start.addEventListener("click", () => startDraft());

  host.querySelectorAll(".draft-retry-btn").forEach(b => b.addEventListener("click", () => startDraft()));

  // Regenerate retires the current reviewable draft (it drops to history) and
  // re-runs the pipeline — picks up backfilled experience/template/company info.
  host.querySelectorAll(".draft-regen-btn").forEach(b => b.addEventListener("click", () => startDraft(true)));

  host.querySelectorAll(".draft-card[data-did]").forEach(card => {
    const id = card.dataset.did;
    // The body auto-saves Linear-style: commit on blur/Cmd+Enter, Esc reverts.
    const ta = card.querySelector(".draft-textarea");
    if (ta) wireInlineField(ta, (v) => saveDraftEdit(id, v), { multiline: true });
    const sent = card.querySelector(".draft-sent-btn");
    if (sent) sent.addEventListener("click", () => markDraftSent(id));
    // Copy the email — the live textarea value (unsaved edits included) when the
    // card is editable, else the rendered body.
    const copy = card.querySelector(".draft-copy-btn");
    if (copy) copy.addEventListener("click", () => {
      const ta = card.querySelector(".draft-textarea");
      const body = card.querySelector(".draft-sentbody");
      const text = ta ? ta.value : (body ? body.textContent : "");
      copyToClipboard(text, "email copied");
    });
  });

  // Keep the history open-state sticky across polls.
  const hist = host.querySelector("details.draft-history");
  if (hist) hist.addEventListener("toggle", () => { pursuit.openHist = hist.open; });
}

// startDraft POSTs the draft pipeline. 202 -> show researching + poll;
// 412 -> the missing-blocks gate with a Sync button; 503 -> quiet dev notice;
// 409 -> reload (the active draft already exists, surface it). With
// regenerate=true it retires the current awaiting_review/needs_work/no_hook
// draft (kept in history) and re-runs — the way to re-draft after backfilling.
async function startDraft(regenerate = false) {
  const host = document.getElementById("outreach-section");
  const btn = host && (host.querySelector("#draft-start-btn") || host.querySelector(".draft-retry-btn") || host.querySelector(".draft-regen-btn"));
  if (btn) btn.disabled = true;
  let resp;
  try {
    const qs = regenerate ? "?regenerate=1" : "";
    resp = await fetch(`/api/postings/${pursuit.postingId}/outreach${qs}`, { method: "POST" });
  } catch (e) {
    toast(`draft failed: ${e.message}`);
    if (btn) btn.disabled = false;
    return;
  }

  if (resp.status === 202) {
    // Voice may be missing — the draft proceeds, degraded. Warn loudly so it
    // never looks like full-quality output.
    let body = {};
    try { body = await resp.json(); } catch {}
    if (Array.isArray(body.degraded) && body.degraded.length) {
      toast(`drafting without ${body.degraded.join(", ")} — quality degrades, integrity unaffected`);
    }
    await loadDrafts();        // the new researching row + panel poll
    loadJobs();                // reflect researching in the table + start the badge poll
    return;
  }
  if (resp.status === 409) {   // an active draft already exists — just show it
    await loadDrafts();
    toast("a draft is already active");
    return;
  }
  if (resp.status === 412) {
    let body = {};
    try { body = await resp.json(); } catch {}
    renderInputGate(body.need, body.error);
    if (btn) btn.disabled = false;
    return;
  }
  if (resp.status === 503) {
    const host2 = document.getElementById("outreach-section");
    if (host2) {
      const slot = document.createElement("div");
      slot.className = "draft-note";
      slot.textContent = "Outreach engine not running in this build.";
      host2.appendChild(slot);
    }
    if (btn) btn.disabled = false;
    return;
  }
  const txt = (await resp.text().catch(() => "")).trim();
  toast(`draft failed: ${txt || "HTTP " + resp.status}`);
  if (btn) btn.disabled = false;
}

// renderInputGate replaces the start button when a required input is missing:
// the email template (write it) or the experience bundle (discover it). It
// offers a fix button (opens the right editor) and a retry.
function renderInputGate(need, error) {
  const host = document.getElementById("outreach-section");
  if (!host) return;
  const acts = host.querySelector(".draft-actions");
  const isTemplate = need === "template";
  const label = isTemplate ? "Write email template" : "View brain knowledge";
  const gate = document.createElement("div");
  gate.className = "blocks-gate";
  gate.innerHTML = `
    <div class="draft-note">${escapeHTML(error || "Outreach isn't set up yet.")}</div>
    <div class="draft-actions">
      <button class="btn btn-primary" id="gate-fix-btn">${label}</button>
      <button class="btn" id="gate-retry-btn">Retry</button>
    </div>`;
  if (acts) acts.replaceWith(gate); else host.appendChild(gate);
  const fix = gate.querySelector("#gate-fix-btn");
  if (fix) fix.addEventListener("click", () => isTemplate ? openEditor("outreach-template") : openSourcesModal());
  const retry = gate.querySelector("#gate-retry-btn");
  if (retry) retry.addEventListener("click", startDraft);
}

// saveDraftEdit PUTs the edited body — called by the textarea's inline
// auto-save on blur; the server re-lints and returns fresh lint findings,
// which we splice back in without rebuilding the textarea. Throws so
// wireInlineField rolls back and flashes the error.
async function saveDraftEdit(id, val) {
  const resp = await fetch(`/api/outreach/drafts/${id}`, {
    method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ edited: val }),
  });
  if (!resp.ok) throw new Error((await resp.text().catch(() => "")).trim() || "HTTP " + resp.status);
  const fresh = await resp.json();
  const i = pursuit.drafts.findIndex(d => String(d.id) === String(id));
  if (i >= 0) pursuit.drafts[i] = fresh;
  const ta = document.getElementById(`draft-edit-${id}`);
  const card = ta && ta.closest(".draft-card");
  if (card) {
    const chips = card.querySelector(".lint-chips");
    const fresh_chips = renderLintChips(fresh.lint);
    if (chips) chips.outerHTML = fresh_chips || "";
    else if (fresh_chips) ta.insertAdjacentHTML("afterend", fresh_chips);
  }
}

// markDraftSent flips the draft to sent and bumps the posting's outreach count
// server-side; refresh the row from the response and re-render.
async function markDraftSent(id) {
  let resp;
  try {
    resp = await fetch(`/api/outreach/drafts/${id}/sent`, { method: "POST" });
  } catch (e) { toast(`failed: ${e.message}`); return; }
  if (!resp.ok) {
    const txt = (await resp.text().catch(() => "")).trim();
    toast(`failed: ${txt || "HTTP " + resp.status}`);
    return;
  }
  toast("marked sent");
  await loadDrafts();   // the draft flips to sent; a new "Draft again" appears
  await loadJobs();     // the posting's outreach_count/last_outreach moved server-side
  const row = state.jobs.find(j => j.posting_id === pursuit.postingId);
  if (row) syncCompanyPosting(row.posting_id, {   // reflect the bump in the pane beneath
    outreach_count: row.outreach_count, last_outreach_at: row.last_outreach_at, next_up: row.next_up,
  });
}

// ---- application answers ----
//
// The "Application" panel section: the essay questions detected on the posting's
// application form, each with an inline-save drafted answer. Detection happens
// at capture; generation is opt-in LLM spend, per question (the "Generate"
// button on each card) or in bulk ("Draft all blank"). Unwanted questions are
// removable (× — a sticky dismiss). Scout never submits — the user copy-pastes
// into the ATS.

// loadAnswers fetches the posting's questions+answers and renders the section,
// polling while any answer is still generating (the closed panel relies on the
// next open to refresh).
async function loadAnswers() {
  if (!pursuit.postingId) return;
  let data;
  try {
    const r = await fetch(`/api/postings/${pursuit.postingId}/answers`);
    if (!r.ok) { renderAnswersSection(); return; }
    data = await r.json();
  } catch { renderAnswersSection(); return; }
  pursuit.answers = data.answers || [];
  pursuit.answersStatus = data.questions_status || "";
  renderAnswersSection();
  if (pursuit.answers.some(a => a.status === "generating")) startAnswersPoll();
  else stopAnswersPoll();
}

function startAnswersPoll() { if (!pursuit.answersPoll) pursuit.answersPoll = setInterval(loadAnswers, 4000); }
function stopAnswersPoll() { if (pursuit.answersPoll) { clearInterval(pursuit.answersPoll); pursuit.answersPoll = null; } }

// renderAnswersSection draws the detection header, the per-question answer cards,
// and the footer (a secondary "Draft all blank" + Re-detect), keyed off
// questions_status.
function renderAnswersSection() {
  const host = document.getElementById("answers-section");
  if (!host) return;
  const answers = pursuit.answers;
  const status = pursuit.answersStatus;
  const generating = answers.some(a => a.status === "generating");

  const cards = answers.length
    ? `<div class="answers-list">${answers.map(answerCardHTML).join("")}</div>` : "";

  // Footer: when there are essay questions, offer Draft (fills blanks) + Re-detect;
  // otherwise just Re-detect. "Draft answers" also detects-if-missing server-side,
  // so it shows even when nothing's detected yet. Both buttons stay disabled
  // while a draft or a re-detect is in flight (the state survives re-renders so a
  // poll mid-request can't re-enable them).
  const detecting = !!pursuit.detecting;
  const startDis = (generating || detecting) ? " disabled" : "";
  const redetect = (txt) => `<button class="btn" id="answers-redetect-btn"${detecting ? " disabled" : ""}>${detecting ? "Detecting…" : txt}</button>`;
  let footer;
  if (status === "ok" && answers.length) {
    // Per-question Generate is the primary path; the bulk button is a secondary
    // "draft every blank at once" convenience, shown only when blanks remain.
    const anyBlank = answers.some(a => !answerText(a) && a.status !== "generating");
    footer =
      (anyBlank ? `<button class="btn" id="answers-start-btn"${startDis}>${generating ? "Drafting…" : "Draft all blank"}</button>` : "") +
      redetect("Re-detect");
  } else if (status === "" || status === "unreachable") {
    footer =
      `<button class="btn btn-primary" id="answers-start-btn"${startDis}>${generating ? "Drafting…" : "Draft answers"}</button>` +
      redetect("Re-detect questions");
  } else {
    // none / unsupported — nothing to draft; allow a manual re-detect.
    footer = redetect("Re-detect questions");
  }

  host.innerHTML =
    `<div class="answers-meta">${escapeHTML(answersHeader(status, answers.length))}</div>` +
    cards +
    `<div class="answers-actions">${footer}</div>`;
  wireAnswers();
}

// answersHeader renders questions_status as an honest one-liner.
function answersHeader(status, n) {
  switch (status) {
    case "": return "Not detected yet";
    case "ok": return `${n} question${n === 1 ? "" : "s"} found`;
    case "none": return "No essay questions on this form";
    case "unsupported": return "Couldn't read this form — apply on the site";
    case "unreachable": return "Couldn't reach the application form — try re-detecting";
    default: return "Couldn't read this form";
  }
}

// answerText resolves the shown/edited body: the user's edit wins over the
// generated answer (mirrors the server's edited-non-empty-wins rule).
function answerText(a) {
  return (a.edited && a.edited.trim()) ? a.edited : (a.answer || "");
}

function answerStatusPill(a) {
  switch (a.status) {
    case "ready": return `<span class="pill pill-yes">ready</span>`;
    case "needs_review": return `<span class="pill pill-maybe">needs review</span>`;
    case "failed": return `<span class="pill pill-no">failed</span>`;
    case "generating": return `<span class="pill pill-info">drafting…</span>`;
    default: return `<span class="pill pill-info">not drafted</span>`;
  }
}

// answerCardHTML renders one question: the prompt, the inline-save answer
// textarea (or a spinner while generating), a status pill, char count vs the
// declared limit, a per-question Generate/Regenerate, and a remove (×). The
// action button reads "Generate" for an undrafted question (the per-question
// draft is the primary path) and "Regenerate" once there's a draft to replace.
function answerCardHTML(a) {
  const text = answerText(a);
  const edited = a.edited && a.edited.trim();
  const busy = a.status === "generating";
  const count = text.length;
  const over = a.max_length && count > a.max_length;
  const counter = a.max_length
    ? `<span class="answer-count${over ? " over" : ""}">${count} / ${a.max_length}</span>`
    : `<span class="answer-count">${count} chars</span>`;
  const drafted = !!text;
  const genLabel = drafted ? "Regenerate" : "Generate";
  const genTitle = drafted ? "re-draft this answer (discards the current text)" : "draft an answer to just this question";

  return `<div class="answer-card ac-${a.status}" data-aid="${a.id}">
    <div class="answer-prompt">${escapeHTML(a.prompt)}</div>
    ${busy
      ? `<div class="answer-busy"><span class="spinner"></span><span>drafting…</span></div>`
      : `<textarea class="ie answer-textarea" id="answer-edit-${a.id}" rows="5" spellcheck="false" placeholder="Generate an answer to this question, or write your own.">${escapeHTML(text)}</textarea>`}
    <div class="answer-foot">
      ${answerStatusPill(a)}
      ${edited ? `<span class="answer-edited" title="your edit wins over the drafted answer">edited</span>` : ""}
      ${busy ? "" : counter}
      ${busy ? "" : `<button class="btn ${drafted ? "" : "btn-primary "}answer-regen-btn" title="${genTitle}">${genLabel}</button>`}
      ${busy ? "" : `<button class="answer-remove-btn" title="remove this question" aria-label="remove question">×</button>`}
    </div>
    ${a.status === "needs_review" ? `<div class="answer-note answer-review">Flagged by the honesty check — confirm it doesn't overstate your experience before sending.</div>` : ""}
    ${a.status === "failed" && a.fail_reason ? `<div class="answer-note answer-fail">${escapeHTML(trimReason(a.fail_reason))}</div>` : ""}
  </div>`;
}

// trimReason keeps a failure note short (the honesty path appends raw JSON).
function trimReason(s) {
  s = String(s || "");
  return s.length > 160 ? s.slice(0, 160) + "…" : s;
}

// wireAnswers binds the section controls after each render.
function wireAnswers() {
  const host = document.getElementById("answers-section");
  if (!host) return;
  const start = host.querySelector("#answers-start-btn");
  if (start) start.addEventListener("click", startAnswers);
  const redetect = host.querySelector("#answers-redetect-btn");
  if (redetect) redetect.addEventListener("click", redetectQuestions);

  host.querySelectorAll(".answer-card[data-aid]").forEach(card => {
    const id = card.dataset.aid;
    const ta = card.querySelector(".answer-textarea");
    if (ta) {
      wireInlineField(ta, (v) => saveAnswerEdit(id, v), { multiline: true });
      ta.addEventListener("input", () => updateAnswerCount(card, ta));
    }
    const regen = card.querySelector(".answer-regen-btn");
    if (regen) regen.addEventListener("click", () => regenerateAnswer(id));
    const rm = card.querySelector(".answer-remove-btn");
    if (rm) rm.addEventListener("click", () => removeAnswer(id));
  });
}

// updateAnswerCount live-updates one card's char counter as the user types.
function updateAnswerCount(card, ta) {
  const counter = card.querySelector(".answer-count");
  if (!counter) return;
  const n = ta.value.length;
  const m = counter.textContent.includes("/") ? parseInt(counter.textContent.split("/")[1], 10) : 0;
  counter.textContent = m ? `${n} / ${m}` : `${n} chars`;
  counter.classList.toggle("over", !!m && n > m);
}

// startAnswers POSTs generation (detect-if-missing server-side). 202 -> poll;
// 412 -> the experience-block gate; 503 -> quiet dev notice.
async function startAnswers() {
  const host = document.getElementById("answers-section");
  const btn = host && host.querySelector("#answers-start-btn");
  if (btn) btn.disabled = true;
  let resp;
  try {
    resp = await fetch(`/api/postings/${pursuit.postingId}/answers`, { method: "POST" });
  } catch (e) { toast(`draft failed: ${e.message}`); if (btn) btn.disabled = false; return; }

  if (resp.status === 202) { await loadAnswers(); return; }
  if (resp.status === 412) {
    let body = {}; try { body = await resp.json(); } catch {}
    renderAnswersInputGate(body.error);
    if (btn) btn.disabled = false;
    return;
  }
  if (resp.status === 503) {
    appendAnswersNote("Answer generation isn't running in this build.");
    if (btn) btn.disabled = false;
    return;
  }
  const txt = (await resp.text().catch(() => "")).trim();
  toast(`draft failed: ${txt || "HTTP " + resp.status}`);
  if (btn) btn.disabled = false;
}

// redetectQuestions forces a fresh detection run (idempotent — adds new
// questions, never clobbers answers). The detecting flag rides pursuit state so
// both action buttons stay gated across re-renders (incl. a poll mid-request);
// loadAnswers always runs at the end, restoring correct button labels on any
// outcome (HTTP error, network error, or success).
async function redetectQuestions() {
  pursuit.detecting = true;
  renderAnswersSection();
  try {
    const resp = await fetch(`/api/postings/${pursuit.postingId}/answers/redetect`, { method: "POST" });
    if (!resp.ok) {
      const txt = (await resp.text().catch(() => "")).trim();
      toast(`detect failed: ${txt || "HTTP " + resp.status}`);
    }
  } catch (e) {
    toast(`detect failed: ${e.message}`);
  }
  pursuit.detecting = false;
  await loadAnswers();
}

// saveAnswerEdit PUTs the inline edit; throws so wireInlineField rolls back and
// flashes on failure. The cached answer is updated without a re-render (caret).
async function saveAnswerEdit(id, value) {
  const resp = await fetch(`/api/answers/${id}`, {
    method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ edited: value }),
  });
  if (!resp.ok) throw new Error((await resp.text().catch(() => "")).trim() || "HTTP " + resp.status);
  const fresh = await resp.json();
  const i = pursuit.answers.findIndex(a => String(a.id) === String(id));
  if (i >= 0) pursuit.answers[i] = fresh;
}

// regenerateAnswer re-runs generation for one question (the row clears to
// generating server-side; only it re-drafts).
async function regenerateAnswer(id) {
  let resp;
  try {
    resp = await fetch(`/api/answers/${id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ regenerate: true }),
    });
  } catch (e) { toast(`regenerate failed: ${e.message}`); return; }
  if (resp.status === 503) { appendAnswersNote("Answer generation isn't running in this build."); return; }
  if (resp.status === 412) {
    let body = {}; try { body = await resp.json(); } catch {}
    renderAnswersInputGate(body.error);
    return;
  }
  if (!resp.ok) {
    const txt = (await resp.text().catch(() => "")).trim();
    toast(`regenerate failed: ${txt || "HTTP " + resp.status}`);
    return;
  }
  await loadAnswers();
}

// removeAnswer dismisses one detected question. The soft delete is sticky (a
// re-detect won't bring it back) and discards any answer typed for it, so it is
// confirmed first.
async function removeAnswer(id) {
  if (!confirm("Remove this question? Any answer drafted or written for it is discarded, and re-detecting won't bring it back.")) return;
  let resp;
  try {
    resp = await fetch(`/api/answers/${id}`, { method: "DELETE" });
  } catch (e) { toast(`remove failed: ${e.message}`); return; }
  if (!resp.ok) {
    const txt = (await resp.text().catch(() => "")).trim();
    toast(`remove failed: ${txt || "HTTP " + resp.status}`);
    return;
  }
  await loadAnswers();
}

// renderAnswersInputGate swaps the actions for a "discover sources" prompt — the
// answer engine needs the same experience bundle the email pipeline does.
function renderAnswersInputGate(error) {
  const host = document.getElementById("answers-section");
  if (!host) return;
  const acts = host.querySelector(".answers-actions");
  const gate = document.createElement("div");
  gate.className = "blocks-gate";
  gate.innerHTML = `
    <div class="draft-note">${escapeHTML(error || "Drafting answers needs an experience page in your brain.")}</div>
    <div class="answers-actions">
      <button class="btn btn-primary" id="answers-fix-btn">View brain knowledge</button>
      <button class="btn" id="answers-retry-btn">Retry</button>
    </div>`;
  if (acts) acts.replaceWith(gate); else host.appendChild(gate);
  const fix = gate.querySelector("#answers-fix-btn");
  if (fix) fix.addEventListener("click", openSourcesModal);
  const retry = gate.querySelector("#answers-retry-btn");
  if (retry) retry.addEventListener("click", startAnswers);
}

function appendAnswersNote(text) {
  const host = document.getElementById("answers-section");
  if (!host) return;
  const n = document.createElement("div");
  n.className = "draft-note";
  n.textContent = text;
  host.appendChild(n);
}

// ---- detail pane ----
// openDetail both opens the pane (first time) and refreshes it in place (e.g.
// after a verdict/enrich run that targets the open company). When the same
// company is already open, we skip the blank→spinner→content cycle and just
// swap the fresh content in one paint, preserving scroll — otherwise the pane
// flashed on every run completion. The spinner stays for a genuine open (a
// different company, or the pane was closed) where there's nothing to show yet.
async function openDetail(id) {
  const pane = document.getElementById("pane");
  const scrim = document.getElementById("scrim");
  const refreshing = state.openId === id && pane.classList.contains("open");
  const prevScroll = refreshing ? (document.getElementById("pane-body")?.scrollTop ?? 0) : 0;
  // Keep the old decision-trail visible across a refresh; loadTrace swaps in the
  // fresh one when it returns, so that section doesn't blink a spinner either.
  const prevTrace = refreshing ? document.getElementById("trace-body")?.innerHTML : null;
  state.openId = id;
  pane.classList.add("open"); scrim.classList.add("open");
  pane.setAttribute("aria-hidden", "false");
  raisePane("company");
  if (!refreshing) {
    document.getElementById("pane-title").textContent = "loading…";
    document.getElementById("pane-pills").innerHTML = "";
    document.getElementById("pane-body").innerHTML =
      '<div class="loading-row"><span class="spinner"></span><span>loading…</span></div>';
  }

  let d;
  try {
    const r = await fetch(`/api/companies/${id}`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    d = await r.json();
  } catch (e) {
    // On a refresh, keep the stale-but-valid content rather than blanking it.
    if (!refreshing) document.getElementById("pane-body").innerHTML =
      `<div class="muted">Failed to load detail: ${escapeHTML(e.message)}</div>`;
    return;
  }
  if (state.openId !== id) return; // user switched/closed the pane during the fetch
  renderDetail(d);
  if (refreshing) {
    if (prevTrace != null) { const t = document.getElementById("trace-body"); if (t) t.innerHTML = prevTrace; }
    const b = document.getElementById("pane-body"); if (b) b.scrollTop = prevScroll;
  }
  loadTrace(id);
}

function closeDetail() {
  state.openId = null;
  state.openDetail = null;
  document.getElementById("pane").classList.remove("open");
  document.getElementById("scrim").classList.remove("open");
  document.getElementById("pane").setAttribute("aria-hidden", "true");
}

function renderDetail(d) {
  state.openDetail = d;   // stash for cross-panel sync (pursuit edits patch this)
  document.getElementById("pane-title").innerHTML =
    `<input class="ie ie-title" id="pane-title-input" placeholder="company name" value="${escapeHTML(d.name || "")}">`;
  document.getElementById("pane-pills").innerHTML = `
    <span class="${pillClass(d.has_verdict ? d.verdict : "")}">${escapeHTML(d.has_verdict ? d.verdict : "unscored")}</span>
  `;
  // Per-entity chat button — gated on the chat capability (needs the API key).
  const paneChat = document.getElementById("pane-chat");
  if (paneChat) {
    paneChat.style.display = state.meta && state.meta.chat ? "" : "none";
    paneChat.onclick = () => openChat("company", d.company_id, d.name);
  }

  const manual = d.model === "manual";
  const verdictBlock = d.has_verdict ? `
    <dl class="kv">
      <dt>verdict</dt><dd><span class="${pillClass(d.verdict)}">${escapeHTML(d.verdict)}</span>${manual ? ' <span class="small muted">· set by hand</span>' : ''}</dd>
      <dt>reason</dt><dd>${escapeHTML(d.reason || "")}</dd>
      <dt>model</dt><dd class="small muted">${escapeHTML(d.model || "")}</dd>
      <dt>taste version</dt><dd class="small muted"><span class="tooltip" title="scored ${escapeHTML(d.scored_at)} · model ${escapeHTML(d.model)}">${escapeHTML(d.taste_version || "")}</span></dd>
      <dt>scored at</dt><dd class="small muted">${escapeHTML(d.scored_at || "")}</dd>
    </dl>
  ` : '<div class="muted">Not yet scored. Run <code>scout verdict</code>, or set one by hand below.</div>';

  // Inline override editor — set or correct the verdict by hand. A manual verdict
  // is sticky (the scorer skips it unless re-run with --force). Reason prefills
  // only when the current verdict is already manual, so flipping an LLM call
  // starts from a blank reason rather than the model's stale wording.
  const verdictEditor = `
    <div class="verdict-edit" id="verdict-edit">
      <div class="ve-label muted small">${d.has_verdict ? "override verdict" : "set verdict"}</div>
      <div class="ve-pick" id="ve-pick">
        ${["yes","maybe","no"].map(v =>
          `<button type="button" class="ve-opt${d.has_verdict && d.verdict === v ? " is-on" : ""}" data-v="${v}">${v}</button>`).join("")}
      </div>
      <div class="prow">
        <input class="input" id="ve-reason" placeholder="reason (optional)" value="${manual ? escapeHTML(d.reason || "") : ""}">
        <button class="btn btn-primary" id="ve-save-btn">Save</button>
      </div>
    </div>`;

  const enrichBlock = d.has_enrichment ? `
    <dl class="kv">
      <dt>url</dt><dd>${d.website_url ? `<a href="${safeHref(d.website_url)}" target="_blank" rel="noopener">${escapeHTML(d.website_url)} ↗</a>` : '<span class="muted">—</span>'}</dd>
      <dt>status</dt><dd class="small">${escapeHTML(d.fetch_status || "")}${d.fetch_error ? ` <span class="muted">(${escapeHTML(d.fetch_error)})</span>` : ""}</dd>
      <dt>fetched</dt><dd class="small muted">${escapeHTML(d.fetched_at || "")}</dd>
    </dl>
    ${d.website_summary ? `<div class="summary-box">${escapeHTML(d.website_summary)}</div>` : ""}
  ` : '<div class="muted">No enrichment yet. Run <code>scout enrich</code>.</div>';

  // Per-company stage actions: targeted runs (company_ids) always re-run, so
  // re-score even overwrites a manual verdict. Gated like the sidebar buttons.
  const canControl = !state.meta || state.meta.control !== false;
  const rescoreBtn = canControl && state.meta && state.meta.verdict
    ? '<button class="h3-action" id="rescore-btn" title="re-score just this company — replaces the current verdict, manual or not">↻ re-score</button>' : "";
  const reenrichBtn = canControl && d.domain
    ? '<button class="h3-action" id="reenrich-btn" title="re-fetch this company’s site now">↻ re-enrich</button>' : "";
  const rawRows = Object.keys(d.raw_json || {}).sort();
  const rawHTML = rawRows.length === 0 ? '' : `
    <details class="raw-json">
      <summary>Raw row <span class="dim">(${rawRows.length} fields)</span></summary>
      <table><tbody>
        ${rawRows.map(k => `<tr><td class="k">${escapeHTML(k)}</td><td>${escapeHTML(d.raw_json[k])}</td></tr>`).join("")}
      </tbody></table>
    </details>
  `;

  const flagBar = `
    <div class="flag-bar">
      <span class="fb-state${d.flagged ? " is-flagged" : ""}">
        ${d.flagged ? "⚑ flagged" : "not flagged"}
        <span class="small muted">· ${d.reviewed_at ? `last reviewed ${escapeHTML(d.reviewed_at)}` : "never reviewed"}</span>
      </span>
      <span class="fb-actions">
        <button class="btn${d.flagged ? " flag-on" : ""}" id="flag-toggle-btn" title="${d.flagged ? "unflag" : "flag this company"}">
          ${d.flagged ? "⚑ unflag" : "⚐ flag"}
        </button>
        <button class="btn btn-primary" id="review-stamp-btn" title="stamp this company as reviewed now — the table sorts on it">
          Mark reviewed
        </button>
      </span>
    </div>`;

  document.getElementById("pane-body").innerHTML = `
    ${flagBar}
    <section class="pane-section">
      <h3>
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4V3a1 1 0 011-1h4a1 1 0 011 1v1m-9 0h11a1 1 0 011 1v7a1 1 0 01-1 1H2.5a1 1 0 01-1-1V5a1 1 0 011-1z"/></svg>
        Jobs
      </h3>
      <div id="postings-list">${postingsListHTML(d)}</div>
      <div class="posting-add">
        <input class="input" id="posting-url" placeholder="https://… job posting URL">
        <div class="prow">
          <input class="input" id="posting-title" placeholder="title (optional)">
          <button class="btn btn-primary" id="posting-add-btn">Add</button>
        </div>
      </div>
    </section>

    <section class="pane-section">
      <h3>
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 2.5h6l3 3V13a.5.5 0 01-.5.5h-8A.5.5 0 014 13V3a.5.5 0 010-.5z"/><path d="M9.5 2.5V6h3M6 8.5h4M6 10.5h4"/></svg>
        Notes
      </h3>
      <textarea class="ie ie-notes" id="pane-notes-input" rows="4" placeholder="—">${escapeHTML(d.notes || "")}</textarea>
    </section>

    <section class="pane-section">
      <h3>
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="3" width="11" height="10" rx="1"/><path d="M5 6h6M5 9h4"/></svg>
        Company facts
      </h3>
      <div id="facts-body">${factsEditHTML(d)}</div>
      ${rawHTML}
    </section>

    <section class="pane-section">
      <h3>
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8l3 3 7-7"/></svg>
        Verdict
        ${rescoreBtn}
      </h3>
      ${verdictBlock}
      ${verdictEditor}
    </section>

    <section class="pane-section">
      <h3>
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6"/><path d="M2 8h12M8 2c2 2 3 4 3 6s-1 4-3 6c-2-2-3-4-3-6s1-4 3-6z"/></svg>
        Enrichment
        ${reenrichBtn}
      </h3>
      ${enrichBlock}
    </section>

    <section class="pane-section" id="trace-section">
      <h3>
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6"/><path d="M8 5v3l2 1.5"/></svg>
        Decision trail
      </h3>
      <div id="trace-body"><div class="loading-row"><span class="spinner"></span><span>loading trail…</span></div></div>
    </section>

    <div class="pane-danger">
      <button class="btn-delete" id="company-delete-btn" title="permanently delete this company and everything attached to it">Delete company</button>
    </div>
  `;


  const addPostBtn = document.getElementById("posting-add-btn");
  if (addPostBtn) addPostBtn.addEventListener("click", () => onAddPosting(d));
  wirePostingCards();

  // Verdict override: single-select the yes/maybe/no buttons, then Save.
  document.querySelectorAll("#ve-pick .ve-opt").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#ve-pick .ve-opt").forEach(b => b.classList.remove("is-on"));
      btn.classList.add("is-on");
    });
  });
  const saveVerdictBtn = document.getElementById("ve-save-btn");
  if (saveVerdictBtn) saveVerdictBtn.addEventListener("click", () => onSaveVerdict(d));

  wireInlineField(document.getElementById("pane-title-input"),
    (v) => saveCompanyField(d, "name", v));
  document.querySelectorAll("#facts-body [data-k]").forEach(el =>
    wireInlineField(el, (v) => saveCompanyField(d, el.dataset.k, v)));
  wireInlineField(document.getElementById("pane-domain-input"),
    (v) => saveCompanyDomain(d, v));
  wireInlineField(document.getElementById("pane-notes-input"),
    (v) => saveCompanyNotes(d, v), { multiline: true });

  const flagBtn = document.getElementById("flag-toggle-btn");
  if (flagBtn) flagBtn.addEventListener("click", () => onToggleFlag(d.company_id));

  const reviewBtn = document.getElementById("review-stamp-btn");
  if (reviewBtn) reviewBtn.addEventListener("click", () => onMarkReviewed(d.company_id));

  // Targeted stage runs for this one company. streamJob re-opens the pane on
  // job end, so the fresh enrichment/verdict shows up without a manual reload.
  const rescore = document.getElementById("rescore-btn");
  if (rescore) rescore.addEventListener("click", () => startRun("verdict", { company_ids: [d.company_id] }));
  const reenrich = document.getElementById("reenrich-btn");
  if (reenrich) reenrich.addEventListener("click", () => startRun("enrich", { company_ids: [d.company_id] }));

  const delBtn = document.getElementById("company-delete-btn");
  if (delBtn) delBtn.addEventListener("click", () => openDeleteCompanyModal(d));
}

// factsEditHTML is the always-editable company facts: seamless inline fields
// for website / vertical / location / headcount / stage (auto-save on
// blur/Enter — see the wiring in renderDetail; name lives in the pane header),
// then read-only provenance (source, ingested). Website is special: it's the
// row's identity key, so saving it re-keys the company (saveCompanyDomain).
function factsEditHTML(d) {
  const openLink = d.domain
    ? ` · <a href="https://${escapeHTML(d.domain)}" target="_blank" rel="noopener">open ↗</a>`
    : "";
  return `
    <div class="ie-grid">
      <div class="ie-field"><label>website${openLink}</label>
        <input class="ie" id="pane-domain-input" placeholder="acme.com" value="${escapeHTML(d.domain || "")}"></div>
      <div class="ie-field"><label>vertical</label>
        <input class="ie" data-k="vertical" placeholder="—" value="${escapeHTML(d.vertical || "")}"></div>
      <div class="prow">
        <div class="ie-field"><label>location</label>
          <input class="ie" data-k="location" placeholder="—" value="${escapeHTML(d.location || "")}"></div>
        <div class="ie-field"><label>headcount</label>
          <input class="ie" data-k="headcount" placeholder="—" value="${d.headcount || ""}"></div>
      </div>
      <div class="ie-field"><label>stage</label>
        <input class="ie" data-k="funding_stage" placeholder="—" value="${escapeHTML(d.funding_stage || "")}"></div>
    </div>
    <dl class="kv facts-ro">
      <dt>source</dt><dd class="small muted">${escapeHTML(d.source)} · ${escapeHTML(d.source_id)}</dd>
      <dt>ingested</dt><dd class="small muted">${escapeHTML(d.ingested_at)}</dd>
    </dl>`;
}

// ---- last-reviewed stamp ----
// "Mark reviewed" stamps reviewed_at = now; the table's reviewed column sorts
// on it, so cycling oldest-reviewed-first never lands on the same company twice.
async function onMarkReviewed(id) {
  const btn = document.getElementById("review-stamp-btn");
  if (btn) btn.disabled = true;
  let resp;
  try {
    resp = await fetch(`/api/companies/${id}/reviewed`, { method: "POST" });
  } catch (e) {
    toast(`failed: ${e.message}`);
    if (btn) btn.disabled = false;
    return;
  }
  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    toast(`failed: HTTP ${resp.status}${txt ? " — " + txt : ""}`);
    if (btn) btn.disabled = false;
    return;
  }
  const fresh = await resp.json();
  const row = state.rows.find(r => r.company_id === id);
  if (row) { row.reviewed_at = fresh.reviewed_at; renderList(); }
  if (state.openId === id) {
    renderDetail(fresh);
    loadTrace(id); // renderDetail reset the trace body to a spinner
  }
  toast("reviewed");
}

// ---- flag (hand-set bookmark) ----
// Shared by the row flag buttons and the pane toggle: flips the flag, then
// refreshes the table row and — if it's the open company — the detail pane.
async function onToggleFlag(id) {
  const row = state.rows.find(r => r.company_id === id);
  const next = !(row && row.flagged);
  let resp;
  try {
    resp = await fetch(`/api/companies/${id}/flagged`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ flagged: next }),
    });
  } catch (e) {
    toast(`failed: ${e.message}`);
    return;
  }
  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    toast(`failed: HTTP ${resp.status}${txt ? " — " + txt : ""}`);
    return;
  }
  const fresh = await resp.json();
  if (row) { row.flagged = fresh.flagged; renderList(); }
  if (state.openId === id) {
    renderDetail(fresh);
    loadTrace(id); // renderDetail reset the trace body to a spinner
  }
  loadJobs(); // the jobs view filters on the company's flag
  toast(fresh.flagged ? "flagged" : "unflagged");
}

// ---- manual verdict override ----
async function onSaveVerdict(d) {
  const picked = document.querySelector("#ve-pick .ve-opt.is-on");
  if (!picked) { toast("Pick yes, maybe, or no."); return; }
  const verdict = picked.dataset.v;
  const reason = document.getElementById("ve-reason").value.trim();
  const btn = document.getElementById("ve-save-btn");
  btn.disabled = true;
  let resp;
  try {
    resp = await fetch(`/api/companies/${d.company_id}/verdict`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ verdict, reason }),
    });
  } catch (e) {
    toast(`save failed: ${e.message}`);
    btn.disabled = false;
    return;
  }
  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    toast(`save failed: HTTP ${resp.status}${txt ? " — " + txt : ""}`);
    btn.disabled = false;
    return;
  }
  const fresh = await resp.json();
  renderDetail(fresh);            // re-render pane with the new verdict + editor
  loadTrace(fresh.company_id);    // pull the appended trail row
  loadList();                     // refresh the table pill / reason / sort
  loadStats();                    // refresh the sidebar by-verdict counts
  loadJobs();                     // job rows carry the company verdict
  toast("verdict saved");
}

// ---- job postings ----
// postingsListHTML renders the company pane's jobs list as read-only pursuit
// summaries — same vocabulary as the jobs table. All tracking and outreach
// editing lives in the pursuit panel; clicking a card opens it.
function postingsListHTML(d) {
  const ps = d.postings || [];
  if (!ps.length) return '<div class="muted">No job links yet.</div>';
  return ps.map(p => {
    const meta = [
      p.location,
      p.source === "capture" ? "captured" : "added",
      (p.created_at || "").slice(0, 10),
    ].filter(Boolean).map(escapeHTML).join(" · ");
    const stage = p.application_status || "";
    const status = [
      p.next_up ? '<span class="draft-badge db-next" style="margin-left:0" title="queued next up for outreach">next up</span>' : "",
      `<span class="pill ${stage ? (stageColorClass(stage) || "pill-stage") : "pill-none"}">${escapeHTML(stage || "—")}</span>`,
      `<span class="pt-meta">${stage ? "tracked" : "not applied"}</span>`,
      `<span class="pt-meta">${p.outreach_count ? `${p.outreach_count} sent · last ${escapeHTML(p.last_outreach_at || "?")}` : "no outreach yet"}</span>`,
    ].filter(Boolean).join("");
    return `
    <div class="brain-node posting-card" data-pid="${escapeHTML(p.id)}" title="open the pursuit — tracking, outreach, drafts">
      <div class="n"><a href="${safeHref(p.url)}" target="_blank" rel="noopener">${escapeHTML(p.title || p.url)} ↗</a></div>
      ${p.description ? `<div class="small muted" style="margin-top:3px">${escapeHTML(p.description.length > 200 ? p.description.slice(0, 200).trimEnd() + "…" : p.description)}</div>` : ""}
      ${meta ? `<div class="l" style="margin-top:3px">${meta}</div>` : ""}
      <div class="pcard-status">${status}<span class="pcard-open">open →</span></div>
    </div>`;
  }).join("");
}

// syncCompanyPosting reflects a pursuit-panel edit back into the company pane
// stacked underneath, when it's open and owns this posting. The pane keeps its
// own d.postings cache (it renders read-only summaries); without this, editing a
// posting's title/tracking from the pursuit leaves the card beneath it stale.
// patch carries the changed fields (jobs-row vocabulary maps to posting fields).
function syncCompanyPosting(postingId, patch) {
  const d = state.openDetail;
  if (!d || !state.openId) return;
  const p = (d.postings || []).find(x => String(x.id) === String(postingId));
  if (!p) return; // pane open on a different company
  Object.assign(p, patch);
  const list = document.getElementById("postings-list");
  if (list) { list.innerHTML = postingsListHTML(d); wirePostingCards(); }
}

// wirePostingCards makes each card open its pursuit panel. The panel stacks
// OVER the company pane (the company stays open underneath) — openPursuit
// raises the pursuit layer above it. The external link is guarded out,
// mirroring the jobs-table rows.
function wirePostingCards() {
  document.querySelectorAll("#postings-list .posting-card").forEach(card => {
    card.addEventListener("click", e => {
      if (e.target.closest("a")) return;
      openPursuit(card.dataset.pid);
    });
  });
}

async function onAddPosting(d) {
  const urlEl = document.getElementById("posting-url");
  const titleEl = document.getElementById("posting-title");
  const btn = document.getElementById("posting-add-btn");
  const url = urlEl.value.trim();
  if (!url) { toast("Enter a URL first."); urlEl.focus(); return; }
  btn.disabled = true;
  let resp;
  try {
    resp = await fetch(`/api/companies/${d.company_id}/postings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, title: titleEl.value.trim() }),
    });
  } catch (e) {
    toast(`add failed: ${e.message}`);
    btn.disabled = false;
    return;
  }
  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    toast(`add failed: HTTP ${resp.status}${txt ? " — " + txt : ""}`);
    btn.disabled = false;
    return;
  }
  const p = await resp.json();
  // AddPosting is idempotent by URL — replace the row when it already exists.
  d.postings = (d.postings || []).filter(x => x.id !== p.id);
  d.postings.unshift(p);
  const list = document.getElementById("postings-list");
  if (list) { list.innerHTML = postingsListHTML(d); wirePostingCards(); }
  urlEl.value = ""; titleEl.value = "";
  btn.disabled = false;
  loadJobs(); // keep the jobs view in sync
  toast("link added");
}


// Decision trail: the append-only record of every verdict scoring pass — which
// criteria (source + version) and model drove the verdict, and the verdict it
// produced. Oldest-first, so re-scores read top-to-bottom as the verdict evolves.
async function loadTrace(id) {
  let r;
  try {
    r = await fetch(`/api/companies/${id}/trace`);
  } catch (e) {
    showTrace(`<div class="muted">Failed to load trail: ${escapeHTML(e.message)}</div>`);
    return;
  }
  if (!r.ok) {
    showTrace(`<div class="muted">Failed to load trail: HTTP ${r.status}.</div>`);
    return;
  }
  const events = (await r.json()).events || [];
  if (events.length === 0) {
    showTrace('<div class="muted">No decision trail yet. Run <code>verdict</code> to record one — every scoring pass is captured here.</div>');
    return;
  }
  showTrace(events.map(renderTraceEvent).join(""));
}

function renderTraceEvent(e) {
  const sourceBits = [e.criteria_source, e.taste_version].filter(Boolean).map(escapeHTML);
  if (e.run_id) sourceBits.push("run " + escapeHTML(e.run_id.slice(0, 8)));

  return `
    <div class="trail-event">
      <div class="trail-head">
        <span class="${pillClass(e.verdict)}">${escapeHTML(e.verdict)}</span>
        <span class="trail-meta mono">${escapeHTML(e.model || "")}</span>
        <span class="trail-meta trail-time">${escapeHTML(e.scored_at || "")}</span>
      </div>
      <div class="trail-decision">
        <span class="trail-reason">${escapeHTML(e.reason || "")}</span>
      </div>
      <div class="trail-foot muted small">criteria: ${sourceBits.join(" · ") || "—"}</div>
    </div>`;
}

function showTrace(html) {
  const body = document.getElementById("trace-body");
  if (body) body.innerHTML = html;
}

let toastTimer;
function toast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  // mirror the drawer's error classification: red dot on failures.
  el.classList.toggle("err", /\b(fail(ed)?|error|disabled|already running)\b/i.test(msg));
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2200);
}

// copyToClipboard writes text to the clipboard and toasts the outcome. Uses the
// async Clipboard API (available on localhost/https) with an execCommand
// fallback for the rare insecure context.
async function copyToClipboard(text, okMsg = "copied") {
  if (!text) { toast("nothing to copy"); return; }
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    toast(okMsg);
  } catch (e) {
    toast(`copy failed: ${e.message}`);
  }
}

// ---- control surface: capabilities ----
state.meta = { control: false, brain: false, verdict: false };
async function loadMeta() {
  try {
    const r = await fetch("/api/meta");
    if (!r.ok) return;
    state.meta = await r.json();
  } catch { return; }
  // Gate buttons.
  const ctl = state.meta.control;
  document.getElementById("btn-ingest").disabled = !ctl;
  document.getElementById("btn-enrich").disabled = !ctl;
  const vb = document.getElementById("btn-verdict");
  vb.disabled = !ctl || !state.meta.verdict;
  vb.title = state.meta.verdict ? "" : "set ANTHROPIC_API_KEY in the server env to enable";
  // The global chat entry point appears only when chat is available (API key).
  const chatBtn = document.getElementById("open-chat");
  if (chatBtn) chatBtn.style.display = state.meta.chat ? "" : "none";
  // The Add dialog itself is always available (manual writes need no key);
  // its agent-pass tick is gated on meta.capture inside openAdd().
}

// ---- control surface: runs history ----
async function loadRuns() {
  let data;
  try {
    const r = await fetch("/api/runs");
    if (!r.ok) return;
    data = await r.json();
  } catch { return; }
  // Busy indicator — the spinner row plus a lit state on the running stage's button.
  const busy = data.busy_stage || "";
  const busyEl = document.getElementById("run-busy");
  if (busy) {
    busyEl.style.display = "";
    document.getElementById("run-busy-label").textContent = busy + " running…";
  } else {
    busyEl.style.display = "none";
  }
  document.getElementById("btn-ingest").classList.toggle("busy", busy === "ingest");
  document.getElementById("btn-enrich").classList.toggle("busy", busy === "enrich");
  document.getElementById("btn-verdict").classList.toggle("busy", busy === "verdict");
}

// ---- control surface: run a stage ----
let activeJob = null;
async function startRun(stage, opts) {
  if (state.meta && state.meta.control === false) { toast("control surface disabled"); return; }
  let resp;
  try {
    resp = await fetch(`/api/run/${stage}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(opts || {}),
    });
  } catch (e) { toast(`run failed: ${e.message}`); return; }
  if (resp.status === 409) { toast("a job is already running"); return; }
  if (resp.status === 412) { const t = await resp.text(); toast(t.trim()); return; }
  if (!resp.ok) { toast(`run failed: HTTP ${resp.status}`); return; }
  const { job_id } = await resp.json();
  streamJob(stage, job_id, opts);
}

async function uploadCSV(file) {
  const fd = new FormData();
  fd.append("csv", file);
  let resp;
  try {
    resp = await fetch("/api/ingest", { method: "POST", body: fd });
  } catch (e) { toast(`upload failed: ${e.message}`); return; }
  if (resp.status === 409) { toast("a job is already running"); return; }
  if (!resp.ok) { toast(`upload failed: HTTP ${resp.status}`); return; }
  const { job_id } = await resp.json();
  streamJob("ingest", job_id);
}

// ---- the Add dialog (company or job; the agent pass fills the blanks) ----
const ADD_FIELDS = ["add-url","add-name","add-location","add-headcount","add-title","add-job-company"];
let addVerticals = [];               // available tags from the DB (sorted)
let addVerticalsSel = new Set();     // currently selected tags (original spelling)
let addKind = "company";             // set from the current view on each open

function setAddKind(kind) {
  addKind = kind;
  document.querySelectorAll("#add-kind .v-chip").forEach(b =>
    b.classList.toggle("is-on", b.dataset.kind === kind));
  document.getElementById("add-company-fields").style.display = kind === "company" ? "" : "none";
  document.getElementById("add-job-fields").style.display = kind === "job" ? "" : "none";
  const label = document.getElementById("add-url-label");
  const url = document.getElementById("add-url");
  if (kind === "company") {
    label.innerHTML = 'Website<span class="req">*</span>';
    url.placeholder = "acme.com";
  } else {
    label.innerHTML = 'Posting URL<span class="req">*</span>';
    url.placeholder = "https://… the job posting";
  }
  document.getElementById("add-save").textContent = kind === "company" ? "Add company" : "Add job";
  updateAddNote();
}

function addEnrichOn() {
  return !!state.meta.capture && document.getElementById("add-enrich").checked;
}

// The note under the form spells out exactly what the submit will do — it
// changes with the kind toggle and the agent-pass tick.
function updateAddNote() {
  const note = document.getElementById("add-note");
  if (addEnrichOn()) {
    note.innerHTML = addKind === "company"
      ? "scout fetches the page and fills the blank fields — your values win. The page text also seeds enrichment, so the next Verdict can score it. Pages behind a login wall (LinkedIn) usually can't be fetched."
      : "scout fetches the posting and fills in the title, location and description — your values win. The job attaches to its company, adding it to the list first if needed. Pages behind a login wall (LinkedIn) usually can't be fetched.";
  } else {
    note.innerHTML = addKind === "company"
      ? "Stored as source <code>manual</code>. Run Enrich then Verdict to score it. A website already in the list is rejected — manual adds never overwrite an existing company."
      : "Stored as-is, no fetch. The job attaches to the typed company, or to the link's own domain when the posting lives on the company's site — for an ATS link (greenhouse, lever, …), type the company.";
  }
}

async function openAdd() {
  ADD_FIELDS.forEach(id => { document.getElementById(id).value = ""; });
  document.getElementById("add-vertical-filter").value = "";
  addVerticalsSel = new Set();
  // The agent pass needs the server's Anthropic key; without it the tick is
  // pinned off. With it, the tick is sticky across opens.
  const enrich = document.getElementById("add-enrich");
  const row = document.getElementById("add-enrich-row");
  enrich.disabled = !state.meta.capture;
  row.classList.toggle("disabled", !state.meta.capture);
  row.title = state.meta.capture ? "" : "set ANTHROPIC_API_KEY in the server env to enable";
  if (!state.meta.capture) enrich.checked = false;
  // Default to the tab the user is on — jobs view opens to "job", else company.
  setAddKind(state.view === "jobs" ? "job" : "company");
  // Populate the stage + vertical pickers and the company suggestions from the
  // current DB before showing.
  const stageSel = document.getElementById("add-stage");
  stageSel.innerHTML = '<option value="">—</option>';
  document.getElementById("add-vertical-chips").innerHTML = '<div class="none">loading…</div>';
  document.getElementById("add-company-names").innerHTML =
    (state.rows || []).map(r => `<option value="${escapeHTML(r.name)}">`).join("");
  document.getElementById("add-scrim").classList.add("open");
  document.getElementById("add-url").focus();
  try {
    const f = await (await fetch("/api/facets")).json();
    (f.funding_stages || []).forEach(s => {
      const o = document.createElement("option");
      o.value = s; o.textContent = s; stageSel.appendChild(o);
    });
    addVerticals = f.verticals || [];
  } catch { addVerticals = []; }
  renderVerticalChips();
}
function closeAdd() {
  document.getElementById("add-scrim").classList.remove("open");
}
function renderVerticalChips() {
  const box = document.getElementById("add-vertical-chips");
  const q = document.getElementById("add-vertical-filter").value.trim().toLowerCase();
  const items = addVerticals.filter(v => !q || v.toLowerCase().includes(q));
  if (!items.length) {
    box.innerHTML = `<div class="none">${addVerticals.length ? "no match" : "no verticals in the set yet"}</div>`;
  } else {
    box.innerHTML = items.map(v => {
      const sel = addVerticalsSel.has(v) ? " sel" : "";
      return `<button type="button" class="vchip${sel}" data-v="${escapeHTML(v)}">${escapeHTML(v)}</button>`;
    }).join("");
    box.querySelectorAll(".vchip").forEach(c => c.addEventListener("click", () => {
      const v = c.dataset.v;
      if (addVerticalsSel.has(v)) addVerticalsSel.delete(v); else addVerticalsSel.add(v);
      c.classList.toggle("sel");
      updateVerticalCount();
    }));
  }
  updateVerticalCount();
}
function updateVerticalCount() {
  const n = addVerticalsSel.size;
  document.getElementById("add-vertical-count").textContent = n ? `· ${n} selected` : "";
}
// httpsURL upgrades a bare "acme.com/jobs/1" to a fetchable https URL.
function httpsURL(u) { return /^https?:\/\//i.test(u) ? u : "https://" + u; }

async function submitAdd() {
  const urlEl = document.getElementById("add-url");
  const url = urlEl.value.trim();
  if (!url) {
    toast(addKind === "company" ? "Website is required." : "Posting URL is required.");
    urlEl.focus();
    return;
  }
  const btn = document.getElementById("add-save");
  const label = btn.textContent;
  btn.disabled = true;
  if (addEnrichOn()) btn.textContent = "reading page…";
  const restore = () => { btn.disabled = false; btn.textContent = label; };
  const val = id => document.getElementById(id).value.trim();
  const enriched = addEnrichOn();

  // The three writes behind the one dialog: the agent pass (either kind), the
  // manual company insert, the direct posting insert.
  let endpoint, body;
  if (enriched) {
    endpoint = "/api/capture";
    body = {
      url: httpsURL(url),
      kind: addKind === "company" ? "company_page" : "job_posting",
      fields: addKind === "company"
        ? { name: val("add-name"), location: val("add-location"), headcount: val("add-headcount"),
            funding_stage: document.getElementById("add-stage").value, vertical: [...addVerticalsSel].join(", ") }
        : { name: val("add-job-company"), title: val("add-title") },
    };
  } else if (addKind === "company") {
    endpoint = "/api/companies";
    body = {
      website: url, name: val("add-name"), vertical: [...addVerticalsSel].join(", "),
      location: val("add-location"), headcount: val("add-headcount"),
      funding_stage: document.getElementById("add-stage").value,
    };
  } else {
    endpoint = "/api/postings";
    body = { url: httpsURL(url), title: val("add-title"), company: val("add-job-company") };
  }

  let resp;
  try {
    resp = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (e) { toast(`add failed: ${e.message}`); restore(); return; }
  if (!resp.ok) {
    let msg = `HTTP ${resp.status}`;
    try {
      const t = await resp.text();
      try { msg = JSON.parse(t).error || msg; } catch { msg = t.trim() || msg; }
    } catch {}
    restore();
    if (resp.status === 409) { // already in the list — keep the form open to edit the website
      toast(msg || "That company is already in the list.");
      urlEl.focus(); urlEl.select();
      return;
    }
    toast(`add failed: ${msg}`);
    return;
  }
  const res = await resp.json();
  restore();

  // The agent pass can decline to write (kind "other", unidentifiable
  // company) — reported honestly, with the dialog kept open for a fix.
  if (enriched && !res.company_id) {
    toast(res.note || "couldn't classify that page");
    return;
  }
  closeAdd();
  loadList(); loadStats(); loadJobs();
  if (addKind === "job") {
    const what = (res.posting && res.posting.title) || "job link";
    toast(`tracking: ${what} @ ${res.company_name}${res.posting_updated ? " (refreshed)" : ""}`);
    setView("jobs");
  } else if (enriched) {
    // res.note carries the honest outcome when the page couldn't be read but
    // the company landed anyway (bare record); otherwise the plain add toast.
    toast(res.note || (res.company_created ? `company added: ${res.company_name}` : `${res.company_name} is already in the list`));
    openDetail(res.company_id);
  } else {
    toast("company added");
  }
}

function streamJob(stage, jobId, opts) {
  activeJob = jobId;
  const drawer = document.getElementById("drawer");
  const log = document.getElementById("drawer-log");
  document.getElementById("drawer-title").textContent = stage;
  document.getElementById("drawer-spinner").style.display = "";
  document.getElementById("drawer-cancel").style.display = "";
  document.getElementById("drawer-close").style.display = "none";
  log.innerHTML = "";
  drawer.classList.add("open");
  loadRuns(); // reflect the new running row

  const es = new EventSource(`/api/jobs/${jobId}/stream`);
  const appendLine = (text, isErr) => {
    const div = document.createElement("div");
    // "warn:"-prefixed lines (e.g. ingest collisions) get the amber gutter and a
    // ⚠ glyph in place of the prefix; error lines win over warn.
    const isWarn = !isErr && /^\s*warn:/i.test(text);
    div.className = "ln" + (isErr ? " ln-err" : isWarn ? " ln-warn" : "");
    div.textContent = isWarn ? text.replace(/^\s*warn:\s*/i, "⚠ ") : text;
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
  };
  es.addEventListener("line", e => appendLine(e.data, /error|failed/i.test(e.data)));
  es.addEventListener("end", e => {
    es.close();
    activeJob = null;
    appendLine(`— ${e.data} —`, e.data === "failed");
    document.getElementById("drawer-spinner").style.display = "none";
    document.getElementById("drawer-cancel").style.display = "none";
    document.getElementById("drawer-close").style.display = "";
    toast(`${stage} ${e.data}`);
    // Refresh what the run could have changed. A targeted run (the open pane's
    // "↻ re-score" / "re-enrich", which pass company_ids) patches just those
    // rows in place — a full loadList() wipes and rebuilds the whole table,
    // which flashes the screen behind the open side panel. A bulk run can touch
    // any row, so it still does the full refresh.
    const targeted = opts && Array.isArray(opts.company_ids) && opts.company_ids.length > 0;
    if (targeted) {
      updateCompanyRows(opts.company_ids);
    } else {
      loadList();
    }
    loadStats(); loadRuns(); loadJobs();
    if (state.openId) openDetail(state.openId); // open pane: show fresh enrichment/verdict
  });
  es.onerror = () => { es.close(); }; // server closed or network; 'end' usually fired first
}

async function cancelActiveJob() {
  if (!activeJob) return;
  try { await fetch(`/api/jobs/${activeJob}/cancel`, { method: "POST" }); } catch {}
}

// ---- control surface: editor ----
let editorKind = null;
// editorLabel names the artifact in the modal title / save toast. The playbook,
// outreach template, and pre-filter rules are DB rows (no file extension); taste
// (the narrative fallback) is still a file.
const STAGE_LABELS: Record<string, string> = {
  researcher: "researcher", fill: "writer", humanizer: "humanizer", honesty: "honesty check",
};
// isStatusListKind marks the two configurable status vocabularies, which the
// editor handles as a one-label-per-line list (PUT {statuses:[...]}) rather than
// the usual {content} text artifact.
function isStatusListKind(kind) {
  return kind === "application-stages" || kind === "outreach-statuses";
}
function editorLabel(kind) {
  if (kind === "outreach-template") return "outreach template";
  if (kind === "followup-template") return "follow-up template";
  if (kind === "taste-filter") return "pre-filter rules";
  if (kind === "playbook") return "playbook";
  if (kind === "application-stages") return "application stages";
  if (kind === "outreach-statuses") return "outreach statuses";
  if (kind && kind.startsWith("outreach-prompts/")) {
    const stage = kind.slice("outreach-prompts/".length);
    return (STAGE_LABELS[stage] || stage) + " prompt";
  }
  return kind + ".md";
}

async function openEditor(kind) {
  editorKind = kind;
  const scrim = document.getElementById("editor-scrim");
  document.getElementById("editor-title").textContent = "edit " + editorLabel(kind);
  document.getElementById("editor-text").value = "loading…";
  document.getElementById("editor-ver").textContent = "";
  // The enable toggle shows for the pre-filter and for skippable pipeline stages
  // (every stage but the Writer/fill). The reset button shows for pipeline stages.
  const isPipeline = !!kind && kind.startsWith("outreach-prompts/");
  const pipelineStage = isPipeline ? kind.slice("outreach-prompts/".length) : "";
  const showToggle = kind === "taste-filter" || (isPipeline && pipelineStage !== "fill");
  document.getElementById("editor-toggle-row").style.display = showToggle ? "" : "none";
  document.getElementById("editor-reset").style.display = isPipeline ? "" : "none";
  if (showToggle) document.getElementById("editor-toggle-label").textContent = kind === "taste-filter"
    ? "Enable the pre-filter (off → bulk verdict runs score every company; the rules below are kept either way)"
    : "Run this stage (off → it is skipped in the pipeline)";
  scrim.classList.add("open");
  try {
    const r = await fetch(`/api/${kind}`);
    if (!r.ok) {
      const t = (await r.text().catch(() => "")).trim();
      document.getElementById("editor-text").value = r.status === 404
        ? "failed to load: HTTP 404 — this route is missing. Restart the scout server (your running binary may predate this feature)."
        : `failed to load: ${t || "HTTP " + r.status}`;
      return;
    }
    const d = await r.json();
    if (isStatusListKind(kind)) {
      document.getElementById("editor-title").textContent = "edit " + editorLabel(kind) + " — one per line";
      document.getElementById("editor-text").value = (d.statuses || []).join("\n");
    } else {
      document.getElementById("editor-text").value = d.content || "";
    }
    if (showToggle) (document.getElementById("editor-enabled") as HTMLInputElement).checked = d.enabled !== false;
    if (d.taste_version) document.getElementById("editor-ver").textContent = "version " + d.taste_version;
  } catch (e) {
    document.getElementById("editor-text").value = "failed to load: " + e.message;
  }
}
function closeEditor() {
  document.getElementById("editor-scrim").classList.remove("open");
  editorKind = null;
}

// ---- control surface: outreach knowledge (read-only) ----
//
// The discovered experience + voice + logistics bundle (brain pages, whole-fetched
// + cached) syncs automatically from the brain — there is no refresh or edit. The
// modal is a read-only peek at what the brain resolved per need, so you can see
// what's grounding your drafts. DEFAULT_NEEDS mirrors the server's KnowledgeNeeds
// for the case where the response omits the needs list.
const DEFAULT_NEEDS = [{ key: "experience", hard: true }, { key: "voice", hard: false }, { key: "logistics", hard: false }];

async function openSourcesModal() {
  document.getElementById("sources-scrim").classList.add("open");
  document.getElementById("sources-list").innerHTML =
    `<div class="loading-row"><span class="spinner"></span><span>loading…</span></div>`;
  try {
    renderSourcesList(await (await fetch("/api/outreach/sources")).json());
  } catch (e) { toast(`failed to load sources: ${e.message}`); }
}
function closeSourcesModal() {
  document.getElementById("sources-scrim").classList.remove("open");
}
// renderSourcesList groups the cached sources by need (experience required,
// voice/logistics optional), read-only. Needs come capitalized from Go's KnowledgeNeeds.
function renderSourcesList(data) {
  const host = document.getElementById("sources-list");
  if (!host) return;
  const needs = (data && data.needs && data.needs.length)
    ? data.needs.map(n => ({ key: n.Key || n.key, hard: n.Hard ?? n.hard }))
    : DEFAULT_NEEDS;
  const byNeed = {};
  ((data && data.sources) || []).forEach(s => { (byNeed[s.need] = byNeed[s.need] || []).push(s); });
  host.innerHTML = needs.map(n => {
    const rows = byNeed[n.key] || [];
    const items = rows.length
      ? rows.map(s => `<li><span class="src-title">${escapeHTML(s.title || s.page_id)}</span></li>`).join("")
      : `<li class="dim small">${n.hard ? "none yet — add an experience page to your brain" : "none (optional)"}</li>`;
    return `<div class="src-need">
      <div class="src-need-h">${escapeHTML(n.key)}${n.hard ? ' <span class="dim">required</span>' : ' <span class="dim">optional</span>'}</div>
      <ul class="src-items">${items}</ul></div>`;
  }).join("");
}

async function saveEditor() {
  if (!editorKind) return;
  const text = document.getElementById("editor-text").value;
  // The two status vocabularies save as a {statuses:[...]} list (one label per
  // line); everything else is a {content} text artifact (some with an on/off
  // switch — the pre-filter and skippable pipeline stages).
  let body;
  if (isStatusListKind(editorKind)) {
    body = { statuses: text.split(/\r?\n/).map(s => s.trim()).filter(Boolean) };
  } else {
    body = { content: text };
    const isPipelineStage = editorKind.startsWith("outreach-prompts/") && editorKind !== "outreach-prompts/fill";
    if (editorKind === "taste-filter" || isPipelineStage) body.enabled = (document.getElementById("editor-enabled") as HTMLInputElement).checked;
  }
  let resp;
  try {
    resp = await fetch(`/api/${editorKind}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (e) { toast(`save failed: ${e.message}`); return; }
  if (!resp.ok) { toast(`save failed: ${(await resp.text().catch(() => "")).trim() || "HTTP " + resp.status}`); return; }
  const d = await resp.json();
  if (d.taste_version) document.getElementById("editor-ver").textContent = "version " + d.taste_version;
  const wasStatusList = isStatusListKind(editorKind);
  // Keep the in-memory follow-up template current so the per-contact "Follow up"
  // button renders the new text without a reload.
  if (editorKind === "followup-template") state.followupTemplate = text;
  toast(`${editorLabel(editorKind)} saved`);
  closeEditor();
  if (wasStatusList) loadStatusVocab(); // refresh the jobs-view dropdowns + filter chips
  loadStats(); // refresh the criteria version shown in the sidebar
}

// resetEditor reverts a pipeline stage's prompt to the compiled-in default
// (PUT {reset:true}) and reloads the editor so the default text shows.
async function resetEditor() {
  if (!editorKind || !editorKind.startsWith("outreach-prompts/")) return;
  let resp;
  try {
    resp = await fetch(`/api/${editorKind}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reset: true }),
    });
  } catch (e) { toast(`reset failed: ${e.message}`); return; }
  if (!resp.ok) { toast(`reset failed: HTTP ${resp.status}`); return; }
  const d = await resp.json();
  document.getElementById("editor-text").value = d.content || "";
  toast(`${editorLabel(editorKind)} reset to default`);
}

// ---- wiring ----
// Header clicks cycle asc → desc → cleared: a third click on the active column
// drops back to the table's default order (so the sort can be removed, not just
// flipped). Object.assign keeps the same state object the render path reads.
function cycleSort(cur, k, def) {
  if (cur.k !== k) { cur.k = k; cur.dir = 1; }       // new column → ascending
  else if (cur.dir === 1) { cur.dir = -1; }          // ascending → descending
  else Object.assign(cur, def);                       // descending → cleared (default)
}
document.querySelectorAll("#t thead th[data-k]").forEach(th => {
  th.onclick = () => {
    cycleSort(state.sort, th.dataset.k, DEFAULT_SORT);
    renderList();
  };
});
document.querySelectorAll("#jt thead th[data-jk]").forEach(th => {
  th.onclick = () => {
    cycleSort(state.jsort, th.dataset.jk, DEFAULT_JSORT);
    renderJobs();
  };
});
document.getElementById("tab-companies").onclick = () => setView("companies");
document.getElementById("tab-jobs").onclick = () => setView("jobs");
// Companies filter block — search plus the Filters dropdown.
document.getElementById("q").oninput = renderList;
// Companies Filters menu: the verdict checklist plus the flagged / enriched toggles.
document.getElementById("fdrop-cfilters-menu").addEventListener("click", e => {
  const it = e.target.closest(".fdrop-item");
  if (!it) return;
  if (it.dataset.toggle === "flagged") { flagOnly = !flagOnly; setItemChecked(it, flagOnly); }
  else if (it.dataset.toggle === "enriched") { enrichedOnly = !enrichedOnly; setItemChecked(it, enrichedOnly); }
  else if (it.hasAttribute("data-v")) {
    const v = it.getAttribute("data-v");
    if (verdictFilter.has(v)) verdictFilter.delete(v); else verdictFilter.add(v);
    setItemChecked(it, verdictFilter.has(v));
  } else return;
  renderList();
});
// Columns menu: each row is a column; toggling adds/removes it from the active
// view's hidden set (persisted), then re-applies visibility.
document.getElementById("fdrop-columns-menu").addEventListener("click", e => {
  const it = e.target.closest(".fdrop-item[data-col]");
  if (!it) return;
  const cs = colState(); // re-resolve: the view may have changed since render
  const k = it.getAttribute("data-col");
  if (cs.hidden.has(k)) cs.hidden.delete(k); else cs.hidden.add(k);
  localStorage.setItem(cs.key, JSON.stringify([...cs.hidden]));
  setItemChecked(it, !cs.hidden.has(k));
  applyColumnVisibility();
  updateColumnsBadge();
});
// Jobs filter block — its own search plus the combined Filters dropdown.
document.getElementById("jq").oninput = renderJobs;
// Each dropdown button toggles its menu; opening one closes the others. A click
// anywhere else closes them. Clicks inside a menu are multi-select, so they
// don't close it. The menus' contents are rebuilt on demand, but the containers
// are static — so item clicks are handled by delegation and survive a re-render.
for (const id of ["fdrop-cfilters", "fdrop-columns", "fdrop-jfilters"]) {
  const drop = document.getElementById(id);
  const btn = drop.querySelector(".fdrop-btn");
  btn.addEventListener("click", e => {
    e.stopPropagation();
    const open = drop.classList.contains("is-open");
    closeAllDropdowns();
    if (!open) openDropdown(drop);
  });
  drop.querySelector(".fdrop-menu").addEventListener("click", e => e.stopPropagation());
}
document.addEventListener("click", closeAllDropdowns);
// Jobs Filters menu: stage checklist + next-up/not-reached toggles + reply status.
document.getElementById("fdrop-jfilters-menu").addEventListener("click", e => {
  const it = e.target.closest(".fdrop-item");
  if (!it) return;
  if (it.hasAttribute("data-stage")) {
    const s = it.getAttribute("data-stage");
    if (jobStageSel.has(s)) jobStageSel.delete(s); else jobStageSel.add(s);
    setItemChecked(it, jobStageSel.has(s));
  } else if (it.dataset.toggle === "nextup") { nextUpOnly = !nextUpOnly; setItemChecked(it, nextUpOnly); }
  else if (it.dataset.toggle === "notreached") { notReachedOnly = !notReachedOnly; setItemChecked(it, notReachedOnly); }
  else if (it.hasAttribute("data-status")) {
    const v = it.getAttribute("data-status");
    if (outreachSel.has(v)) outreachSel.delete(v); else outreachSel.add(v);
    setItemChecked(it, outreachSel.has(v));
  } else return;
  renderJobs();
});
renderCompanyFilterMenu();
renderColumnsMenu();
applyColumnVisibility(); // hide chosen thead cells before the first data load

document.getElementById("pane-close").onclick = closeDetail;
document.getElementById("scrim").onclick = closeDetail;
document.getElementById("pursuit-close").onclick = closePursuit;
document.getElementById("pursuit-scrim").onclick = closePursuit;
document.addEventListener("keydown", e => {
  if (e.key !== "Escape") return;
  // An open filter dropdown is the topmost lightweight UI — peel it first.
  if (document.querySelector(".fdrop.is-open")) { closeAllDropdowns(); return; }
  // Chat sits on top of whatever opened it (a pane or the global view) — peel it first.
  if (document.getElementById("chat-pane").classList.contains("open")) { closeChat(); return; }
  if (docsOpen()) { closeDocs(); return; }
  if (document.getElementById("profile-scrim").classList.contains("open")) { closeProfileModal(); return; }
  if (document.getElementById("add-scrim").classList.contains("open")) { closeAdd(); return; }
  if (document.getElementById("run-scrim").classList.contains("open")) { closeRunConfirm(); return; }
  if (document.getElementById("help-scrim").classList.contains("open")) { closeHelp(); return; }
  // The relink modal sits on top of the pursuit panel — peel it before the panes.
  if (document.getElementById("relink-scrim").classList.contains("open")) { closeRelinkModal(); return; }
  // The delete-company confirm sits on top of the company pane — peel it first.
  if (document.getElementById("delcompany-scrim").classList.contains("open")) { closeDeleteCompanyModal(); return; }
  // The delete-job confirm sits on top of the pursuit panel — peel it first too.
  if (document.getElementById("deljob-scrim").classList.contains("open")) { closeDeleteJobModal(); return; }
  // The company pane and the pursuit panel can stack either way; peel whichever
  // raisePane() last lifted to the top, falling back to whichever is open.
  const companyOpen = document.getElementById("pane").classList.contains("open");
  const pursuitOpen = document.getElementById("pursuit-pane").classList.contains("open");
  if (companyOpen || pursuitOpen) {
    if (topPane === "pursuit" && pursuitOpen) { closePursuit(); return; }
    if (topPane === "company" && companyOpen) { closeDetail(); return; }
    if (companyOpen) { closeDetail(); return; }
    closePursuit(); return;
  }
  if (document.getElementById("key-scrim").classList.contains("open")) { closeKeyModal(); return; }
  if (document.getElementById("sources-scrim").classList.contains("open")) { closeSourcesModal(); return; }
  if (document.getElementById("editor-scrim").classList.contains("open")) { closeEditor(); return; }
  if (document.getElementById("settings-scrim").classList.contains("open")) { closeSettings(); return; }
});

// run controls — Enrich / Verdict open a confirmation modal that carries the
// "only blanks" scope toggle (formerly a sidebar chip).
let pendingStage = null;
const runDescs = {
  enrich: "Fetches and summarizes each company's pages, filling its enrichment row.",
  verdict: "Scores every company against your criteria — one LLM call each. Only companies with a successful enrichment are scored.",
};
function openRunConfirm(stage) {
  if (state.meta && state.meta.control === false) { toast("control surface disabled"); return; }
  pendingStage = stage;
  document.getElementById("run-title").textContent = "Run " + stage;
  document.getElementById("run-desc").textContent = runDescs[stage] || "";
  document.getElementById("run-only-blanks").checked = false;
  // Default parallelism per stage — verdict is API-bound (10), enrich is
  // network-bound (8). Clamped server-side to [1,24].
  document.getElementById("run-workers-input").value = stage === "verdict" ? 10 : 8;
  // Verdict only scores companies that already have a successful enrichment
  // row, so warn up front when some are still un-enriched — otherwise they're
  // silently skipped. Counts come from state.stats (refreshed after every run).
  const warn = document.getElementById("run-warn");
  const s = state.stats || {};
  const unenriched = Math.max(0, (s.total_companies || 0) - (s.enriched_ok || 0));
  if (stage === "verdict" && unenriched > 0) {
    document.getElementById("run-warn-text").textContent =
      `${unenriched} ${unenriched === 1 ? "company isn't" : "companies aren't"} enriched yet — verdict will skip ${unenriched === 1 ? "it" : "them"}. Run Enrich first to include ${unenriched === 1 ? "it" : "them"}.`;
    warn.style.display = "";
  } else {
    warn.style.display = "none";
  }
  document.getElementById("run-scrim").classList.add("open");
}
function closeRunConfirm() {
  document.getElementById("run-scrim").classList.remove("open");
  pendingStage = null;
}
document.getElementById("btn-enrich").onclick = () => openRunConfirm("enrich");
document.getElementById("btn-verdict").onclick = () => openRunConfirm("verdict");
document.getElementById("run-cancel").onclick = closeRunConfirm;
document.getElementById("run-scrim").onclick = e => { if (e.target.id === "run-scrim") closeRunConfirm(); };
document.getElementById("run-go").onclick = () => {
  const stage = pendingStage;
  const blanks = document.getElementById("run-only-blanks").checked;
  const workers = parseInt(document.getElementById("run-workers-input").value, 10);
  closeRunConfirm();
  if (!stage) return;
  const opts = {};
  if (blanks) opts.only_blanks = true;
  if (workers > 0) opts.workers = workers;
  startRun(stage, opts);
};
document.getElementById("btn-ingest").onclick = () => document.getElementById("csv-file").click();
document.getElementById("btn-add").onclick = openAdd;

// section help — a "?" per sidebar section opens a short explainer of its
// buttons, each with a "Learn more" link into the docs overlay.
const helpContent = {
  add: {
    title: "Add data",
    intro: "Two ways to get companies and jobs into scout.",
    items: [
      { name: "Ingest CSV", sec: "ingest",
        desc: "Bulk-import companies from a CSV export (e.g. Crunchbase). Columns are mapped to company fields and new rows are created." },
      { name: "Add", sec: "ingest",
        desc: "Add one company or job from its link. Tick “fill in the blanks” to let an ATS API (ashby/greenhouse/lever) or one cheap agent pass complete the details." },
    ],
  },
  run: {
    title: "Run the pipeline",
    intro: "Enrich must run before Verdict — verdict only scores companies that already have a successful enrichment row.",
    items: [
      { name: "Enrich", sec: "enrich",
        desc: "Fetches and summarizes each company's web presence into an enrichment row. A prerequisite for Verdict." },
      { name: "Verdict", sec: "verdict",
        desc: "Scores each enriched company against your criteria with the LLM, producing a yes / maybe / no with reasoning." },
    ],
  },
};
function openHelp(key) {
  const c = helpContent[key];
  if (!c) return;
  document.getElementById("help-title").textContent = c.title;
  const wrap = document.getElementById("help-items");
  wrap.innerHTML = "";
  if (c.intro) {
    const p = document.createElement("p");
    p.className = "help-intro";
    p.textContent = c.intro;
    wrap.appendChild(p);
  }
  c.items.forEach(it => {
    const row = document.createElement("div");
    row.className = "help-item";
    const name = document.createElement("div");
    name.className = "help-item-name";
    name.textContent = it.name;
    const desc = document.createElement("div");
    desc.className = "help-item-desc";
    desc.textContent = it.desc;
    const link = document.createElement("a");
    link.className = "help-link";
    link.textContent = "Learn more →";
    link.onclick = () => { closeHelp(); openDocs(); goToDocSection(it.sec); };
    row.appendChild(name); row.appendChild(desc); row.appendChild(link);
    wrap.appendChild(row);
  });
  document.getElementById("help-scrim").classList.add("open");
}
function closeHelp() { document.getElementById("help-scrim").classList.remove("open"); }
document.getElementById("help-add").onclick = () => openHelp("add");
document.getElementById("help-run").onclick = () => openHelp("run");
document.getElementById("help-close").onclick = closeHelp;
document.getElementById("help-scrim").onclick = e => { if (e.target.id === "help-scrim") closeHelp(); };
document.getElementById("add-cancel").onclick = closeAdd;
document.getElementById("add-save").onclick = submitAdd;
document.getElementById("add-scrim").onclick = e => { if (e.target.id === "add-scrim") closeAdd(); };
document.querySelectorAll("#add-kind .v-chip").forEach(b => { b.onclick = () => setAddKind(b.dataset.kind); });
document.getElementById("add-enrich").addEventListener("change", updateAddNote);
// Enter in a text field submits — but not in the vertical filter (where Enter
// would prematurely submit while narrowing chips), not in the company picker
// (where Enter commits a datalist suggestion), nor on chips/select/checkbox.
document.getElementById("add-scrim").addEventListener("keydown", e => {
  if (e.key !== "Enter") return;
  if (e.target.tagName !== "INPUT" || e.target.type === "checkbox") return;
  if (e.target.id === "add-vertical-filter" || e.target.id === "add-job-company") return;
  e.preventDefault();
  submitAdd();
});
document.getElementById("add-vertical-filter").addEventListener("input", renderVerticalChips);
// Headcount: digits only (no spinner buttons, since it's a text input).
document.getElementById("add-headcount").addEventListener("input", e => {
  const cleaned = e.target.value.replace(/[^0-9]/g, "");
  if (cleaned !== e.target.value) e.target.value = cleaned;
});
document.getElementById("csv-file").onchange = e => {
  const f = e.target.files && e.target.files[0];
  if (f) uploadCSV(f);
  e.target.value = ""; // allow re-selecting the same file
};
document.getElementById("drawer-cancel").onclick = cancelActiveJob;
document.getElementById("drawer-close").onclick = () => document.getElementById("drawer").classList.remove("open");

// editor (edit-taste / edit-playbook links are wired in renderCriteria, since
// the Criteria block re-renders them dynamically)
document.getElementById("editor-cancel").onclick = closeEditor;
document.getElementById("editor-save").onclick = saveEditor;
document.getElementById("editor-reset").onclick = resetEditor;
document.getElementById("editor-scrim").onclick = e => {
  if (e.target.id === "editor-scrim") closeEditor();
};
document.getElementById("sources-close").onclick = closeSourcesModal;
document.getElementById("sources-scrim").onclick = e => {
  if (e.target.id === "sources-scrim") closeSourcesModal();
};

document.getElementById("key-cancel").onclick = closeKeyModal;
document.getElementById("key-save").onclick = saveKey;
document.getElementById("key-remove").onclick = removeKey;
document.getElementById("key-scrim").onclick = e => {
  if (e.target.id === "key-scrim") closeKeyModal();
};
document.getElementById("key-input").addEventListener("keydown", e => {
  if (e.key === "Enter") { e.preventDefault(); saveKey(); }
});

// delete-company confirm modal
document.getElementById("delcompany-cancel").onclick = closeDeleteCompanyModal;
document.getElementById("delcompany-confirm").onclick = onConfirmDeleteCompany;
document.getElementById("delcompany-scrim").onclick = e => {
  if (e.target.id === "delcompany-scrim") closeDeleteCompanyModal();
};

// delete-job confirm modal (jobs-view mirror of the company delete)
document.getElementById("deljob-cancel").onclick = closeDeleteJobModal;
document.getElementById("deljob-confirm").onclick = onConfirmDeleteJob;
document.getElementById("deljob-scrim").onclick = e => {
  if (e.target.id === "deljob-scrim") closeDeleteJobModal();
};

// relink search modal (move a job to another company)
document.getElementById("relink-cancel").onclick = closeRelinkModal;
document.getElementById("relink-scrim").onclick = e => {
  if (e.target.id === "relink-scrim") closeRelinkModal();
};
document.getElementById("relink-search").addEventListener("input", e => {
  renderRelinkResults(e.target.value);
});
document.getElementById("relink-search").addEventListener("keydown", e => {
  if (e.key === "Enter") {
    e.preventDefault();
    const first = document.querySelector("#relink-results .relink-result:not([disabled])");
    if (first) chooseRelinkCompany(first.dataset.id);
  }
});
document.getElementById("relink-results").addEventListener("click", e => {
  const btn = e.target.closest(".relink-result");
  if (btn && !btn.disabled) chooseRelinkCompany(btn.dataset.id);
});

// ---- company-fit brief + criteria block ----
function relTime(sec) {
  if (sec == null) return "—";
  let s = Math.max(0, sec | 0);
  if (s < 90) return `${s}s ago`;
  const m = Math.round(s / 60); if (m < 90) return `${m}m ago`;
  const h = Math.round(m / 60); if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

async function loadProfile() {
  try {
    const r = await fetch("/api/profile");
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    state.profile = await r.json();
  } catch {
    state.profile = null;
  }
  renderCriteria();
}

// renderCriteria draws the Criteria block: the active "what the user wants"
// source (the company-fit brief when the brain is live — click the name to view,
// icon button to re-distill — or taste.md when the brain is offline — editable),
// the always-editable playbook. Driven by
// state.profile + state.stats.
const PENCIL = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M11.6 2.4a1.2 1.2 0 0 1 1.7 1.7L5.6 11.8l-3 1 1-3z"/><path d="M10.4 3.6l2 2"/></svg>';
const REFRESH = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M13.4 8a5.4 5.4 0 1 1-1.5-3.8"/><path d="M13.6 2.6V5.2H11"/></svg>';

// Per-item glyphs for the settings cards.
const ICON_KEY = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="5" cy="11" r="2.6"/><path d="M6.9 9.1 13 3M11 5l1.6 1.6M9.3 6.7l1.6 1.6"/></svg>';
const ICON_BRIEF = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6.2"/><circle cx="8" cy="8" r="2.4"/></svg>';
const ICON_PLAYBOOK = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3.2h7.2a1.6 1.6 0 0 1 1.6 1.6v8H4.6A1.6 1.6 0 0 1 3 11.2z"/><path d="M11.8 12.8h1.4v-9A1.6 1.6 0 0 0 11.6 2.4H5.4"/><path d="M5.4 5.8h3.6M5.4 8.2h3.6"/></svg>';
const ICON_EMAIL = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3.5" width="12" height="9" rx="1.6"/><path d="M2.6 4.6 8 8.8l5.4-4.2"/></svg>';
const ICON_PROMPT = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 2.2h5.4l2.6 2.6v9H4z"/><path d="M9.4 2.2v2.6H12"/><path d="M6 7h4M6 9.2h4M6 11.4h2.4"/></svg>';
const ICON_KNOWLEDGE = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M8 1.6v2M8 12.4v2M14.4 8h-2M3.6 8h-2M12.5 3.5 11 5M5 11l-1.5 1.5M12.5 12.5 11 11M5 5 3.5 3.5"/><circle cx="8" cy="8" r="2.2"/></svg>';
const ICON_FILTER = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M2.4 3.4h11.2L9.4 8.4v4.2l-2.8 1.4V8.4z"/></svg>';

// One settings card: icon tile, name (optionally a clickable link), description,
// a status line (dot + note) for brain-backed items, and a trailing action.
// Both the name link and the action button carry data-act so renderCriteria can
// wire them by action key — never by id, since the name and the button can share
// an action (edit cards) and getElementById would only find one. actID is set
// ONLY on the refresh buttons, which look themselves up by id to spin.
function critCard(o: { icon: string; nameHTML: string; desc: string; dot?: string; note?: string; act?: string; actID?: string; actIcon?: string; actTitle?: string; actLabel?: string; }): string {
  const status = (o.dot || o.note)
    ? `<div class="crit-status">${o.dot ? `<span class="pf-dot ${o.dot}"></span>` : ""}${o.note ? `<span class="crit-note-t">${escapeHTML(o.note)}</span>` : ""}</div>`
    : "";
  const idAttr = o.actID ? ` id="${o.actID}"` : "";
  // A card without an action (e.g. brain-synced outreach knowledge) renders no
  // trailing button — it's a passive status row, not a knob.
  const action = o.act
    ? `<button class="crit-edit"${idAttr} data-act="${o.act}" title="${o.actTitle}" aria-label="${o.actLabel}">${o.actIcon}</button>`
    : "";
  return `<div class="settings-item">
    <span class="settings-item-icon">${o.icon}</span>
    <div class="settings-item-main">
      <div class="settings-item-name">${o.nameHTML}</div>
      <div class="settings-item-desc">${escapeHTML(o.desc)}</div>
      ${status}
    </div>
    ${action}
  </div>`;
}

function renderCriteria() {
  const el = document.getElementById("criteria-stats");
  if (!el) return;
  const p = state.profile;
  const active = (p && p.active_source) || (state.stats && state.stats.taste_source) || "";
  const usingBrain = active.startsWith("brain:");
  const hasBody = p && typeof p.body === "string";

  // Cards are built here, then grouped for display below by domain (Job hunting /
  // Outreach / Integrations), not by origin. Brain-derived cards (criteria brief +
  // discovered outreach knowledge) are pulled from the brain and refreshed, not
  // authored in scout — except the taste.md offline fallback, which stands in for
  // the brief when the brain is down and is the one editable member.
  let briefCard: string;
  if (usingBrain) {
    // Honest tri-state from the change-aware cascade (criteria_state), replacing
    // the old age>=TTL "stale" badge: 'current' is confirmed against the brain,
    // 'changed' means the brain moved (re-distill via Refresh), 'unverified' means
    // we can't confirm right now (brain offline, or never verified).
    let dot = "off", note = "";
    const cs = p && p.criteria_state;
    if (cs === "current") { dot = "ok"; note = "current · verified " + relTime(p.verified_age_seconds); }
    else if (cs === "changed") { dot = "warn"; note = "changed — re-distill"; }
    else if (cs === "unverified") {
      dot = "warn";
      note = (p && !p.reachable && hasBody) ? "brain offline · using cache" : "unverified — re-distill";
    }
    else if (p && !p.reachable && hasBody) { dot = "warn"; note = "brain offline · using cache"; }
    else if (hasBody) { dot = "ok"; note = "fetched " + relTime(p.age_seconds); }
    const name = hasBody
      ? '<span class="edit-link" data-act="view-profile" title="view the company-fit brief">company-fit brief</span>'
      : 'company-fit brief';
    briefCard = critCard({
      icon: ICON_BRIEF, nameHTML: name, dot, note,
      desc: "The criteria scout feeds the verdict stage — distilled from the brain.",
      act: "refresh-profile", actID: "refresh-profile", actIcon: REFRESH,
      actTitle: "re-distill the company-fit brief from the brain", actLabel: "refresh company-fit brief",
    });
  } else {
    briefCard = critCard({
      icon: ICON_BRIEF, nameHTML: '<span class="edit-link" data-act="edit-taste" title="edit taste.md">taste</span>',
      note: (p && p.configured) ? "brain offline — local fallback" : "",
      dot: (p && p.configured) ? "warn" : "",
      desc: "Local fallback criteria used when the brain is unreachable.",
      act: "edit-taste", actIcon: PENCIL, actTitle: "edit taste.md", actLabel: "edit taste",
    });
  }
  // Outreach knowledge is a passive, brain-derived status row: a dot, a count
  // note, and a clickable name that opens the read-only discovered sources. It
  // syncs automatically from the brain, so there is no refresh action.
  const srcs = (state.sources && state.sources.sources) || [];
  const expN = srcs.filter(s => s.need === "experience").length;
  const voiceN = srcs.filter(s => s.need === "voice").length;
  const logN = srcs.filter(s => s.need === "logistics").length;
  let kdot = "off", knote = "syncs from your brain on the next draft";
  if (expN > 0) { kdot = "ok"; knote = `synced · ${expN} experience · ${voiceN} voice · ${logN} logistics`; }
  else if (srcs.length > 0) { kdot = "warn"; knote = "no experience page in your brain yet"; }
  const kname = srcs.length
    ? '<span class="edit-link" data-act="view-sources" title="view discovered experience, voice + logistics">outreach knowledge</span>'
    : 'outreach knowledge';
  const knowledgeCard = critCard({
    icon: ICON_KNOWLEDGE, nameHTML: kname, dot: kdot, note: knote,
    desc: "Your experience, voice + logistics, synced from the brain to ground outreach and application answers.",
  });

  // Locally-authored configs, edited in place (playbook + pre-filter shape the
  // verdict; template + pipeline prompts shape outreach).
  const playbookCard = critCard({
    icon: ICON_PLAYBOOK,
    nameHTML: '<span class="edit-link" data-act="edit-playbook" title="edit the verdict playbook">playbook</span>',
    desc: "How scout judges — the reasoning rules behind every verdict.",
    act: "edit-playbook", actIcon: PENCIL, actTitle: "edit the verdict playbook", actLabel: "edit playbook",
  });
  const templateCard = critCard({
    icon: ICON_EMAIL,
    nameHTML: '<span class="edit-link" data-act="edit-template" title="edit the outreach email template">email template</span>',
    desc: "The outreach email format — verbatim prose with fill-in holes.",
    act: "edit-template", actIcon: PENCIL, actTitle: "edit the outreach email template", actLabel: "edit email template",
  });
  const followupTemplateCard = critCard({
    icon: ICON_EMAIL,
    nameHTML: '<span class="edit-link" data-act="edit-followup-template" title="edit the follow-up template">follow-up template</span>',
    desc: "Copy-paste follow-up — variables {{contact_name}}, {{role}}, {{company}}, {{last_sent}}, {{last_message}}.",
    act: "edit-followup-template", actIcon: PENCIL, actTitle: "edit the follow-up template", actLabel: "edit follow-up template",
  });
  // The outreach pipeline: each stage is an editable LLM prompt (open to edit,
  // toggle on/off, or reset to default). The Writer can't be turned off.
  const PIPELINE_STAGES: [string, string, string][] = [
    ["researcher", "1 · Researcher", "Searches the web for true company facts and the best hooks to open with."],
    ["fill", "2 · Writer", "Writes the email's blanks from the research, your experience, and your voice."],
    ["humanizer", "3 · Humanizer", "Strips AI tells and matches your voice — never changes a fact."],
    ["honesty", "4 · Honesty check", "Vetoes any claim about you beyond your documented experience."],
  ];
  const pipelineCards = PIPELINE_STAGES.map(([key, title, desc]) => critCard({
    icon: ICON_PROMPT,
    nameHTML: `<span class="edit-link" data-act="edit-prompt-${key}" title="edit the ${title.replace(/^\d+ · /, "")} prompt">${title}</span>`,
    desc,
    act: `edit-prompt-${key}`, actIcon: PENCIL, actTitle: `edit the ${title} prompt`, actLabel: `edit ${title} prompt`,
  })).join("");
  const pfOn = !state.stats || state.stats.taste_filter_enabled !== false;
  const prefilterCard = critCard({
    icon: ICON_FILTER,
    nameHTML: '<span class="edit-link" data-act="edit-taste-filter" title="edit the pre-filter rules">pre-filter</span>',
    desc: "Cheap mechanical gate before the LLM verdict — location, headcount, vertical, stage. Toggle it off in the editor to score every company.",
    dot: pfOn ? "ok" : "off", note: pfOn ? "active" : "disabled — scoring everything",
    act: "edit-taste-filter", actIcon: PENCIL, actTitle: "edit the pre-filter rules", actLabel: "edit pre-filter rules",
  });

  // Integrations (dashboard-configurable secrets). The Anthropic key
  // powers verdict, capture, enrichment, outreach, chat & answers; stored in
  // scout's SQLite, it overrides the ANTHROPIC_API_KEY env when set.
  const ak = state.anthropicKey;
  let kdot2 = "off", knote2 = "not set — verdict, capture & outreach disabled";
  if (ak && ak.key_source === "db") { kdot2 = "ok"; knote2 = "set here · active"; }
  else if (ak && ak.key_source === "env") { kdot2 = "ok"; knote2 = "from the environment"; }
  const keyCard = critCard({
    icon: ICON_KEY,
    nameHTML: '<span class="edit-link" data-act="edit-anthropic-key" title="set the Anthropic API key">Anthropic API key</span>',
    dot: kdot2, note: knote2,
    desc: "Powers scoring, capture & outreach. Set here to run scout without the env var.",
    act: "edit-anthropic-key", actIcon: PENCIL, actTitle: "set the Anthropic API key", actLabel: "set Anthropic API key",
  });

  // The two configurable jobs-view vocabularies: the application-stage pipeline
  // labels and the outreach reply-status labels. Edited as one-per-line lists.
  const stagesCard = critCard({
    icon: ICON_PROMPT,
    nameHTML: '<span class="edit-link" data-act="edit-application-stages" title="edit the application stages">application stages</span>',
    desc: "The application pipeline labels you track (applied, screening, interview…). One per line.",
    act: "edit-application-stages", actIcon: PENCIL, actTitle: "edit the application stages", actLabel: "edit application stages",
  });
  const statusesCard = critCard({
    icon: ICON_PROMPT,
    nameHTML: '<span class="edit-link" data-act="edit-outreach-statuses" title="edit the outreach statuses">outreach statuses</span>',
    desc: "The outreach reply labels (initial contact, no response, replied…). One per line.",
    act: "edit-outreach-statuses", actIcon: PENCIL, actTitle: "edit the outreach statuses", actLabel: "edit outreach statuses",
  });

  // Grouped by what the config is *for*, not where it comes from: everything that
  // shapes a verdict (criteria brief, playbook, pre-filter) under Job hunting;
  // the jobs-view vocabularies under Tracking; everything that shapes an email
  // (discovered knowledge, template, pipeline prompts) under Outreach; the shared
  // secret under Integrations.
  el.innerHTML =
    `<div class="settings-section">
       <div class="settings-group-h">Job hunting</div>
       ${briefCard}${playbookCard}${prefilterCard}
     </div>
     <div class="settings-section">
       <div class="settings-group-h">Tracking</div>
       ${stagesCard}${statusesCard}
     </div>
     <div class="settings-section">
       <div class="settings-group-h">Outreach</div>
       ${knowledgeCard}${templateCard}${followupTemplateCard}
     </div>
     <div class="settings-section">
       <div class="settings-group-h">Outreach pipeline</div>
       ${pipelineCards}
     </div>
     <div class="settings-section">
       <div class="settings-group-h">Integrations</div>
       ${keyCard}
     </div>`;

  // Wire every clickable (name links AND action buttons) by its data-act key.
  // Keyed wiring — not getElementById — because a card's name and pencil share an
  // action (edit cards), and binding by id would leave the second element dead
  // (the bug that made the pencils unclickable).
  const ACTIONS: Record<string, () => void> = {
    "view-profile": () => openProfileModal(state.profile),
    "refresh-profile": refreshProfile,
    "edit-taste": () => openEditor("taste"),
    "edit-taste-filter": () => openEditor("taste-filter"),
    "edit-application-stages": () => openEditor("application-stages"),
    "edit-outreach-statuses": () => openEditor("outreach-statuses"),
    "edit-playbook": () => openEditor("playbook"),
    "edit-template": () => openEditor("outreach-template"),
    "edit-followup-template": () => openEditor("followup-template"),
    "view-sources": openSourcesModal,
    "edit-anthropic-key": openKeyModal,
  };
  for (const [key] of PIPELINE_STAGES) ACTIONS[`edit-prompt-${key}`] = () => openEditor(`outreach-prompts/${key}`);
  el.querySelectorAll<HTMLElement>("[data-act]").forEach(n => {
    const a = n.dataset.act;
    if (a && ACTIONS[a]) n.onclick = ACTIONS[a];
  });
}

// loadSources fetches the discovered knowledge into state for the Criteria row.
async function loadSources() {
  try {
    state.sources = await (await fetch("/api/outreach/sources")).json();
  } catch { state.sources = null; }
  renderCriteria();
}

// ---- Anthropic API key (Integrations card + modal) ----
//
// The key is write-only from the browser: we GET/store {has_key, key_source} and
// never the bytes. A key set here is stored in scout's SQLite and overrides the
// ANTHROPIC_API_KEY env; removing it falls back to the env.
async function loadKeyState() {
  try {
    state.anthropicKey = await (await fetch("/api/integrations/anthropic")).json();
  } catch { state.anthropicKey = null; }
  renderCriteria();
}
async function openKeyModal() {
  document.getElementById("key-scrim").classList.add("open");
  document.getElementById("key-input").value = "";
  await loadKeyState();
  renderKeyModal();
  const inp = document.getElementById("key-input");
  if (inp) inp.focus();
}
function renderKeyModal() {
  const ak = state.anthropicKey || {};
  const statusEl = document.getElementById("key-status");
  if (statusEl) {
    statusEl.textContent = ak.key_source === "db"
      ? "A key is set here (stored in scout)."
      : ak.key_source === "env"
        ? "Using the ANTHROPIC_API_KEY environment variable. Saving a key here overrides it."
        : "No key set. Scoring, capture, and outreach are disabled until you add one.";
  }
  const removeBtn = document.getElementById("key-remove");
  if (removeBtn) removeBtn.style.display = ak.key_source === "db" ? "" : "none"; // only removable when set here
  // Option A: a saved key lights verdict/capture/enrich immediately, but the
  // startup-wired engines (outreach, chat, answers) need one restart.
  const hint = document.getElementById("key-restart-hint");
  if (hint) {
    const needsRestart = ak.has_key && state.meta && (state.meta.outreach === false || state.meta.chat === false);
    hint.style.display = needsRestart ? "" : "none";
  }
}
function closeKeyModal() {
  document.getElementById("key-scrim").classList.remove("open");
}
async function saveKey() {
  const key = (document.getElementById("key-input").value || "").trim();
  if (!key) { toast("paste a key first"); return; }
  const btn = document.getElementById("key-save");
  if (btn) { btn.disabled = true; btn.textContent = "Verifying…"; }
  const restore = () => { if (btn) { btn.disabled = false; btn.textContent = "Save key"; } };
  let resp;
  try {
    resp = await fetch("/api/integrations/anthropic", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key }),
    });
  } catch (e) { toast(`save failed: ${e.message}`); restore(); return; }
  if (!resp.ok) { toast((await resp.text().catch(() => "")).trim() || `HTTP ${resp.status}`); restore(); return; }
  state.anthropicKey = await resp.json();
  document.getElementById("key-input").value = "";
  restore();
  toast("Anthropic key saved");
  await loadMeta(); // feature buttons (verdict/capture) may light up
  renderKeyModal();
  renderCriteria();
}
async function removeKey() {
  const btn = document.getElementById("key-remove");
  if (btn) btn.disabled = true;
  let resp;
  try {
    resp = await fetch("/api/integrations/anthropic", { method: "DELETE" });
  } catch (e) { toast(`remove failed: ${e.message}`); if (btn) btn.disabled = false; return; }
  if (btn) btn.disabled = false;
  if (!resp.ok) { toast((await resp.text().catch(() => "")).trim() || `HTTP ${resp.status}`); return; }
  state.anthropicKey = await resp.json();
  toast(state.anthropicKey.has_key ? "removed — using the environment key" : "Anthropic key removed");
  await loadMeta();
  renderKeyModal();
  renderCriteria();
}

async function refreshProfile() {
  // Re-distilling is two sequential Sonnet calls (~40s) — spin the icon and
  // disable it so the long press reads as working, not stuck. Every exit path
  // re-renders the row, which recreates the button and clears the spin.
  const btn = document.getElementById("refresh-profile");
  if (btn) { btn.classList.add("spinning"); btn.disabled = true; }
  let resp;
  try {
    resp = await fetch("/api/profile/refresh", { method: "POST" });
  } catch (e) { toast(`refresh failed: ${e.message}`); loadProfile(); return; }
  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    toast(`refresh failed: ${(t || "").trim() || ("HTTP " + resp.status)}`);
    loadProfile();
    return;
  }
  state.profile = await resp.json();
  renderCriteria();
  toast("company-fit brief refreshed");
  loadStats(); // criteria version shown in the sidebar may have changed
}

function openProfileModal(d) {
  if (!d || typeof d.body !== "string") return;
  document.getElementById("profile-modal-meta").textContent =
    `${d.chars || 0} chars · fetched ${relTime(d.age_seconds)}`;
  document.getElementById("profile-modal-body").textContent = d.body;
  document.getElementById("profile-scrim").classList.add("open");
}
function closeProfileModal() {
  document.getElementById("profile-scrim").classList.remove("open");
}
document.getElementById("profile-modal-close").onclick = closeProfileModal;
document.getElementById("profile-scrim").onclick = e => {
  if (e.target.id === "profile-scrim") closeProfileModal();
};

// ---- docs overlay ("how it works") ----
function openDocs() {
  document.getElementById("docs-scrim").classList.add("open");
  const first = document.querySelector("#docs-nav a");
  setActiveDoc(first ? first.dataset.sec : null);
  const body = document.getElementById("docs-body");
  if (body) body.scrollTop = 0;
}
function closeDocs() { document.getElementById("docs-scrim").classList.remove("open"); }
function docsOpen() { return document.getElementById("docs-scrim").classList.contains("open"); }
function setActiveDoc(sec) {
  document.querySelectorAll("#docs-nav a").forEach(a =>
    a.classList.toggle("active", a.dataset.sec === sec));
}
// jump the (already-open) docs overlay to a section by its nav id
function goToDocSection(sec) {
  const el = document.getElementById("doc-" + sec);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  setActiveDoc(sec);
}
document.getElementById("open-docs").onclick = openDocs;
document.getElementById("docs-close").onclick = closeDocs;
document.getElementById("docs-scrim").onclick = e => {
  if (e.target.id === "docs-scrim") closeDocs();
};

// ---- settings overlay (the moved Criteria panel) ----
function openSettings() {
  document.getElementById("settings-scrim").classList.add("open");
  renderCriteria(); // ensure the rows reflect current state
}
function closeSettings() { document.getElementById("settings-scrim").classList.remove("open"); }
document.getElementById("open-settings").onclick = openSettings;
document.getElementById("settings-close").onclick = closeSettings;
document.getElementById("settings-scrim").onclick = e => {
  if (e.target.id === "settings-scrim") closeSettings();
};

document.querySelectorAll("#docs-nav a").forEach(a => {
  a.onclick = () => {
    const el = document.getElementById("doc-" + a.dataset.sec);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    setActiveDoc(a.dataset.sec);
  };
});
// Scroll-spy: highlight the nav item for whichever section is in view.
(function () {
  const body = document.getElementById("docs-body");
  if (!body || !("IntersectionObserver" in window)) return;
  const obs = new IntersectionObserver(entries => {
    const visible = entries.filter(e => e.isIntersecting)
      .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
    if (visible.length) setActiveDoc(visible[0].target.id.replace(/^doc-/, ""));
  }, { root: body, rootMargin: "0px 0px -65% 0px", threshold: 0 });
  document.querySelectorAll("#docs-body section").forEach(s => obs.observe(s));
})();

// ---- chat ----------------------------------------------------------------
// One slide-in pane shared by the global tracking chat and the per-entity
// research chat. POST /message kicks a turn; the SSE /stream feeds text deltas
// into the live assistant bubble. After the turn ends we reload the canonical
// thread (so tool chips show) and refresh the views the tools may have changed.
state.chat = { scope: null, scopeId: "", threadId: null, streaming: false, es: null };

// chatBlockText / chatBlockTools read the stored content-block array of a
// message; tool_use / tool_result / thinking blocks are plumbing the bubble
// hides, surfacing only the prose and a small "used X" footnote.
function chatBlockText(content) {
  return (content || []).filter(b => b && b.type === "text").map(b => b.text || "").join("");
}
function chatBlockTools(content) {
  return (content || []).filter(b => b && b.type === "tool_use").map(b => b.name);
}

function chatBubbleEl(role, text) {
  const div = document.createElement("div");
  div.className = "chat-msg chat-" + role;
  div.textContent = text || "";
  return div;
}

function chatScrollBottom() {
  const host = document.getElementById("chat-messages");
  host.scrollTop = host.scrollHeight;
}

function chatEmptyHint() {
  const div = document.createElement("div");
  div.className = "chat-empty";
  div.textContent = state.chat.scope === "global"
    ? "Tell me about a job you applied to (paste the link), or ask what's already tracked."
    : "Ask about this " + (state.chat.scope === "company" ? "company" : "role") +
      " — I can research it on the web and update scout.";
  return div;
}

function renderChatMessages(messages) {
  const host = document.getElementById("chat-messages");
  host.innerHTML = "";
  for (const m of (messages || [])) {
    const text = chatBlockText(m.content);
    if (m.role === "user") {
      if (text) host.appendChild(chatBubbleEl("user", text)); // skip pure tool_result turns
    } else if (m.role === "assistant") {
      const tools = chatBlockTools(m.content);
      if (!text && !tools.length) continue;
      const el = chatBubbleEl("assistant", text);
      if (tools.length) {
        const chips = document.createElement("div");
        chips.className = "chat-tools";
        chips.textContent = "· used " + tools.join(", ");
        el.appendChild(chips);
      }
      host.appendChild(el);
    }
  }
  if (!host.children.length) host.appendChild(chatEmptyHint());
  chatScrollBottom();
}

async function openChat(scope, scopeId, title) {
  if (!state.meta || !state.meta.chat) { toast("chat needs ANTHROPIC_API_KEY in the server env"); return; }
  if (state.chat.es) { state.chat.es.close(); state.chat.es = null; }
  state.chat = { scope, scopeId: scopeId || "", threadId: null, streaming: false, es: null };
  document.getElementById("chat-title").textContent =
    scope === "global" ? "Chat" : (scope === "company" ? "Chat · company" : "Chat · role");
  document.getElementById("chat-sub").textContent = scope === "global" ? "" : (title || "");
  const host = document.getElementById("chat-messages");
  host.innerHTML = '<div class="chat-empty">loading…</div>';
  const pane = document.getElementById("chat-pane");
  pane.classList.add("open");
  document.getElementById("chat-scrim").classList.add("open");
  pane.setAttribute("aria-hidden", "false");
  try {
    const qs = "scope=" + encodeURIComponent(scope) + (scopeId ? "&scope_id=" + encodeURIComponent(scopeId) : "");
    const r = await fetch("/api/chat/threads?" + qs);
    if (!r.ok) throw new Error(((await r.text().catch(() => "")).trim()) || ("HTTP " + r.status));
    const data = await r.json();
    state.chat.threadId = data.thread.id;
    renderChatMessages(data.messages || []);
  } catch (e) {
    host.innerHTML = '<div class="chat-empty">Failed to open chat: ' + escapeHTML(e.message) + "</div>";
    return;
  }
  document.getElementById("chat-input").focus();
}

function closeChat() {
  if (state.chat.es) { state.chat.es.close(); state.chat.es = null; }
  const pane = document.getElementById("chat-pane");
  pane.classList.remove("open");
  document.getElementById("chat-scrim").classList.remove("open");
  pane.setAttribute("aria-hidden", "true");
}

function chatSetSending(on) {
  state.chat.streaming = on;
  document.getElementById("chat-send").disabled = on;
  const input = document.getElementById("chat-input");
  input.disabled = on;
  if (!on) input.focus();
}

function chatAutogrow() {
  const t = document.getElementById("chat-input");
  t.style.height = "auto";
  t.style.height = Math.min(t.scrollHeight, 160) + "px";
}

async function sendChat() {
  const input = document.getElementById("chat-input");
  const text = input.value.trim();
  if (!text || state.chat.streaming || !state.chat.threadId) return;
  input.value = "";
  chatAutogrow();
  chatSetSending(true);

  const host = document.getElementById("chat-messages");
  const empty = host.querySelector(".chat-empty");
  if (empty) empty.remove();
  host.appendChild(chatBubbleEl("user", text));
  const asst = chatBubbleEl("assistant", "");
  asst.classList.add("chat-streaming");
  host.appendChild(asst);
  chatScrollBottom();

  let acc = "";
  const fail = (msg) => { asst.classList.remove("chat-streaming"); asst.textContent = "⚠ " + msg; chatSetSending(false); };

  const threadId = state.chat.threadId;
  let resp;
  try {
    resp = await fetch("/api/chat/" + threadId + "/message", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
  } catch (e) { fail(e.message); return; }
  if (!resp.ok) { fail(((await resp.text().catch(() => "")).trim()) || ("HTTP " + resp.status)); return; }

  // Consume the SSE stream — each "delta" is a text fragment (newlines
  // preserved across multi-line data); "end" carries the status.
  const es = new EventSource("/api/chat/" + threadId + "/stream");
  state.chat.es = es;
  es.addEventListener("delta", (e) => {
    acc += e.data;
    asst.textContent = acc;
    chatScrollBottom();
  });
  es.addEventListener("end", async (e) => {
    es.close();
    if (state.chat.es === es) state.chat.es = null;
    asst.classList.remove("chat-streaming");
    chatSetSending(false);
    if (state.chat.threadId === threadId) await reloadChat();
    refreshAfterChat();
    if (typeof e.data === "string" && e.data.indexOf("error") === 0) toast("chat: " + e.data);
  });
  es.onerror = () => {
    es.close();
    if (state.chat.es === es) state.chat.es = null;
    asst.classList.remove("chat-streaming");
    chatSetSending(false);
  };
}

async function reloadChat() {
  const scope = state.chat.scope, scopeId = state.chat.scopeId;
  const qs = "scope=" + encodeURIComponent(scope) + (scopeId ? "&scope_id=" + encodeURIComponent(scopeId) : "");
  try {
    const r = await fetch("/api/chat/threads?" + qs);
    if (!r.ok) return;
    const data = await r.json();
    renderChatMessages(data.messages || []);
  } catch {}
}

// A chat turn may have captured/tracked/updated entities — refresh the views and
// any open pane so the rest of the UI reflects what the tools did.
function refreshAfterChat() {
  loadList(); loadJobs(); loadStats();
  if (state.openId) openDetail(state.openId);
}

document.getElementById("open-chat").onclick = () => openChat("global", "", "");
document.getElementById("chat-close").onclick = closeChat;
document.getElementById("chat-scrim").onclick = closeChat;
document.getElementById("chat-form").addEventListener("submit", (e) => { e.preventDefault(); sendChat(); });
document.getElementById("chat-input").addEventListener("input", chatAutogrow);
document.getElementById("chat-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(); }
});

// Paint the loading frame before the first fetches resolve so neither table
// flashes blank (or its empty state) on a cold load.
renderSkeleton("#t tbody", COMPANY_SKEL_COLS);
renderSkeleton("#jt tbody", JOBS_SKEL_COLS);

// Restore the last-used tab across refreshes (defaults to companies). render:false
// keeps the skeleton until loadList/loadJobs paint real data — no empty-state flash.
const savedView = (() => { try { return localStorage.getItem("scout-view"); } catch { return null; } })();
setView(savedView === "jobs" ? "jobs" : "companies", { render: false });

// macOS + Chromium (Arc/Brave/Edge/Chrome) can discard this tab's rasterized GPU
// tiles when you switch desktop Spaces; on return the main view sometimes paints
// stale/garbled tiles until something forces a fresh raster (a manual refresh
// otherwise fixes it). When the tab becomes visible again — or is restored from
// the bfcache — nudge the compositor to commit a new frame, which re-rasters the
// missing tiles. We toggle a transform on .layout only: it's a SIBLING of the
// fixed panes/scrims/FAB (so they never reparent and jump while scrolled) and we
// never blur focus or move scroll, so an in-progress textarea caret survives.
// Two rAFs ensure the nudged frame actually paints before we clear it.
function nudgeRepaint() {
  const layout = document.querySelector(".layout");
  if (!layout) return;
  layout.style.transform = "translateZ(0)";
  requestAnimationFrame(() => requestAnimationFrame(() => { layout.style.transform = ""; }));
}
document.addEventListener("visibilitychange", () => { if (!document.hidden) nudgeRepaint(); });
window.addEventListener("pageshow", e => { if (e.persisted) nudgeRepaint(); });

loadList();
loadJobs();
loadStats();
loadMeta();
loadRuns();
loadProfile();
loadSources();
loadKeyState();
loadStatusVocab(); // the configurable stage/status vocabularies drive the jobs dropdowns + filter chips
}
