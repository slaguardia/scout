// scout's UI logic — a flat vanilla-JS module body: function declarations
// interleaved with top-level `document.getElementById(...).onclick = ...` wiring
// and a final boot sequence (loadList/loadJobs/loadStats/loadMeta/loadRuns/
// loadProfile). The whole body is wrapped in initScout(): JS hoists the nested
// function declarations, and the interleaved wiring + boot calls run in source
// order AFTER main.ts has injected SCOUT_MARKUP — so every getElementById target
// exists. One document-level keydown listener binds to document. All
// fetch("/api/...") + the SSE EventSource("/api/jobs/{id}/stream") + draft-status
// polling live here.
//
// @ts-nocheck — this is loosely-typed vanilla DOM code; esbuild transpiles it
// without type-checking.
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
  followupTemplate: "",                     // the full follow-up (M53; body + sign-off, loaded at boot)
  openDetail: null,                        // the open company pane's cached detail (for cross-panel sync)
  anthropicKey: null,                      // {has_key, key_source} from /api/integrations/anthropic
  gmail: null,                             // {connected, email, configured, autoflip} from /api/gmail/status (M55)
  notifications: { notifications: [], unread: 0, followups: [] }, // /api/notifications (M55)
  settingsGroup: "outreach",               // active Settings sub-page (nav group)
};

const pillClass = v => "pill pill-" + (v || "none");
// A friendlier enrichment status pill: a clean read is a green "good"; soft misses
// (a thin JS shell, a bot wall) read as amber warnings; the rest as red errors.
// Mirrors the fetch_status taxonomy in scout/enrich; http_<code> and anything
// unmapped fall through to a plain error pill.
const ENRICH_STATUS = {
  ok:          ["good", "pill-good"],
  low_content: ["thin page", "pill-warn"],
  challenge:   ["blocked", "pill-warn"],
  soft_404:    ["page not found", "pill-bad"],
  no_domain:   ["no domain", "pill-none"],
  dns:         ["unreachable", "pill-bad"],
  refused:     ["refused", "pill-bad"],
  timeout:     ["timed out", "pill-bad"],
  error:       ["error", "pill-bad"],
  "":          ["not enriched", "pill-none"],
};
function enrichStatus(s) {
  s = s || "";
  if (s in ENRICH_STATUS) { const [label, cls] = ENRICH_STATUS[s]; return { label, cls }; }
  if (s.startsWith("http_")) return { label: s.replace("http_", "HTTP "), cls: "pill-bad" };
  return { label: s, cls: "pill-bad" };
}
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
  document.getElementById("tab-inbox").classList.toggle("active", v === "inbox");
  document.getElementById("companies-view").style.display = v === "companies" ? "" : "none";
  document.getElementById("jobs-view").style.display = v === "jobs" ? "" : "none";
  // Settings / Inbox / How-it-works are full-page views (like companies/jobs), not modals.
  const toggleView = (id, on) => { const e = document.getElementById(id); if (e) e.style.display = on ? "" : "none"; };
  toggleView("settings-view", v === "settings");
  toggleView("inbox-view", v === "inbox");
  toggleView("docs-view", v === "docs");
  // Each sidebar foot button lights up while its view is active (like an active tab).
  document.getElementById("open-settings").classList.toggle("is-active", v === "settings");
  const dbtn = document.getElementById("open-docs");
  if (dbtn) dbtn.classList.toggle("is-active", v === "docs");
  // Enrich + Verdict are a companies-only pipeline — hide those two action rows
  // off the companies view so they never read as actionable on jobs/inbox/etc.
  // Add stays everywhere (it covers both companies and jobs; CSV import lives in
  // its modal and is companies-only there).
  for (const id of ["btn-enrich", "btn-verdict"]) {
    const el = document.getElementById(id);
    if (el) el.style.display = v === "companies" ? "" : "none";
  }
  // Filter + Columns blocks are table-only — they hide on the non-table views.
  const tableView = v === "companies" || v === "jobs";
  document.getElementById("block-filter-companies").style.display = v === "companies" ? "" : "none";
  document.getElementById("block-filter-jobs").style.display = v === "jobs" ? "" : "none";
  const bcols = document.getElementById("block-columns");
  if (bcols) bcols.style.display = tableView ? "" : "none";
  renderColumnsMenu(); // the Columns dropdown follows the active view
  if (render) {
    if (v === "jobs") renderJobs();
    else if (v === "settings") renderCriteria();
    else if (v === "inbox") { renderNotifications(); loadNotifications(); }
    else if (v === "docs") onDocsShown();
    else renderList();
  }
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
//     "not applied" item (the empty stage). Default is every stage, plus
//     "not applied".
//   • Outreach — an explicit-inclusion reply-status checklist, including a
//     "not reached out" item (the blank status). Default is every status —
//     the same model as Application stage. (The next-up queue toggle lives
//     outside this menu, beside the "follow-ups due" button.)
let jobStageSel = null;          // Set<stage>; null until the first vocab load seeds it
let knownStages = null;          // last vocab seen, so new stages can default visible
let nextUpOnly = false;          // postings queued next up for outreach
let dueOnly = false;             // postings with a follow-up due today/overdue
let outreachSel = null;          // Set<status>; null until seeded — mirrors jobStageSel
let knownStatuses = null;        // last reply-status vocab seen

// reconcileStageSel keeps jobStageSel sensible across vocab changes: seed it to
// every stage on first run, then on a vocab edit drop stages that are gone and
// default genuinely-new stages to visible.
function reconcileStageSel() {
  const all = state.applicationStages;
  if (jobStageSel === null) {
    // "" is the "not applied" bucket — shown by default (was: no-stage always shows).
    jobStageSel = new Set(["", ...all]);
  } else {
    for (const s of [...jobStageSel]) if (s !== "" && !all.includes(s)) jobStageSel.delete(s);
    if (knownStages) for (const s of all) if (!knownStages.has(s)) jobStageSel.add(s);
  }
  knownStages = new Set(all);
}

// reconcileStatusSel mirrors reconcileStageSel for the reply-status checklist:
// seed it to every status (incl. "" = not reached out) on first run, then on a
// vocab edit drop gone statuses and default genuinely-new ones to visible.
function reconcileStatusSel() {
  const all = state.outreachStatuses;
  if (outreachSel === null) {
    outreachSel = new Set(["", ...all]);
  } else {
    for (const s of [...outreachSel]) if (s !== "" && !all.includes(s)) outreachSel.delete(s);
    if (knownStatuses) for (const s of all) if (!knownStatuses.has(s)) outreachSel.add(s);
  }
  knownStatuses = new Set(all);
}

function filteredJobs() {
  reconcileStageSel();
  reconcileStatusSel();
  const q = document.getElementById("jq").value.trim().toLowerCase();
  return state.jobs.filter(j => {
    const stage = j.application_status || "";
    if (!jobStageSel.has(stage)) return false;   // "" = the "not applied" filter item
    if (nextUpOnly && !j.next_up) return false;
    if (dueOnly && !(j.followups_due|0)) return false;
    if (!outreachSel.has(j.outreach_status || "")) return false;  // "" = "not reached out"
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

// fdropHeadToggle renders a checklist section header with an inline all/none
// toggle on the right. allOn = every item in the section is currently checked,
// so the button offers "none"; otherwise it offers "all".
function fdropHeadToggle(label, which, allOn) {
  return `<div class="fdrop-head fdrop-head--toggle"><span>${label}</span>`
    + `<button type="button" class="fdrop-all" data-all="${which}">${allOn ? "none" : "all"}</button></div>`;
}

// renderFilterMenus rebuilds the jobs "Filters" menu — application stage and the
// reply-status checklist, in one panel. Called on vocab load and on structural
// selection changes (e.g. the footer's "show rejected" link flipping a selection
// the user didn't click). (The next-up filter is its own button outside the menu.)
function renderFilterMenus() {
  reconcileStageSel();
  reconcileStatusSel();
  const menu = document.getElementById("fdrop-jfilters-menu");
  if (!menu) return;
  const stageItems = ["", ...state.applicationStages];
  const statusItems = ["", ...state.outreachStatuses];
  menu.innerHTML = fdropHeadToggle("Application stage", "stage", stageItems.every(s => jobStageSel.has(s)))
    + fdropItem("data-stage", "", "not applied", "", jobStageSel.has(""))
    + state.applicationStages.map(s => fdropItem("data-stage", s, s, stageColorClass(s), jobStageSel.has(s))).join("")
    + `<div class="fdrop-sep"></div>`
    + fdropHeadToggle("Reply status", "status", statusItems.every(s => outreachSel.has(s)))
    + [["", "not reached out", ""]].concat(state.outreachStatuses.map(s => [s, s, statusColorClass(s)]))
        .map(([v, label, dot]) => fdropItem("data-status", v, label, dot, outreachSel.has(v))).join("");
  syncFilterCounts();
}

// syncFilterCounts updates the per-item tallies and the Filters button badge
// from the full jobs list — cheap, called on every renderJobs so counts track edits.
function syncFilterCounts() {
  const stageN = {}, statusN = {};
  for (const j of state.jobs) {
    const st = j.application_status || "";
    stageN[st] = (stageN[st] | 0) + 1;   // includes "" (not applied)
    const os = j.outreach_status || "";
    statusN[os] = (statusN[os] | 0) + 1;
  }
  writeItemCounts("#fdrop-jfilters-menu [data-stage]", "data-stage", stageN);
  writeItemCounts("#fdrop-jfilters-menu [data-status]", "data-status", statusN);
  // The badge counts every active narrowing in the panel: stages (when changed
  // from the every-stage default) + reply-status picks.
  const def = ["", ...state.applicationStages];
  const appDefault = jobStageSel && jobStageSel.size === def.length && def.every(s => jobStageSel.has(s));
  const statusDef = ["", ...state.outreachStatuses];
  const statusDefault = outreachSel && outreachSel.size === statusDef.length && statusDef.every(s => outreachSel.has(s));
  const n = (appDefault ? 0 : (jobStageSel ? jobStageSel.size : 0))
    + (statusDefault ? 0 : (outreachSel ? outreachSel.size : 0));
  setFilterBadge("fdrop-jfilters-btn", n, n > 0);
}
function writeItemCounts(sel, attr, counts) {
  document.querySelectorAll(sel).forEach(el => {
    const span = el.querySelector("[data-count]");
    if (span) { const c = counts[el.getAttribute(attr)] | 0; span.textContent = c || ""; }
  });
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
// syncToggleLabels keeps each section's all/none label honest after individual
// item clicks (which update in place, not via a full menu rebuild).
function syncToggleLabels() {
  const m = document.getElementById("fdrop-jfilters-menu");
  if (!m) return;
  const sb = m.querySelector('.fdrop-all[data-all="stage"]');
  const ub = m.querySelector('.fdrop-all[data-all="status"]');
  if (sb) sb.textContent = ["", ...state.applicationStages].every(s => jobStageSel.has(s)) ? "none" : "all";
  if (ub) ub.textContent = ["", ...state.outreachStatuses].every(s => outreachSel.has(s)) ? "none" : "all";
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

// renderQueueNav shows the jobs-view queue toggles in the filter block (sidebar,
// below Filters): a "★ Next up" filter and an "N follow-ups due" filter, side by
// side. One click filters the table to just those postings, with an active state.
// Counts are over ALL postings (not the current filter); each button appears only
// while it has matches, and when its count drops to zero the button hides and its
// filter releases so the table never strands empty.
function renderQueueNav() {
  const nav = document.getElementById("jobs-followup-nav");
  if (!nav) return;
  let nextN = 0, due = 0;
  for (const j of state.jobs) { if (j.next_up) nextN++; due += (j.followups_due | 0); }
  if (!nextN) nextUpOnly = false;
  if (!due) dueOnly = false;
  if (!nextN && !due) { nav.style.display = "none"; nav.innerHTML = ""; return; }
  nav.style.display = "";
  const btns = [];
  if (nextN) {
    btns.push(
      `<button class="queue-nav-btn queue-nav-btn--nextup${nextUpOnly ? " is-active" : ""}" data-q="nextup" title="${nextUpOnly ? "showing only these — click to show all jobs" : "show only jobs queued next up for outreach"}">`
      + `<span class="fn-icon">${ICON_NEXTUP}</span>`
      + `<span class="fn-text"><strong>${nextN}</strong> next up</span>`
      + `</button>`);
  }
  if (due) {
    btns.push(
      `<button class="queue-nav-btn${dueOnly ? " is-active" : ""}" data-q="due" title="${dueOnly ? "showing only these — click to show all jobs" : "show only jobs owing a follow-up"}">`
      + `<span class="fn-icon">${ICON_BELL}</span>`
      + `<span class="fn-text"><strong>${due}</strong> follow-up${due > 1 ? "s" : ""} due</span>`
      + `</button>`);
  }
  nav.innerHTML = btns.join("");
  nav.querySelectorAll(".queue-nav-btn").forEach(btn => {
    btn.onclick = () => {
      if (btn.dataset.q === "nextup") nextUpOnly = !nextUpOnly;
      else dueOnly = !dueOnly;
      renderJobs();
    };
  });
}

function renderJobs() {
  const tbody = document.querySelector("#jt tbody");
  tbody.innerHTML = "";
  renderQueueNav();
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
      <td><div class="jt-namecell"><button class="jt-nextup${j.next_up ? " is-on" : ""}" title="${j.next_up ? "queued next up for outreach — click to remove" : "mark next up for outreach"}" aria-label="next up"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 12.5v-9M4.5 7L8 3.5 11.5 7"/></svg></button><div class="jt-namecol"><span class="row-name">${escapeHTML(j.title || j.company)}</span>${draftBadgeHTML(j.outreach_draft_status)}${j.title ? `<div class="small dim">${escapeHTML(j.company)}</div>` : ""}</div></div></td>
      <td data-col="application"><div class="jt-stage"><select class="jt-stage-sel ${stageColorClass(stage)}" title="application stage">${stOpts}</select></div></td>
      <td class="small" data-col="outreach"><div class="jt-out"><select class="jt-ostatus ${statusColorClass(ostatus)}" title="outreach reply status">${osOpts}</select>${j.followups_due ? `<span class="followup-badge" title="${j.followups_due} follow-up${j.followups_due > 1 ? "s" : ""} due — open to act">${ICON_BELL}${j.followups_due}</span>` : ""}</div></td>
      <td class="small" data-col="last_outreach">${j.last_outreach_at ? escapeHTML(j.last_outreach_at) : '<span class="dim">—</span>'}</td>
      <td class="small td-contacts" data-col="contacts">${contactsHTML(j.contacts)}</td>
      <td data-col="link"><a href="${safeHref(j.url)}" target="_blank" rel="noopener" title="open posting" aria-label="open posting">↗</a></td>
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

// Remove (soft-archive) a contact. Removing one with no logged sends is
// unguarded; once there's send history, this confirm modal names the contact +
// count first, so a stray click can't drop a corresponded contact (and take its
// history off the posting). The logged sends are soft-kept server-side.
let deleteContactTarget = null;

function openDeleteContactModal(cid, name, count) {
  deleteContactTarget = cid;
  const summary = document.getElementById("delcontact-summary");
  if (summary) summary.innerHTML = `Remove <strong>${escapeHTML(name)}</strong>?`;
  const note = document.getElementById("delcontact-note");
  if (note) note.textContent =
    `You've logged ${count} email${count === 1 ? "" : "s"} to this contact — removing them takes that send history off this posting.`;
  const confirmBtn = document.getElementById("delcontact-confirm");
  if (confirmBtn) confirmBtn.disabled = false;
  document.getElementById("delcontact-scrim").classList.add("open");
}

function closeDeleteContactModal() {
  document.getElementById("delcontact-scrim").classList.remove("open");
  deleteContactTarget = null;
}

async function onConfirmDeleteContact() {
  const cid = deleteContactTarget;
  if (!cid) return;
  const btn = document.getElementById("delcontact-confirm");
  if (btn) btn.disabled = true;
  const r = await contactApi("DELETE", `/api/contacts/${cid}`);
  closeDeleteContactModal();
  if (r) { toast("contact removed"); refreshAfterContactChange(); }
}

// Send-follow-up modal: an editable preview of the rendered follow-up, then send
// it as a reply on the contact's Gmail thread. Only opened from the "Send
// follow-up" button, which renders only when Gmail is connected + threaded.
let sendFollowupTarget = null;

function openSendFollowupModal(pid, contact, latest) {
  if (!contact || !latest) return;
  sendFollowupTarget = { pid, contactId: contact.id };
  const to = document.getElementById("sendfollowup-to");
  if (to) to.textContent = `To: ${contact.email || ""} — replies on the existing thread`;
  const ta = document.getElementById("sendfollowup-body");
  if (ta) ta.value = renderFollowupTemplate(contact, latest);
  const confirmBtn = document.getElementById("sendfollowup-confirm");
  if (confirmBtn) confirmBtn.disabled = false;
  document.getElementById("sendfollowup-scrim").classList.add("open");
  if (ta) ta.focus();
}

function closeSendFollowupModal() {
  document.getElementById("sendfollowup-scrim").classList.remove("open");
  sendFollowupTarget = null;
}

async function onConfirmSendFollowup() {
  const t = sendFollowupTarget;
  if (!t) return;
  const ta = document.getElementById("sendfollowup-body");
  const body = ta ? ta.value : "";
  if (!body.trim()) { toast("nothing to send"); return; }
  const btn = document.getElementById("sendfollowup-confirm");
  if (btn) btn.disabled = true;
  const r = await contactApi("POST", `/api/postings/${t.pid}/send-followup`,
    { contact_id: t.contactId, body });
  if (!r) { if (btn) btn.disabled = false; return; }  // contactApi already toasted the error
  closeSendFollowupModal();
  toast("follow-up sent");
  refreshAfterContactChange();
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
    `<span class="pill ${stage ? (stageColorClass(stage) || "pill-stage") : "pill-none"}">${escapeHTML(stage || "—")}</span>`;
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
        Company
        <button type="button" class="h3-action" id="pursuit-company-edit"
                title="move this job to a different company">change</button>
      </h3>
      <div class="company-row">
        <button type="button" class="role-company role-company-link" id="pursuit-company-link"
                title="open the company panel">${escapeHTML(j.company)} ↗</button>
        ${j.verdict ? `<span class="role-verdict"><span class="role-verdict-label">fit</span><span class="${pillClass(j.verdict)}" title="scout's company-fit verdict">${escapeHTML(j.verdict)}</span></span>` : ""}
      </div>
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
          ${(j.application_status || "") && j.application_status_at ? `<span class="pl-at" title="stage last changed">since ${escapeHTML(j.application_status_at.slice(0, 10))}</span>` : ""}
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
    ${j.posted_at ? `<div class="role-posted">posted ${escapeHTML(j.posted_at)}</div>` : ""}`;
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
    application_status_at: fresh.application_status_at,
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
    : `<button class="btn btn-primary" id="draft-start-btn">${current ? "Draft again" : "Draft outreach"}</button>` +
      `<label class="draft-skip-research" title="Skip the web-research stage — draft from what's already on file (the job description and company summary) instead of searching the web. Less crafted, still grounded; the opener stays a plain intro."><input type="checkbox" id="draft-skip-research"> skip research</label>`;

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

// renderFollowupTemplate fills the user's follow-up (body + sign-off, one field)
// with this contact + the last send's variables ({{company}}, {{role}},
// {{contact_name}}, {{contact_role}}, {{last_sent}}, {{last_message}}). Mirrors
// the server's bareVarRE; an unknown {{token}} is left as-is so a typo stays
// visible.
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
// + follow-up controls. The follow-up reminder interval is a global setting,
// edited in Settings → Outreach, not per-thread.
// fmtSyncTime turns a stored UTC "YYYY-MM-DD HH:MM:SS" into a friendly relative
// label ("just now", "3m ago") so the last-synced line reads at a glance.
function fmtSyncTime(s) {
  const t = Date.parse(s.replace(" ", "T") + "Z");
  if (isNaN(t)) return s;
  const secs = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (secs < 60) return "just now";
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

// gmailTrackingBarHTML shows, at the top of the contacts panel, whether sends to
// this company are tracked in Gmail — with a manual "Sync now" + last-synced
// time so you can pull mailbox state on demand and see it's live.
function gmailTrackingBarHTML() {
  const gm = state.gmail || {};
  if (!gm.connected) {
    return `<div class="cc-gmailbar cc-gmailbar-off dim">Gmail not connected — sends are logged by hand and replies don't auto-sync. Connect it in Settings → Gmail.</div>`;
  }
  const last = gm.last_sync_at ? `synced ${escapeHTML(fmtSyncTime(gm.last_sync_at))}` : "not synced yet";
  return `<div class="cc-gmailbar">
    <span class="cc-gmail-on" title="${escapeHTML(gm.email || "")}">Gmail tracking on${gm.email ? ` · ${escapeHTML(gm.email)}` : ""}</span>
    <span class="cc-gmail-sync dim">${last}</span>
    <button class="btn btn-sm cc-sync-now" type="button" title="re-check Gmail (source of truth) — pulls new replies + restores any missing sends">Sync now</button>
  </div>`;
}

function contactsManagerHTML() {
  const j = pursuit.row;
  const bar = gmailTrackingBarHTML();
  const meta = j.last_outreach_at
    ? `<div class="outreach-meta"><span>last outreach ${escapeHTML(j.last_outreach_at)}</span></div>`
    : "";
  if (!pursuit.contactsLoaded) {
    return `<div class="contacts-mgr">${bar}${meta}<div class="loading-row"><span class="spinner"></span><span>loading contacts…</span></div></div>`;
  }
  const cards = pursuit.contacts.map(contactCardHTML).join("");
  const empty = pursuit.contacts.length ? ""
    : `<div class="cc-empty dim">No contacts yet — add the people you're reaching out to at ${escapeHTML(j.company)}.</div>`;
  return `<div class="contacts-mgr">
    ${bar}
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
    ${latest
      ? `<div class="cc-fu-group">${followupGroupHTML(latest, !!(state.gmail && state.gmail.connected) && entries.some(e => e.gmail_thread_id))}</div>`
      : `<div class="cc-status"><span class="dim">no outreach logged yet</span></div>
    <div class="cc-rowacts"><button class="btn cc-log" type="button">+ log outreach</button></div>`}
    ${latest ? "" : `<div class="cc-logform" style="display:none">
      <input class="input cc-l-date" type="date" value="${isoToday()}" title="date sent">
      <textarea class="input cc-l-body" rows="5" placeholder="email body — what you sent (optional)" spellcheck="false"></textarea>
      <div class="cc-form-actions"><button class="btn btn-primary cc-l-save" type="button">Log</button><button class="btn cc-l-cancel" type="button">Cancel</button></div>
    </div>`}
    ${entries.length ? `<details class="cc-history"><summary>${entries.length} email${entries.length === 1 ? "" : "s"} sent</summary><div class="cc-entries">${entries.map(outreachEntryHTML).join("")}</div></details>` : ""}
  </div>`;
}

// followupGroupHTML renders one inline follow-up control row from the contact's
// latest send: a "follow-up" eyebrow, the current status, then a right-aligned
// action cluster led by the primary "Copy follow-up" (compose) button with the
// quiet state actions after it. It walks a two-rung reminder ladder (one due
// date that advances on "done"):
//   pending  — status "due"/"overdue" + a "done" action (mark followed up) + "stop".
//   followed up, escalation pending — status "followed up" + "reopen".
//   escalate — went unanswered past the interval: "no reply — try another
//              contact" + "dismiss".
//   stopped  — due cleared: "stopped" + "resume".
// Only ever called with a latest send (the no-send card shows a log button).
function followupGroupHTML(latest, canSend) {
  const id = latest.id;
  const due = latest.followup_due_at;
  const isDue = due && due <= isoToday();
  const copy = `<button class="btn btn-sm cc-followup" type="button" title="copy a follow-up email from your template">Copy follow-up ⧉</button>`;
  // Only when Gmail is connected and there's a prior threaded send to reply onto.
  const send = canSend
    ? `<button class="btn btn-sm btn-primary cc-fu-send" type="button" title="send this follow-up as a reply on the Gmail thread">Send follow-up →</button>`
    : "";
  let status, actions;
  if (latest.followup_done_at && isDue) {
    status = `<span class="cc-fu-status is-escalate">no reply — try another contact</span>`;
    actions = `<button class="cc-fu-link cc-fu-dismiss" data-eid="${id}" type="button" title="dismiss — stop reminding me about this contact">dismiss</button>`;
  } else if (latest.followup_done_at) {
    status = `<span class="cc-fu-status is-done">followed up</span>`;
    actions = `<button class="cc-fu-link cc-fu-reopen" data-eid="${id}" type="button" title="reopen — re-arm the follow-up reminder">reopen</button>`;
  } else if (!due) {
    status = `<span class="cc-fu-status is-stopped">stopped</span>`;
    actions = `<button class="cc-fu-link cc-fu-resume" data-eid="${id}" type="button">resume</button>`;
  } else {
    status = `<span class="cc-fu-status${isDue ? " is-overdue" : ""}">${isDue ? "overdue" : "follow up on"} ${escapeHTML(due)}</span>`;
    actions = `<button class="cc-fu-link cc-fu-done" data-eid="${id}" type="button" title="mark this follow-up done — arms the next reminder">done</button>`
      + `<button class="cc-fu-link cc-fu-stop" data-eid="${id}" type="button" title="discontinue follow-ups for this contact">stop</button>`;
  }
  return `${status}<span class="cc-fu-actions">${copy}${send}${actions}</span>`;
}

function outreachEntryHTML(e) {
  const fu = e.followup_done_at ? `<span class="fu-done">followed up</span>`
    : e.followup_due_at ? `<span class="fu-mini">→ follow up ${escapeHTML(e.followup_due_at)}</span>` : "";
  // Provenance: a send that carries a Gmail message id went out via — or was
  // synced from — Gmail and is tracked in the mailbox; everything else is a
  // hand-logged send scout can't watch for replies.
  const prov = e.gmail_message_id
    ? `<span class="cc-e-prov prov-gmail" title="sent via Gmail — replies auto-sync">via Gmail ✓</span>`
    : `<span class="cc-e-prov prov-manual" title="logged by hand — not tracked in Gmail">logged manually</span>`;
  // A Gmail-tracked send mirrors the mailbox (the source of truth) — a reconcile
  // would just re-add it, so it isn't deletable here. Only hand-logged sends, which
  // scout owns, keep the × delete.
  const del = e.gmail_message_id ? ""
    : `<button class="cc-e-del" type="button" data-eid="${e.id}" title="delete this logged send (and its follow-up)" aria-label="delete this send">×</button>`;
  const view = e.body ? `<span class="cc-e-view"></span>` : "";  // label ("view"/"hide" email) supplied by CSS per open state
  const actions = (view || del) ? `<span class="cc-e-actions">${view}${del}</span>` : "";
  const meta = `<span class="cc-e-date">${escapeHTML(e.sent_at)}</span>
        ${prov}
        ${e.note ? `<span class="cc-e-note">${escapeHTML(e.note)}</span>` : ""}
        ${fu}`;
  // With a saved body the whole row is the <summary> of a <details>, so clicking
  // it expands the email beneath; without one it's a plain (non-expanding) row.
  return e.body
    ? `<details class="cc-entry-d">
        <summary class="cc-entry">${meta}${actions}</summary>
        <pre class="cc-e-body">${escapeHTML(e.body)}</pre>
      </details>`
    : `<div class="cc-entry">${meta}${actions}</div>`;
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

  // Sync now: a reconcile pass — treat Gmail as the source of truth, re-adding
  // any send/reply that's in the mailbox but missing from the log (self-heals a
  // deleted send) and refreshing the last-synced time.
  const syncBtn = host.querySelector(".cc-sync-now") as HTMLButtonElement | null;
  if (syncBtn) syncBtn.addEventListener("click", async () => {
    // The reconcile re-checks recent mail (a few seconds) — show a spinner so the
    // wait reads as "working", not frozen.
    syncBtn.disabled = true; const t = syncBtn.textContent;
    syncBtn.innerHTML = `<span class="spinner spinner-xs"></span> Syncing…`;
    try {
      const r = await fetch("/api/gmail/sync?reconcile=1", { method: "POST" });
      if (!r.ok) { toast(`sync failed: ${(await r.text().catch(() => "")).trim() || "HTTP " + r.status}`); return; }
      await loadGmailState();        // refresh last_sync_at
      await loadContactsAndLog();    // surface any new/restored replies/sends (re-renders the panel)
      toast("synced with Gmail");
    } catch (e) { toast(`sync failed: ${e.message}`); }
    finally { syncBtn.disabled = false; syncBtn.textContent = t; }
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
      // Guard removal of a contact you've emailed behind a confirm modal; an
      // unwritten-to contact removes straight away.
      const sends = pursuit.outreach.filter(e => String(e.contact_id) === String(cid)).length;
      if (sends > 0) {
        const c = pursuit.contacts.find(x => String(x.id) === String(cid));
        openDeleteContactModal(cid, (c && c.name) || "this contact", sends);
        return;
      }
      const r = await contactApi("DELETE", `/api/contacts/${cid}`);
      if (r) { toast("contact removed"); refreshAfterContactChange(); }
    });

    // Log the first outreach (pre-outreach only; the body records the actual
    // email sent). Once a send exists the card shows the follow-up controls
    // instead, so the log button + form aren't rendered.
    const logForm = card.querySelector(".cc-logform");
    const logBtn = card.querySelector(".cc-log");
    if (logBtn) logBtn.addEventListener("click", () => {
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
      };
      const r = await contactApi("POST", `/api/postings/${pid}/outreach-log`, body);
      if (r) { toast("outreach logged"); refreshAfterContactChange(); }
    });

    // Follow up: fill the template from this contact + the last send and copy it
    // to the clipboard. Pure copy — sending and marking done are the user's.
    const fuBtn = card.querySelector(".cc-followup");
    if (fuBtn) fuBtn.addEventListener("click", () => {
      const c = pursuit.contacts.find(x => String(x.id) === String(cid));
      const latest = pursuit.outreach.filter(e => String(e.contact_id) === String(cid))[0] || null;
      copyToClipboard(renderFollowupTemplate(c, latest), "follow-up copied — paste into your email");
    });

    // Send follow-up via Gmail: open an editable preview, then send it as a reply
    // on the existing thread (only rendered when Gmail is connected + threaded).
    const sendBtn = card.querySelector(".cc-fu-send");
    if (sendBtn) sendBtn.addEventListener("click", () => {
      const c = pursuit.contacts.find(x => String(x.id) === String(cid));
      const latest = pursuit.outreach.filter(e => String(e.contact_id) === String(cid))[0] || null;
      openSendFollowupModal(pid, c, latest);
    });

    // Follow-up state changes (done, reopen, stop, resume, dismiss) all PUT
    // full-state, carrying the entry's body + sent_at + note unchanged. Marking
    // done arms the escalation server-side (the due walks forward); stop and
    // dismiss clear the due (silence it); resume re-arms a follow-up.
    const putFollowup = async (eid, patch, msg) => {
      const e = pursuit.outreach.find(x => String(x.id) === String(eid)) || {};
      const r = await contactApi("PUT", `/api/outreach-log/${eid}`, {
        sent_at: e.sent_at || "", body: e.body || "", note: e.note || "",
        followup_due_at: e.followup_due_at || "", done: !!e.followup_done_at, ...patch,
      });
      if (r) { toast(msg); refreshAfterContactChange(); }
    };
    const fuDone = card.querySelector(".cc-fu-done");
    if (fuDone) fuDone.addEventListener("click", () =>
      putFollowup(fuDone.dataset.eid, { done: true }, "marked followed up"));
    const fuReopen = card.querySelector(".cc-fu-reopen");
    if (fuReopen) fuReopen.addEventListener("click", () =>
      putFollowup(fuReopen.dataset.eid, { done: false }, "follow-up reopened"));
    const fuStop = card.querySelector(".cc-fu-stop");
    if (fuStop) fuStop.addEventListener("click", () =>
      putFollowup(fuStop.dataset.eid, { followup_due_at: "", done: false }, "follow-up stopped"));
    const fuResume = card.querySelector(".cc-fu-resume");
    if (fuResume) fuResume.addEventListener("click", () =>
      putFollowup(fuResume.dataset.eid, { followup_due_at: isoToday(), done: false }, "follow-up resumed"));
    // Dismiss the escalation: keep the followed-up stamp, clear the due date.
    const fuDismiss = card.querySelector(".cc-fu-dismiss");
    if (fuDismiss) fuDismiss.addEventListener("click", () =>
      putFollowup(fuDismiss.dataset.eid, { followup_due_at: "", done: true }, "escalation dismissed"));

    // Delete a logged send — guarded: this is a destructive hard-delete that
    // also drops the send's follow-up, so confirm before firing.
    card.querySelectorAll(".cc-e-del").forEach(b => b.addEventListener("click", async (ev) => {
      ev.preventDefault(); ev.stopPropagation();   // × lives in the row's <summary>; don't toggle it
      if (!confirm("Delete this logged send? Its follow-up is removed too. This can't be undone.")) return;
      const eid = b.dataset.eid;
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
// to the first node so a freshly-started run still reads as in-progress. When the
// draft skipped web research, the Research node is dropped — the pipeline starts
// at Draft (a stray "research" stage marker then maps to that first node).
function outreachProgressHTML(stage, skipResearch) {
  const stages = skipResearch ? OUTREACH_STAGES.filter(s => s.key !== "research") : OUTREACH_STAGES;
  let idx = stages.findIndex(s => s.key === stage);
  if (idx < 0) idx = 0;
  const segs = stages.map((s, i) => {
    const cls = i < idx ? "is-done" : i === idx ? "is-active" : "is-pending";
    const dot = i < idx ? STAGE_CHECK : "";
    return `<div class="dp-seg ${cls}"><span class="dp-dot">${dot}</span><span class="dp-name">${s.label}</span></div>`;
  }).join("");
  return `<div class="draft-progress">
    <div class="dp-track">${segs}</div>
    <div class="dp-status"><span class="spinner"></span><span>${stages[idx].active}…</span></div>
  </div>`;
}

// draftCardHTML renders one draft by status. `readonly` collapses history items
// to a read-only summary (no edit/save controls).
// draftSendControlsHTML renders the send row on an editable draft: one recipient
// picker (the posting's emailable contacts) shared by both "Send via Gmail" (when
// connected) and "Mark sent". Both record the send against the chosen contact and
// arm a follow-up — the only difference is whether Gmail actually delivers it.
// With no emailable contact, Mark sent falls back to a bare status flip.
function draftSendControlsHTML() {
  const connected = !!(state.gmail && state.gmail.connected);
  const cs = (pursuit.contacts || []).filter(c => c.email);
  const picker = cs.length
    ? `<select class="input draft-recipient" title="recipient" aria-label="recipient">${cs.map(c =>
        `<option value="${c.id}">${escapeHTML(c.name || c.email)}${c.email ? ` &lt;${escapeHTML(c.email)}&gt;` : ""}</option>`
      ).join("")}</select>`
    : "";
  const gmailBtn = connected && cs.length
    ? `<button class="btn btn-primary draft-gmail-btn" title="send this email from your Gmail now, log it, and arm a follow-up">${ICON_SEND}Send via Gmail</button>`
    : "";
  const markTitle = cs.length
    ? "I sent this myself — log it to the chosen contact and arm a follow-up"
    : "mark this draft sent (no contact to log against — add one to track follow-ups)";
  const markBtn = `<button class="btn draft-sent-btn" title="${markTitle}">${ICON_SEND}Mark sent${cs.length ? " (log it)" : ""}</button>`;
  const hint = cs.length ? "" : `<div class="draft-note dim">Add a contact with an email to log the send + arm a follow-up.</div>`;
  return `<div class="draft-gmail-row">${picker}${gmailBtn}${markBtn}</div>${hint}`;
}

function draftCardHTML(d, readonly) {
  const head = (cls, label, extra = "") => `
    <div class="draft-head">
      <span class="${cls}">${label}</span>${extra}
    </div>`;

  if (d.status === "researching") {
    return `<div class="draft-card dc-busy">
      ${outreachProgressHTML(d.stage, d.skip_research)}
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
    ${draftSendControlsHTML()}
    <div class="draft-actions">
      <button class="btn draft-regen-btn" title="discard this draft (kept in history) and re-run — picks up backfilled info">${REFRESH}Regenerate</button>
      <label class="draft-skip-research" title="Regenerate without web research — drops the carried research and writes a plain intro."><input type="checkbox" class="draft-regen-skip"> skip research</label>
    </div>` : `<div class="draft-actions">
      <button class="btn draft-regen-btn" title="re-run the draft — picks up backfilled info">${REFRESH}Regenerate</button>
      <label class="draft-skip-research" title="Regenerate without web research — drops the carried research and writes a plain intro."><input type="checkbox" class="draft-regen-skip"> skip research</label>
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
  if (start) start.addEventListener("click", () => startDraft(false, skipResearchChecked()));

  host.querySelectorAll(".draft-retry-btn").forEach(b => b.addEventListener("click", () => startDraft()));

  // Regenerate retires the current reviewable draft (it drops to history) and
  // re-runs the pipeline — picks up backfilled experience/template/company info.
  // Its own "skip research" box drops the carried research for a plain intro.
  host.querySelectorAll(".draft-regen-btn").forEach(b => b.addEventListener("click", (e) => {
    const card = (e.currentTarget as HTMLElement).closest(".draft-card");
    const cb = card ? card.querySelector(".draft-regen-skip") as HTMLInputElement | null : null;
    startDraft(true, !!(cb && cb.checked));
  }));

  host.querySelectorAll(".draft-card[data-did]").forEach(card => {
    const id = card.dataset.did;
    // The body auto-saves Linear-style: commit on blur/Cmd+Enter, Esc reverts.
    const ta = card.querySelector(".draft-textarea");
    if (ta) wireInlineField(ta, (v) => saveDraftEdit(id, v), { multiline: true });
    // Both Mark sent and Send via Gmail read the same recipient picker.
    const recip = () => (card.querySelector(".draft-recipient") as HTMLSelectElement | null);
    const sent = card.querySelector(".draft-sent-btn");
    if (sent) sent.addEventListener("click", () => {
      const sel = recip();
      markDraftSent(id, sel ? sel.value : "");
    });
    const gsend = card.querySelector(".draft-gmail-btn");
    if (gsend) gsend.addEventListener("click", () => {
      const sel = recip();
      sendDraftViaGmail(id, sel ? sel.value : "", gsend as HTMLButtonElement);
    });
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

// skipResearchChecked reads the "skip research" box next to the start button —
// when ticked, the draft skips the web-research stage (?research=0).
function skipResearchChecked(): boolean {
  const cb = document.getElementById("draft-skip-research") as HTMLInputElement | null;
  return !!(cb && cb.checked);
}

// startDraft POSTs the draft pipeline. 202 -> show researching + poll;
// 412 -> the missing-blocks gate with a Sync button; 503 -> quiet dev notice;
// 409 -> reload (the active draft already exists, surface it). With
// regenerate=true it retires the current awaiting_review/needs_work/no_hook
// draft (kept in history) and re-runs — the way to re-draft after backfilling.
// skipResearch=true skips the web-research stage (?research=0).
async function startDraft(regenerate = false, skipResearch = false) {
  const host = document.getElementById("outreach-section");
  const btn = host && (host.querySelector("#draft-start-btn") || host.querySelector(".draft-retry-btn") || host.querySelector(".draft-regen-btn"));
  if (btn) btn.disabled = true;
  let resp;
  try {
    const params = new URLSearchParams();
    if (regenerate) params.set("regenerate", "1");
    if (skipResearch) params.set("research", "0");
    const qs = params.toString() ? `?${params.toString()}` : "";
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
// sendDraftViaGmail sends the reviewed draft from the connected Gmail account to
// the picked contact (server-side: builds the MIME from the template, sends, logs
// the outreach with the Gmail ids, arms the follow-up, marks the draft sent).
async function sendDraftViaGmail(id, contactId, btn?: HTMLButtonElement) {
  if (btn) { btn.disabled = true; btn.dataset.t = btn.textContent || ""; btn.textContent = "Sending…"; }
  const restore = () => { if (btn) { btn.disabled = false; btn.textContent = btn.dataset.t || "Send via Gmail"; } };
  let resp;
  try {
    resp = await fetch(`/api/outreach/drafts/${id}/send-gmail`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contact_id: contactId || "" }),
    });
  } catch (e) { toast(`send failed: ${e.message}`); restore(); return; }
  if (!resp.ok) {
    const raw = (await resp.text().catch(() => "")).trim();
    let msg = raw || "HTTP " + resp.status;
    try { const j = JSON.parse(raw); if (j && j.error) msg = j.error; } catch { /* not json */ }
    toast(`send failed: ${msg}`);
    restore();
    return;
  }
  let body: any = {};
  try { body = await resp.json(); } catch { /* tolerate empty */ }
  toast(body.to ? `sent via Gmail to ${body.to}` : "sent via Gmail");
  await loadDrafts();   // the draft flips to sent; a new "Draft again" appears
  await loadJobs();     // the posting's outreach moved server-side
  await loadContactsAndLog();  // show the new logged send + armed follow-up in the panel
}

// markDraftSent flips a draft to sent. With a contactId it also logs the send
// against that contact server-side (arming a follow-up) — so a send you made by
// hand is tracked like a Gmail send. Without one it's a bare status flip.
async function markDraftSent(id, contactId = "") {
  let resp;
  try {
    resp = await fetch(`/api/outreach/drafts/${id}/sent`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contact_id: contactId || "" }),
    });
  } catch (e) { toast(`failed: ${e.message}`); return; }
  if (!resp.ok) {
    const raw = (await resp.text().catch(() => "")).trim();
    let msg = raw || "HTTP " + resp.status;
    try { const j = JSON.parse(raw); if (j && j.error) msg = j.error; } catch { /* not json */ }
    toast(`failed: ${msg}`);
    return;
  }
  toast(contactId ? "marked sent — follow-up armed" : "marked sent");
  await loadDrafts();   // the draft flips to sent; a new "Draft again" appears
  await loadJobs();     // the posting's outreach moved server-side
  if (contactId) await loadContactsAndLog();  // show the new logged send + armed follow-up
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
// removable (× — a hard delete a later re-detect can bring back). Scout never
// submits — the user copy-pastes into the ATS.

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
// declared limit, a per-question Generate/Regenerate, a copy (shown once there's
// text), and a remove (×). The action button reads "Generate" for an undrafted
// question (the per-question draft is the primary path) and "Regenerate" once
// there's a draft to replace.
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
      ${busy || !drafted ? "" : `<button class="answer-copy-btn dh-copy" title="copy this answer to the clipboard" aria-label="copy answer">${ICON_COPY}</button>`}
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
    // Copy the answer — the live textarea value (unsaved edits included).
    const copy = card.querySelector(".answer-copy-btn");
    if (copy) copy.addEventListener("click", () => {
      if (ta) copyToClipboard(ta.value, "answer copied");
    });
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

// removeAnswer deletes one detected question. It is a hard delete, so a later
// re-detect re-surfaces the question if it is still on the form — no confirm
// needed.
async function removeAnswer(id) {
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

  const es = enrichStatus(d.fetch_status);
  const enrichBlock = d.has_enrichment ? `
    <dl class="kv">
      <dt>url</dt><dd>${d.website_url ? `<a href="${safeHref(d.website_url)}" target="_blank" rel="noopener">${escapeHTML(d.website_url)} ↗</a>` : '<span class="muted">—</span>'}</dd>
      <dt>status</dt><dd class="small"><span class="pill ${es.cls}">${escapeHTML(es.label)}</span>${d.fetch_error ? ` <span class="muted">(${escapeHTML(d.fetch_error)})</span>` : ""}</dd>
      <dt>fetched</dt><dd class="small muted">${escapeHTML(d.fetched_at || "")}</dd>
    </dl>
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

// The run drawer (bottom-right) auto-dismisses a finished run after this TTL so
// completed panels don't linger. Only the stream's "end" arms it — a running
// job never auto-closes — and hovering the drawer pauses the countdown so the
// log stays readable (re-armed on mouse-leave, wired once below).
let drawerCloseTimer;
const DRAWER_TTL_MS = 6000;
function clearDrawerTTL() { clearTimeout(drawerCloseTimer); drawerCloseTimer = undefined; }
function closeDrawer() { clearDrawerTTL(); document.getElementById("drawer").classList.remove("open"); }
function armDrawerTTL() { clearDrawerTTL(); drawerCloseTimer = setTimeout(closeDrawer, DRAWER_TTL_MS); }

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
  document.getElementById("add-csv").disabled = !ctl;   // CSV import lives in the Add modal now
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
let addMode = "single";              // company sub-mode: "single" form | "csv" bulk import

function setAddKind(kind) {
  addKind = kind;
  addMode = "single";                // reset the sub-mode whenever the kind flips
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
  applyAddLayout();
  updateAddNote();
}
function setAddMode(mode) { addMode = mode; applyAddLayout(); }
// Show the right panels for the current kind + sub-mode. The "csv" sub-mode is a
// companies-only bulk import, so it hides every single-add control (URL, the
// company form, the agent-pass tick, the note, the submit button) and shows just
// the file drop — the only things that don't apply to importing a file.
function applyAddLayout() {
  const company = addKind === "company";
  const csv = company && addMode === "csv";
  document.querySelectorAll("#add-kind .v-chip").forEach(b => b.classList.toggle("is-on", b.dataset.kind === addKind));
  document.getElementById("add-cmode").style.display = company ? "" : "none";   // subtabs: company only
  document.querySelectorAll("#add-cmode .subtab").forEach(b => b.classList.toggle("is-on", b.dataset.cmode === addMode));
  document.getElementById("add-company-fields").style.display = (company && !csv) ? "" : "none";
  document.getElementById("add-job-fields").style.display = (addKind === "job") ? "" : "none";
  document.getElementById("add-csv-panel").style.display = csv ? "" : "none";
  for (const id of ["add-url-field", "add-enrich-row", "add-note-row", "add-learn", "add-save"])
    document.getElementById(id).style.display = csv ? "none" : "";
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
  // CSV mode has no single-add form to submit — the file drop drives the import.
  if (addKind === "company" && addMode === "csv") return;
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
    // A readable page seeds an 'ok' enrichment summary the scorer can read, so
    // score it now — the same targeted re-score the pane's "↻ re-score" runs
    // (bypasses the pre-filter). Skipped when the page couldn't be read (only an
    // 'ok' enrichment is scorable) or when verdict control isn't available.
    const canScore = (!state.meta || state.meta.control !== false) && state.meta && state.meta.verdict;
    if (res.fetch_status === "ok" && canScore) startRun("verdict", { company_ids: [res.company_id] });
  } else {
    toast("company added");
  }
}

function streamJob(stage, jobId, opts) {
  activeJob = jobId;
  clearDrawerTTL(); // a fresh running job cancels any pending auto-close
  const drawer = document.getElementById("drawer");
  const log = document.getElementById("drawer-log");
  document.getElementById("drawer-title").textContent = stage;
  document.getElementById("drawer-spinner").style.display = "";
  document.getElementById("drawer-cancel").style.display = "";
  document.getElementById("drawer-close").style.display = "none";
  log.innerHTML = "";
  const summaryEl = document.getElementById("drawer-summary");
  summaryEl.hidden = true; summaryEl.innerHTML = "";
  drawer.classList.add("open");
  loadRuns(); // reflect the new running row

  // Tally of verdict lines seen this run, rendered as a footer when it ends.
  const tally = { yes: 0, maybe: 0, no: 0 };
  // A verdict line: "Company → yes — reason" (the run's substantive output).
  const VERDICT_RE = /^(.+?)\s*→\s*(yes|maybe|no)\s*—\s*([\s\S]*)$/i;
  const es = new EventSource(`/api/jobs/${jobId}/stream`);
  const appendLine = (text, isErr) => {
    const div = document.createElement("div");
    let m;
    if (!isErr && (m = text.match(VERDICT_RE))) {
      // Render the result as a row: a verdict pill (reused from the table) +
      // company name + reason, so the log reads like results, not raw text.
      const verdict = m[2].toLowerCase();
      tally[verdict]++;
      div.className = "ln ln-verdict";
      const pill = document.createElement("span");
      pill.className = "pill pill-" + verdict;
      pill.textContent = verdict;
      const body = document.createElement("span");
      body.className = "lv-text";
      const name = document.createElement("span");
      name.className = "lv-name";
      name.textContent = m[1].trim();
      body.appendChild(name);
      const reason = (m[3] || "").trim();
      if (reason) {
        const rs = document.createElement("span");
        rs.className = "lv-reason";
        rs.textContent = reason;
        body.append(" ", rs);
      }
      div.append(pill, body);
    } else if (!isErr && /^(scoring|enriching|ingesting)\b/i.test(text)) {
      div.className = "ln ln-head"; // the run's opening header line
      div.textContent = text;
    } else if (!isErr && /^·\s/.test(text)) {
      div.className = "ln ln-pick"; // a worker picking up a company (transient)
      div.textContent = text;
    } else {
      // "warn:"-prefixed lines (e.g. ingest collisions) get the amber gutter and
      // a ⚠ glyph in place of the prefix; error lines win over warn.
      const isWarn = !isErr && /^\s*warn:/i.test(text);
      div.className = "ln" + (isErr ? " ln-err" : isWarn ? " ln-warn" : "");
      div.textContent = isWarn ? text.replace(/^\s*warn:\s*/i, "⚠ ") : text;
    }
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
    // A scoring run ends with a yes/maybe/no tally footer (reusing the pills).
    if (tally.yes + tally.maybe + tally.no > 0) {
      for (const k of ["yes", "maybe", "no"]) {
        if (!tally[k]) continue;
        const chip = document.createElement("span");
        chip.className = "pill pill-" + k;
        chip.textContent = `${tally[k]} ${k}`;
        summaryEl.appendChild(chip);
      }
      summaryEl.hidden = false;
    }
    armDrawerTTL(); // run done: start the auto-close countdown
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
  if (kind === "outreach-template") return "email body";
  if (kind === "outreach-subject") return "email subject";
  if (kind === "followup-template") return "follow-up body";
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
  // The enable toggle shows for skippable pipeline stages (every stage but the
  // Writer/fill). The reset button shows for pipeline stages. (The pre-filter
  // has its own form modal — openPrefilter — not this generic text editor.)
  const isPipeline = !!kind && kind.startsWith("outreach-prompts/");
  const pipelineStage = isPipeline ? kind.slice("outreach-prompts/".length) : "";
  const showToggle = isPipeline && pipelineStage !== "fill";
  document.getElementById("editor-toggle-row").style.display = showToggle ? "" : "none";
  document.getElementById("editor-reset").style.display = isPipeline ? "" : "none";
  if (showToggle) document.getElementById("editor-toggle-label").textContent =
    "Run this stage (off → it is skipped in the pipeline)";
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

// ---- control surface: pre-filter form ----
//
// The mechanical pre-filter (location / headcount / vertical / stage) is edited
// as a structured form, not raw TOML — clearer, and it can spell out why the
// gate exists. We hold the rules in pfRules, bind the scalar fields (remote-ok,
// headcount) directly, and render the list fields as removable chips. Save sends
// PUT {rules, enabled}; the server re-encodes to the canonical TOML.
let pfRules: any = null;
// Vocabularies for the multi-selects, loaded from /api/filter-options: the
// vertical tags present in the data (for autocomplete) and the canonical funding
// stages (for the toggle chips).
let pfVertOptions: { value: string; count: number }[] = [];
let pfStageOptions: { value: string; count: number }[] = [];
// The free-text/tag list fields, each a chip input keyed by "section.key".
// Funding stage is NOT here — it's a fixed multi-select of canonical stages.
const PF_LIST_FIELDS = ["location.allowed", "verticals.excluded", "verticals.allowed"];
// Vertical fields get datalist autocomplete from the real tag vocabulary.
const PF_DATALIST_FIELDS = { "verticals.excluded": "pf-vertical-tags", "verticals.allowed": "pf-vertical-tags" };

function pfList(field) {
  const [a, b] = field.split(".");
  return (pfRules[a] && pfRules[a][b]) || [];
}
function pfSetList(field, vals) {
  const [a, b] = field.split(".");
  (pfRules[a] = pfRules[a] || {})[b] = vals;
}
function pfHas(list, v) { // case-insensitive membership
  const lv = v.toLowerCase();
  return list.some(x => String(x).toLowerCase() === lv);
}
function renderPfChips() {
  PF_LIST_FIELDS.forEach(field => {
    const host = document.querySelector(`.pf-chips[data-field="${field}"]`);
    if (!host) return;
    const listAttr = PF_DATALIST_FIELDS[field] ? ` list="${PF_DATALIST_FIELDS[field]}"` : "";
    const ph = PF_DATALIST_FIELDS[field] ? "type to search…" : "type &amp; Enter…";
    host.innerHTML =
      pfList(field).map((v, i) =>
        `<span class="pf-chip">${escapeHTML(v)}<button class="pf-chip-x" data-field="${field}" data-i="${i}" title="remove" aria-label="remove ${escapeHTML(v)}">×</button></span>`).join("") +
      `<input class="pf-chip-input" data-field="${field}"${listAttr} type="text" placeholder="${ph}" spellcheck="false" autocomplete="off" />`;
  });
}
function pfAddChip(field, raw) {
  const v = (raw || "").trim(); // preserve casing (matching is case-insensitive)
  if (v) {
    const list = pfList(field);
    if (!pfHas(list, v)) pfSetList(field, [...list, v]);
  }
  renderPfChips();
  (document.querySelector(`.pf-chip-input[data-field="${field}"]`) as HTMLInputElement)?.focus();
}
function pfRemoveChip(field, i) {
  const vals = pfList(field).slice();
  vals.splice(i, 1);
  pfSetList(field, vals);
  renderPfChips();
}
// Funding-stage multi-select: a row of toggle chips, lit when the canonical
// stage is in funding_stage.allowed. No selection → every stage passes.
function renderPfStages() {
  const host = document.getElementById("pf-stages");
  if (!host) return;
  const allowed = pfList("funding_stage.allowed");
  host.innerHTML = pfStageOptions.map(o => {
    const on = pfHas(allowed, o.value);
    const c = o.count ? ` <span class="pf-stage-n">${o.count}</span>` : "";
    return `<button class="pf-stage${on ? " is-on" : ""}" data-stage="${escapeHTML(o.value)}">${escapeHTML(o.value)}${c}</button>`;
  }).join("");
}
function pfToggleStage(value) {
  const list = pfList("funding_stage.allowed");
  pfSetList("funding_stage.allowed", pfHas(list, value) ? list.filter(x => String(x).toLowerCase() !== value.toLowerCase()) : [...list, value]);
  renderPfStages();
}
function populateVertDatalist() {
  const dl = document.getElementById("pf-vertical-tags");
  if (dl) dl.innerHTML = pfVertOptions.map(o => `<option value="${escapeHTML(o.value)}" label="${o.count}"></option>`).join("");
}
function pfBlank() {
  return { location: { allowed: [], remote_ok: true }, headcount: { min: 0, max: 0 }, verticals: { allowed: [], excluded: [] }, funding_stage: { allowed: [] } };
}
// The pre-filter structured form, rendered inline on the Job-hunting settings page
// (no modal). The pf* helpers fill it (chips/stages/datalist) and read it on Save.
function prefilterFormHTML() {
  return `<div class="set-field pf-inline">
    <div class="set-field-label">Pre-filter</div>
    <div class="set-field-desc">A cheap, no-LLM gate that runs <strong>before</strong> a bulk verdict run, so the paid model only scores companies worth a closer look. It only narrows <strong>bulk</strong> runs — re-scoring one company by hand always runs the LLM — and never deletes, hides, or stops fetching anything.</div>
    <label class="pf-master">
      <input type="checkbox" id="pf-enabled" />
      <span class="pf-master-text">
        <strong>Run the pre-filter on bulk runs</strong>
        <span class="pf-master-sub">Off → a bulk run scores every company (the rules below are kept either way).</span>
      </span>
    </label>
    <section class="pf-sec">
      <h3 class="pf-h">Location</h3>
      <p class="pf-help">A company passes if its location contains any of these. Add cities, regions, or "remote".</p>
      <div class="pf-chips" data-field="location.allowed"></div>
      <label class="pf-check"><input type="checkbox" id="pf-remote-ok" /><span>Also pass companies with no location listed, or marked remote.</span></label>
    </section>
    <section class="pf-sec">
      <h3 class="pf-h">Headcount</h3>
      <p class="pf-help">Pass only companies within this size range. Set a bound to <strong>0</strong> for no limit; companies with no headcount data always pass.</p>
      <div class="pf-range"><label>min <input type="number" id="pf-hc-min" class="input" min="0" step="1" /></label><span class="pf-range-dash">–</span><label>max <input type="number" id="pf-hc-max" class="input" min="0" step="1" /></label></div>
    </section>
    <section class="pf-sec">
      <h3 class="pf-h">Industry / vertical</h3>
      <p class="pf-help">Matches whole category tags from your data. Start typing to pick a tag.</p>
      <div class="pf-sublabel">Exclude these tags</div>
      <div class="pf-chips" data-field="verticals.excluded"></div>
      <div class="pf-sublabel">Allow only these <span class="pf-sublabel-note">(leave empty to allow all)</span></div>
      <div class="pf-chips" data-field="verticals.allowed"></div>
      <datalist id="pf-vertical-tags"></datalist>
    </section>
    <section class="pf-sec">
      <h3 class="pf-h">Funding stage</h3>
      <p class="pf-help">If you pick any, only companies at those stages pass. Leave all unselected to allow every stage.</p>
      <div class="pf-stages" id="pf-stages"></div>
    </section>
    <div class="set-field-foot">
      <button class="btn btn-primary" id="pf-save">Save pre-filter</button>
      <button class="btn" id="pf-reset" title="discard your edits and restore the built-in default rules">Reset to default</button>
    </div>
  </div>`;
}

async function openPrefilter(useDefault = false) {
  // Loads the rules into the inline pre-filter form (on the Job-hunting settings
  // page). useDefault loads the built-in defaults (the Reset button). No-op when
  // the form isn't on screen.
  if (!document.getElementById("pf-enabled")) return;
  try {
    // Rules + the option vocabularies (the latter cached after first load).
    const [d, opts] = await Promise.all([
      (await fetch("/api/taste-filter" + (useDefault ? "?default=1" : ""))).json(),
      (pfVertOptions.length || pfStageOptions.length) ? Promise.resolve(null) : fetch("/api/filter-options").then(r => r.json()).catch(() => null),
    ]);
    if (opts) { pfVertOptions = opts.verticals || []; pfStageOptions = opts.stages || []; }
    pfRules = Object.assign(pfBlank(), d.rules || {});
    pfRules.location = Object.assign({ allowed: [], remote_ok: true }, pfRules.location);
    pfRules.headcount = Object.assign({ min: 0, max: 0 }, pfRules.headcount);
    pfRules.verticals = Object.assign({ allowed: [], excluded: [] }, pfRules.verticals);
    pfRules.funding_stage = Object.assign({ allowed: [] }, pfRules.funding_stage);
    // Reset reloads only the rules; it must not silently flip the master switch.
    if (!useDefault) (document.getElementById("pf-enabled") as HTMLInputElement).checked = d.enabled !== false;
    (document.getElementById("pf-remote-ok") as HTMLInputElement).checked = !!pfRules.location.remote_ok;
    (document.getElementById("pf-hc-min") as HTMLInputElement).value = String(pfRules.headcount.min || 0);
    (document.getElementById("pf-hc-max") as HTMLInputElement).value = String(pfRules.headcount.max || 0);
    populateVertDatalist();
    renderPfChips();
    renderPfStages();
  } catch (e) { toast(`failed to load pre-filter: ${e.message}`); }
}
async function savePrefilter() {
  if (!pfRules) return;
  pfRules.location.remote_ok = (document.getElementById("pf-remote-ok") as HTMLInputElement).checked;
  pfRules.headcount.min = Math.max(0, parseInt((document.getElementById("pf-hc-min") as HTMLInputElement).value, 10) || 0);
  pfRules.headcount.max = Math.max(0, parseInt((document.getElementById("pf-hc-max") as HTMLInputElement).value, 10) || 0);
  // Fold any text left typed-but-not-entered in a chip input into its list.
  document.querySelectorAll(".pf-chip-input").forEach((inp: any) => {
    const v = inp.value.trim();
    if (v && !pfHas(pfList(inp.dataset.field), v)) pfSetList(inp.dataset.field, [...pfList(inp.dataset.field), v]);
  });
  const enabled = (document.getElementById("pf-enabled") as HTMLInputElement).checked;
  let resp;
  try {
    resp = await fetch("/api/taste-filter", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rules: pfRules, enabled }),
    });
  } catch (e) { toast(`save failed: ${e.message}`); return; }
  if (!resp.ok) { toast(`save failed: ${(await resp.text().catch(() => "")).trim() || "HTTP " + resp.status}`); return; }
  toast("pre-filter saved");
  loadStats(); // refresh the active/disabled status note
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
    if (isPipelineStage) body.enabled = (document.getElementById("editor-enabled") as HTMLInputElement).checked;
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
document.getElementById("tab-inbox").onclick = () => setView("inbox");
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
// Jobs Filters menu: stage checklist + reply status.
document.getElementById("fdrop-jfilters-menu").addEventListener("click", e => {
  const all = e.target.closest(".fdrop-all");
  if (all) {
    if (all.getAttribute("data-all") === "stage") {
      const items = ["", ...state.applicationStages];
      jobStageSel = items.every(s => jobStageSel.has(s)) ? new Set() : new Set(items);
    } else {
      const items = ["", ...state.outreachStatuses];
      outreachSel = (outreachSel && items.every(s => outreachSel.has(s))) ? new Set() : new Set(items);
    }
    renderFilterMenus();   // relabel the toggle + re-check every row
    renderJobs();
    return;
  }
  const it = e.target.closest(".fdrop-item");
  if (!it) return;
  if (it.hasAttribute("data-stage")) {
    const s = it.getAttribute("data-stage");
    if (jobStageSel.has(s)) jobStageSel.delete(s); else jobStageSel.add(s);
    setItemChecked(it, jobStageSel.has(s));
  } else if (it.hasAttribute("data-status")) {
    const v = it.getAttribute("data-status");
    if (outreachSel.has(v)) outreachSel.delete(v); else outreachSel.add(v);
    setItemChecked(it, outreachSel.has(v));
  } else return;
  syncToggleLabels();   // keep the all/none labels honest after an item toggle
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
  if (document.getElementById("profile-scrim").classList.contains("open")) { closeProfileModal(); return; }
  if (document.getElementById("add-scrim").classList.contains("open")) { closeAdd(); return; }
  if (document.getElementById("run-scrim").classList.contains("open")) { closeRunConfirm(); return; }
  // The relink modal sits on top of the pursuit panel — peel it before the panes.
  if (document.getElementById("relink-scrim").classList.contains("open")) { closeRelinkModal(); return; }
  // The delete-company confirm sits on top of the company pane — peel it first.
  if (document.getElementById("delcompany-scrim").classList.contains("open")) { closeDeleteCompanyModal(); return; }
  // The delete-job confirm sits on top of the pursuit panel — peel it first too.
  if (document.getElementById("deljob-scrim").classList.contains("open")) { closeDeleteJobModal(); return; }
  // The remove-contact confirm also sits on top of the pursuit panel.
  if (document.getElementById("delcontact-scrim").classList.contains("open")) { closeDeleteContactModal(); return; }
  // The send-follow-up preview likewise sits on top of the pursuit panel.
  if (document.getElementById("sendfollowup-scrim").classList.contains("open")) { closeSendFollowupModal(); return; }
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
  if (document.getElementById("gmail-config-scrim").classList.contains("open")) { closeGmailConfig(); return; }
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
document.getElementById("btn-add").onclick = openAdd;
// CSV bulk-import lives inside the Add modal now — its button opens the file picker.
document.getElementById("add-csv").onclick = () => document.getElementById("csv-file").click();
// Per-modal help: a "Learn more" link in each action modal jumps into the docs
// overlay at the relevant section (replaces the old sidebar "?" popovers).
document.getElementById("add-learn").onclick = () => { closeAdd(); setView("docs"); goToDocSection("ingest"); };
document.getElementById("run-learn").onclick = () => {
  const s = pendingStage; closeRunConfirm(); setView("docs"); goToDocSection(s || "enrich");
};

document.getElementById("add-cancel").onclick = closeAdd;
document.getElementById("add-save").onclick = submitAdd;
document.getElementById("add-scrim").onclick = e => { if (e.target.id === "add-scrim") closeAdd(); };
document.querySelectorAll("#add-kind .v-chip").forEach(b => { b.onclick = () => setAddKind(b.dataset.kind); });
document.querySelectorAll("#add-cmode .subtab").forEach(b => { b.onclick = () => setAddMode(b.dataset.cmode); });
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
  if (f) { closeAdd(); uploadCSV(f); }   // close the Add modal once a CSV is chosen
  e.target.value = ""; // allow re-selecting the same file
};
document.getElementById("drawer-cancel").onclick = cancelActiveJob;
document.getElementById("drawer-close").onclick = closeDrawer;
// Pause the auto-close countdown while the cursor is on the drawer (reading the
// log), and resume it on leave — but only for a finished run, never a live one.
(() => {
  const d = document.getElementById("drawer");
  d.addEventListener("mouseenter", clearDrawerTTL);
  d.addEventListener("mouseleave", () => { if (!activeJob && d.classList.contains("open")) armDrawerTTL(); });
})();

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

// pre-filter form modal: buttons + delegated chip interactions (chips re-render,
// chips re-render, so add/remove/toggle are delegated on document — the pre-filter
// form is now rendered inline on the Job-hunting settings page (Save/Reset are
// wired per render in renderJobHuntingSettings).
document.addEventListener("click", (e: any) => {
  const stage = e.target.closest(".pf-stage");
  if (stage) { pfToggleStage(stage.dataset.stage); return; }
  const x = e.target.closest(".pf-chip-x");
  if (x) { pfRemoveChip(x.dataset.field, parseInt(x.dataset.i, 10)); return; }
  const chips = e.target.closest(".pf-chips"); // click bare chip area → focus its input
  if (chips && e.target === chips) (chips.querySelector(".pf-chip-input") as HTMLInputElement)?.focus();
});
document.addEventListener("keydown", (e: any) => {
  const inp = e.target.closest(".pf-chip-input");
  if (!inp) return;
  if (e.key === "Enter" || e.key === ",") { e.preventDefault(); pfAddChip(inp.dataset.field, inp.value); }
  else if (e.key === "Backspace" && !inp.value) {
    const list = pfList(inp.dataset.field);
    if (list.length) pfRemoveChip(inp.dataset.field, list.length - 1);
  }
});

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

// remove-contact confirm modal (only shown when the contact has logged sends)
document.getElementById("delcontact-cancel").onclick = closeDeleteContactModal;
document.getElementById("delcontact-confirm").onclick = onConfirmDeleteContact;
document.getElementById("delcontact-scrim").onclick = e => {
  if (e.target.id === "delcontact-scrim") closeDeleteContactModal();
};

// send-follow-up preview modal (reply on the contact's Gmail thread)
document.getElementById("sendfollowup-cancel").onclick = closeSendFollowupModal;
document.getElementById("sendfollowup-confirm").onclick = onConfirmSendFollowup;
document.getElementById("sendfollowup-scrim").onclick = e => {
  if (e.target.id === "sendfollowup-scrim") closeSendFollowupModal();
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
const ICON_FILTER = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M2.4 3.4h11.2L9.4 8.4v4.2l-2.8 1.4V8.4z"/></svg>';
const ICON_BELL = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4.2 7a3.8 3.8 0 0 1 7.6 0c0 3 1.2 4 1.2 4H3s1.2-1 1.2-4z"/><path d="M6.7 13a1.5 1.5 0 0 0 2.6 0"/></svg>';
const ICON_NEXTUP = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 12.5v-9M4.5 7L8 3.5 11.5 7"/></svg>';

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

// ---- Settings: sub-page nav + inline editable fields (no modals) ----

const SETTINGS_GROUPS: [string, string][] = [
  ["outreach", "Outreach"],
  ["pipeline", "Outreach pipeline"],
  ["tracking", "Tracking"],
  ["job-hunting", "Job hunting"],
  ["integrations", "Integrations"],
];

const PIPELINE_STAGES: [string, string, string][] = [
  ["researcher", "1 · Researcher", "Searches the web for true company facts and the best hooks to open with."],
  ["fill", "2 · Writer", "Writes the email's blanks from the research, your experience, and your voice."],
  ["humanizer", "3 · Humanizer", "Strips AI tells and matches your voice — never changes a fact."],
  ["honesty", "4 · Honesty check", "Vetoes any claim about you beyond your documented experience."],
];

// renderCriteria paints the Settings page: a left nav of groups + the active
// group's editable fields inline (each saves to its own API on blur; no modals).
function renderCriteria() {
  const el = document.getElementById("criteria-stats");
  if (!el) return;
  // The state loaders (key/gmail/profile/status) call this to refresh, but there's
  // nothing to paint — and no point firing the inline fields' fetches — while the
  // Settings view is hidden. setView shows it before calling, so this is a no-op then.
  const sv = document.getElementById("settings-view");
  if (sv && sv.style.display === "none") return;
  const grp = state.settingsGroup || "outreach";
  el.innerHTML = `<div class="settings-shell">
    <nav class="settings-nav">
      ${SETTINGS_GROUPS.map(([id, label]) =>
        `<a data-grp="${id}" class="${id === grp ? "active" : ""}">${escapeHTML(label)}</a>`).join("")}
    </nav>
    <div class="settings-content" id="settings-content"></div>
  </div>`;
  el.querySelectorAll<HTMLElement>("[data-grp]").forEach(a => {
    a.onclick = () => { if (state.settingsGroup !== a.dataset.grp) { state.settingsGroup = a.dataset.grp; renderCriteria(); } };
  });
  const c = document.getElementById("settings-content");
  if (!c) return;
  if (grp === "pipeline") renderPipelineSettings(c);
  else if (grp === "tracking") renderTrackingSettings(c);
  else if (grp === "job-hunting") renderJobHuntingSettings(c);
  else if (grp === "integrations") renderIntegrationsSettings(c);
  else renderOutreachSettings(c);
}

// A labeled text artifact that loads GET /api/<kind> and saves PUT on blur (when
// changed). list=true treats it as a one-label-per-line status vocabulary.
function settingsTextFieldHTML(kind, label, desc, rows, list) {
  return `<div class="set-field" data-kind="${kind}" data-list="${list ? 1 : 0}">
    <div class="set-field-label">${escapeHTML(label)}</div>
    <div class="set-field-desc">${escapeHTML(desc)}</div>
    <textarea class="set-textarea" rows="${rows}" spellcheck="false" data-loaded="0">loading…</textarea>
    <div class="set-field-foot"><span class="set-saved">saved ✓</span></div>
  </div>`;
}
function flashSaved(field) {
  const s = field.querySelector(".set-saved");
  if (s) { s.classList.add("show"); setTimeout(() => s.classList.remove("show"), 1500); }
}
async function loadTextField(field) {
  const kind = field.dataset.kind;
  const list = field.dataset.list === "1";
  const ta = field.querySelector(".set-textarea") as HTMLTextAreaElement;
  try {
    const d = await (await fetch(`/api/${kind}`)).json();
    ta.value = list ? (d.statuses || []).join("\n") : (d.content || "");
  } catch { ta.value = ""; }
  ta.dataset.orig = ta.value;
  ta.dataset.loaded = "1";
  ta.addEventListener("blur", () => saveTextField(field));
}
async function saveTextField(field) {
  const kind = field.dataset.kind;
  const list = field.dataset.list === "1";
  const ta = field.querySelector(".set-textarea") as HTMLTextAreaElement;
  if (ta.dataset.loaded !== "1" || ta.value === ta.dataset.orig) return;
  const body = list
    ? { statuses: ta.value.split(/\r?\n/).map(s => s.trim()).filter(Boolean) }
    : { content: ta.value };
  let resp;
  try {
    resp = await fetch(`/api/${kind}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch (e) { toast(`save failed: ${e.message}`); return; }
  if (!resp.ok) { toast(`save failed: ${(await resp.text().catch(() => "")).trim() || "HTTP " + resp.status}`); return; }
  ta.dataset.orig = ta.value;
  flashSaved(field);
  if (kind === "followup-template") state.followupTemplate = ta.value;
  if (list) { await loadStatusVocab(); renderJobs(); }
}
function wireTextFields(c) {
  c.querySelectorAll<HTMLElement>(".set-field[data-kind]").forEach(loadTextField);
}

function renderOutreachSettings(c) {
  c.innerHTML =
    settingsTextFieldHTML("outreach-subject", "Email subject", "The send subject — {{role}} / {{company}} substitution, no LLM.", 2, false) +
    settingsTextFieldHTML("outreach-template", "Email body", "Verbatim prose with the writer's fill-in holes. Put your sign-off at the bottom — markdown links render as real links on send.", 18, false) +
    settingsTextFieldHTML("followup-template", "Follow-up body", "The full follow-up, sign-off included — {{contact_name}}, {{role}}, {{company}}, {{last_sent}}, {{last_message}}.", 9, false) +
    `<div class="set-field">
      <div class="set-field-label">Follow-up reminder</div>
      <div class="set-field-desc">Business days after a send before a follow-up comes due (0 = off).</div>
      <input class="input set-fu-interval" type="number" min="0" max="90" value="${state.followupInterval}" style="margin-top:8px;width:90px">
    </div>`;
  wireTextFields(c);
  const fu = c.querySelector<HTMLInputElement>(".set-fu-interval");
  if (fu) fu.addEventListener("change", async () => {
    const days = Math.max(0, Math.min(90, parseInt(fu.value, 10) || 0));
    fu.value = String(days);
    const r = await contactApi("PUT", "/api/followup-interval", { days });
    if (r) { state.followupInterval = days; toast("follow-up interval saved"); }
  });
}

function renderPipelineSettings(c) {
  c.innerHTML = PIPELINE_STAGES.map(([key, title, desc]) => `
    <div class="set-field" data-prompt="${key}">
      <div class="set-field-label">${escapeHTML(title)}</div>
      <div class="set-field-desc">${escapeHTML(desc)}</div>
      <textarea class="set-textarea" rows="12" spellcheck="false" data-loaded="0">loading…</textarea>
      <div class="set-field-foot">
        <span class="set-saved">saved ✓</span>
        ${key !== "fill" ? `<label class="set-toggle"><input type="checkbox" class="pl-enabled"> run this stage</label>` : ""}
        <button class="btn pl-reset">Reset to default</button>
      </div>
    </div>`).join("");
  c.querySelectorAll<HTMLElement>(".set-field[data-prompt]").forEach(loadPromptField);
}
async function loadPromptField(field) {
  const key = field.dataset.prompt;
  const ta = field.querySelector(".set-textarea") as HTMLTextAreaElement;
  const en = field.querySelector(".pl-enabled") as HTMLInputElement | null;
  try {
    const d = await (await fetch(`/api/outreach-prompts/${key}`)).json();
    ta.value = d.content || "";
    if (en) en.checked = d.enabled !== false;
  } catch { ta.value = ""; }
  ta.dataset.orig = ta.value;
  ta.dataset.loaded = "1";
  ta.addEventListener("blur", () => savePromptField(field));
  if (en) en.addEventListener("change", () => savePromptField(field));
  const reset = field.querySelector(".pl-reset");
  if (reset) reset.addEventListener("click", async () => {
    const r = await fetch(`/api/outreach-prompts/${key}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reset: true }) });
    if (!r.ok) { toast(`reset failed: HTTP ${r.status}`); return; }
    const d = await r.json();
    ta.value = d.content || ""; ta.dataset.orig = ta.value;
    if (en) en.checked = d.enabled !== false;
    flashSaved(field); toast("reset to default");
  });
}
async function savePromptField(field) {
  const key = field.dataset.prompt;
  const ta = field.querySelector(".set-textarea") as HTMLTextAreaElement;
  const en = field.querySelector(".pl-enabled") as HTMLInputElement | null;
  if (ta.dataset.loaded !== "1") return;
  const body: any = { content: ta.value };
  if (en) body.enabled = en.checked;
  let resp;
  try {
    resp = await fetch(`/api/outreach-prompts/${key}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch (e) { toast(`save failed: ${e.message}`); return; }
  if (!resp.ok) { toast(`save failed: ${(await resp.text().catch(() => "")).trim() || "HTTP " + resp.status}`); return; }
  ta.dataset.orig = ta.value;
  flashSaved(field);
}

function renderTrackingSettings(c) {
  c.innerHTML =
    settingsTextFieldHTML("application-stages", "Application stages", "The application pipeline labels (applied, screening, interview…). One per line.", 6, true) +
    settingsTextFieldHTML("outreach-statuses", "Outreach statuses", "The outreach reply labels (initial contact, no response, replied…). One per line.", 6, true);
  wireTextFields(c);
}

function renderJobHuntingSettings(c) {
  const p = state.profile;
  const active = (p && p.active_source) || (state.stats && state.stats.taste_source) || "";
  const usingBrain = active.startsWith("brain:");
  const hasBody = p && typeof p.body === "string";
  let briefBlock;
  if (usingBrain) {
    briefBlock = `<div class="set-field">
      <div class="set-field-label">Company-fit brief <button class="btn btn-sm" id="brief-refresh" title="re-distill from the brain">Refresh</button></div>
      <div class="set-field-desc">The criteria scout feeds the verdict stage — distilled from the brain (read-only here).</div>
      <pre class="set-readonly">${escapeHTML(hasBody ? p.body : "(no brief yet — Refresh to distill from the brain)")}</pre>
    </div>`;
  } else {
    briefBlock = settingsTextFieldHTML("taste", "Taste (local fallback)", "Local fallback criteria used when the brain is unreachable.", 12, false);
  }
  c.innerHTML = briefBlock +
    settingsTextFieldHTML("playbook", "Playbook", "How scout judges — the reasoning rules behind every verdict.", 12, false) +
    prefilterFormHTML();
  wireTextFields(c);
  const rb = c.querySelector("#brief-refresh");
  if (rb) rb.addEventListener("click", refreshProfile);
  openPrefilter();  // populate the inline pre-filter form (chips/stages/toggles)
  const ps = c.querySelector("#pf-save");
  if (ps) ps.addEventListener("click", savePrefilter);
  const pr = c.querySelector("#pf-reset");
  if (pr) pr.addEventListener("click", () => openPrefilter(true));
}

// The one-time Google Cloud setup helper shown on the Gmail integration field:
// the exact callback URL to register (copy button) + the scopes + the click-path.
// Surfacing scout's own callback verbatim is what prevents redirect_uri_mismatch.
function gmailSetupHTML(gm) {
  const cb = gm.callback_uri || "(your scout URL)/api/gmail/callback";
  const scopes = gm.scopes || [
    "openid", "email",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/gmail.readonly",
  ];
  return `<details class="set-help"${gm.configured ? "" : " open"}>
    <summary>Set up the Google OAuth client (one-time)</summary>
    <div class="set-help-body">
      <ol class="set-steps">
        <li><strong>Enable the Gmail API.</strong> In <a href="https://console.cloud.google.com/apis/library/gmail.googleapis.com" target="_blank" rel="noopener">APIs &amp; Services → Library → Gmail API</a>, click <strong>Enable</strong> — or run <code>gcloud services enable gmail.googleapis.com</code>.</li>
        <li><strong>Configure the OAuth consent screen.</strong> Add these scopes:
          <ul class="set-help-scopes">${scopes.map(s => `<li><code>${escapeHTML(s)}</code></li>`).join("")}</ul>
          Then authorize your mailbox — pick one:
          <div class="set-choice">
            <div class="sc-opt sc-go">
              <div class="sc-opt-head"><strong>Publish app</strong><span class="sc-tag">recommended</span></div>
              <div class="sc-opt-desc">Self-hosting your own mailbox needs no Google verification.</div>
            </div>
            <div class="sc-or">or</div>
            <div class="sc-opt sc-alt">
              <div class="sc-opt-head"><strong>Add Test users</strong></div>
              <div class="sc-opt-desc">Add your own Google account as a test user — no publishing.</div>
            </div>
          </div>
        </li>
        <li><strong>Create the OAuth client.</strong> In <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener">APIs &amp; Services → Credentials</a>, create an <strong>OAuth client ID → Web application</strong>, and add this exact <strong>Authorized redirect URI</strong>:
          <div class="set-copy-row"><code id="gm-cb">${escapeHTML(cb)}</code><button class="btn btn-sm" id="gm-copy-cb" type="button">Copy</button></div>
        </li>
        <li><strong>Connect.</strong> Paste the client ID &amp; secret below, click <strong>Save</strong>, then <strong>Connect</strong>.</li>
      </ol>
    </div>
  </details>`;
}

function renderIntegrationsSettings(c) {
  const ak = state.anthropicKey || {};
  let knote = "Not set — verdict, capture & outreach disabled.";
  if (ak.key_source === "db") knote = "Set here · active.";
  else if (ak.key_source === "env") knote = "Using the ANTHROPIC_API_KEY environment variable.";
  const gm = state.gmail || {};
  const gConnected = !!gm.connected, gConfigured = !!gm.configured;
  const gdot = gConnected ? "ok" : (gConfigured ? "warn" : "off");
  const gstatusTxt = gConnected
    ? `Connected as ${escapeHTML(gm.email || "your account")}`
    : (gConfigured ? "Not connected" : "Not set up");

  c.innerHTML = `
    <div class="set-field">
      <div class="set-field-label">Anthropic API key</div>
      <div class="set-field-desc">Powers scoring, capture & outreach. ${escapeHTML(knote)}</div>
      <div class="set-field-row" style="margin-top:8px">
        <input class="input" id="set-ak-input" type="password" placeholder="${ak.key_source === "db" ? "•••••• set — paste to replace" : "sk-ant-…"}" autocomplete="off" spellcheck="false" style="flex:1">
        <button class="btn btn-primary" id="set-ak-save">Save</button>
        ${ak.key_source === "db" ? `<button class="btn" id="set-ak-remove">Remove</button>` : ""}
      </div>
    </div>
    <div class="set-field">
      <div class="set-field-label">Gmail <span class="set-status"><span class="pf-dot ${gdot}"></span>${gstatusTxt}</span></div>
      <div class="set-field-desc">Send outreach from your Gmail and auto-sync replies + application status.</div>
      ${gmailSetupHTML(gm)}
      <div class="set-subfields">
        <label class="set-sub-label" for="set-gm-id">Client ID</label>
        <input class="input" id="set-gm-id" placeholder="…apps.googleusercontent.com" autocomplete="off" spellcheck="false" value="${escapeHTML(gm.client_id || "")}">
        <label class="set-sub-label" for="set-gm-secret">Client secret</label>
        <input class="input" id="set-gm-secret" type="password" placeholder="(leave blank to keep the current secret)" autocomplete="off" spellcheck="false">
        <label class="set-sub-label" for="set-gm-redirect">Redirect URI <span class="dim">(optional — derived from this host if blank)</span></label>
        <input class="input" id="set-gm-redirect" placeholder="https://…/api/gmail/callback" autocomplete="off" spellcheck="false" value="${escapeHTML(gm.redirect_uri || "")}">
      </div>
      <div class="set-field-row" style="margin-top:10px">
        <button class="btn" id="set-gm-save">Save credentials</button>
        ${gConfigured && !gConnected ? `<button class="btn btn-primary" id="set-gm-connect">Connect</button>` : ""}
        ${gConnected ? `<button class="btn" id="set-gm-disconnect">Disconnect</button>` : ""}
      </div>
    </div>
    <div class="set-field">
      <div class="set-field-label">Auto-update application status</div>
      <div class="set-field-desc">On: scout sets a job's application status from incoming ATS/company mail. Off (default): it suggests it in the Inbox for one-click apply.</div>
      <div class="set-field-row" style="margin-top:8px"><label class="set-toggle"><input type="checkbox" id="set-autoflip" ${gm.autoflip ? "checked" : ""}> auto-update application status</label></div>
    </div>`;

  const akSave = c.querySelector("#set-ak-save");
  if (akSave) akSave.addEventListener("click", async () => {
    const v = (c.querySelector("#set-ak-input") as HTMLInputElement).value.trim();
    if (!v) { toast("paste a key first"); return; }
    const r = await fetch("/api/integrations/anthropic", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: v }) });
    if (!r.ok) { toast((await r.text().catch(() => "")).trim() || `HTTP ${r.status}`); return; }
    toast("Anthropic key saved"); await loadMeta(); await loadKeyState();
  });
  const akRemove = c.querySelector("#set-ak-remove");
  if (akRemove) akRemove.addEventListener("click", async () => {
    const r = await fetch("/api/integrations/anthropic", { method: "DELETE" });
    if (!r.ok) { toast(`HTTP ${r.status}`); return; }
    toast("Anthropic key removed"); await loadMeta(); await loadKeyState();
  });
  const gmSave = c.querySelector("#set-gm-save");
  if (gmSave) gmSave.addEventListener("click", async () => {
    const client_id = (c.querySelector("#set-gm-id") as HTMLInputElement).value.trim();
    const client_secret = (c.querySelector("#set-gm-secret") as HTMLInputElement).value;
    const redirect_uri = (c.querySelector("#set-gm-redirect") as HTMLInputElement).value.trim();
    if (!client_id) { toast("client ID is required"); return; }
    const r = await fetch("/api/gmail/config", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ client_id, client_secret, redirect_uri }) });
    if (!r.ok) { toast((await r.text().catch(() => "")).trim() || `HTTP ${r.status}`); return; }
    toast("Gmail OAuth client saved"); await loadGmailState();
  });
  const gmConnect = c.querySelector("#set-gm-connect");
  if (gmConnect) gmConnect.addEventListener("click", gmailConnect);
  const gmDisc = c.querySelector("#set-gm-disconnect");
  if (gmDisc) gmDisc.addEventListener("click", gmailDisconnect);
  const cbCopy = c.querySelector("#gm-copy-cb");
  if (cbCopy) cbCopy.addEventListener("click", () => copyToClipboard((state.gmail && state.gmail.callback_uri) || "", "redirect URI copied"));
  const af = c.querySelector("#set-autoflip") as HTMLInputElement | null;
  if (af) af.addEventListener("change", async () => {
    let ok = false;
    try {
      const r = await fetch("/api/gmail/autoflip", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: af.checked }) });
      ok = r.ok;
    } catch { ok = false; }
    if (ok) { if (state.gmail) state.gmail.autoflip = af.checked; toast(`auto-update ${af.checked ? "on" : "off"}`); }
    else { af.checked = !af.checked; toast("failed to save"); }
  });
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

// ---- Gmail link (Integrations card) ----
//
// Status is {connected, email, configured, autoflip}. Connect kicks off the
// backend OAuth flow (a redirect to Google's consent screen); disconnect drops
// the stored token. The synced data stays local either way.
async function loadGmailState() {
  try {
    state.gmail = await (await fetch("/api/gmail/status")).json();
  } catch { state.gmail = null; }
  renderCriteria();
}
async function gmailConnect() {
  let resp;
  try { resp = await fetch("/api/gmail/connect"); }
  catch (e) { toast(`connect failed: ${e.message}`); return; }
  if (!resp.ok) { toast((await resp.text().catch(() => "")).trim() || `HTTP ${resp.status}`); return; }
  let body: any = {};
  try { body = await resp.json(); } catch { /* */ }
  if (body.auth_url) window.location.href = body.auth_url;  // off to Google's consent screen
  else toast("could not start the Gmail connect flow");
}
async function gmailDisconnect() {
  if (!confirm("Disconnect Gmail? Sending and sync stop; already-synced data stays.")) return;
  let resp;
  try { resp = await fetch("/api/gmail/disconnect", { method: "DELETE" }); }
  catch (e) { toast(`disconnect failed: ${e.message}`); return; }
  if (!resp.ok) { toast((await resp.text().catch(() => "")).trim() || `HTTP ${resp.status}`); return; }
  toast("Gmail disconnected");
  await loadGmailState();
}
// Gmail OAuth client config — paste the Google Cloud client id/secret so the
// Connect flow works without a server env var. The secret is write-only.
async function openGmailConfig() {
  await loadGmailState();
  const gm = state.gmail || {};
  document.getElementById("gmail-config-scrim").classList.add("open");
  (document.getElementById("gmail-client-id") as HTMLInputElement).value = gm.client_id || "";
  (document.getElementById("gmail-client-secret") as HTMLInputElement).value = "";
  (document.getElementById("gmail-redirect") as HTMLInputElement).value = gm.redirect_uri || "";
  const rm = document.getElementById("gmail-config-remove");
  if (rm) rm.style.display = gm.config_source === "db" ? "" : "none";
  const inp = document.getElementById("gmail-client-id");
  if (inp) (inp as HTMLInputElement).focus();
}
function closeGmailConfig() { document.getElementById("gmail-config-scrim").classList.remove("open"); }
async function saveGmailConfig() {
  const client_id = (document.getElementById("gmail-client-id") as HTMLInputElement).value.trim();
  const client_secret = (document.getElementById("gmail-client-secret") as HTMLInputElement).value;
  const redirect_uri = (document.getElementById("gmail-redirect") as HTMLInputElement).value.trim();
  if (!client_id) { toast("client ID is required"); return; }
  let resp;
  try {
    resp = await fetch("/api/gmail/config", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id, client_secret, redirect_uri }),
    });
  } catch (e) { toast(`save failed: ${e.message}`); return; }
  if (!resp.ok) { toast((await resp.text().catch(() => "")).trim() || `HTTP ${resp.status}`); return; }
  toast("Gmail OAuth client saved — click Connect");
  closeGmailConfig();
  await loadGmailState();
}
async function removeGmailConfig() {
  if (!confirm("Remove the stored Google OAuth client? Connecting needs it re-entered (or set via env).")) return;
  let resp;
  try { resp = await fetch("/api/gmail/config", { method: "DELETE" }); }
  catch (e) { toast(`remove failed: ${e.message}`); return; }
  if (!resp.ok) { toast((await resp.text().catch(() => "")).trim() || `HTTP ${resp.status}`); return; }
  toast("OAuth client removed");
  closeGmailConfig();
  await loadGmailState();
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

// ---- docs ("how it works"): a full-page view, reached from the sidebar ----
function onDocsShown() {
  const first = document.querySelector("#docs-nav a") as HTMLElement | null;
  setActiveDoc(first ? first.dataset.sec : null);
  const body = document.getElementById("docs-body");
  if (body) body.scrollTop = 0;
}
function setActiveDoc(sec) {
  document.querySelectorAll("#docs-nav a").forEach(a =>
    a.classList.toggle("active", (a as HTMLElement).dataset.sec === sec));
}
// jump the (already-shown) docs view to a section by its nav id
function goToDocSection(sec) {
  const el = document.getElementById("doc-" + sec);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  setActiveDoc(sec);
}
document.getElementById("open-docs").onclick = () => setView("docs");

// ---- settings: a full-page view (like companies/jobs), reached from the sidebar ----
function openSettings() { setView("settings"); }
document.getElementById("open-settings").onclick = openSettings;

// ---- Gmail OAuth client config modal ----
document.getElementById("gmail-config-cancel").onclick = closeGmailConfig;
document.getElementById("gmail-config-save").onclick = saveGmailConfig;
document.getElementById("gmail-config-remove").onclick = removeGmailConfig;
document.getElementById("gmail-config-scrim").onclick = e => {
  if ((e.target as HTMLElement).id === "gmail-config-scrim") closeGmailConfig();
};

// ---- notifications / inbox (M55) ----
//
// The bell in the sidebar shows an unread count; the panel lists Gmail-synced
// updates (replies + application-status suggestions) and the follow-ups due
// (derived from the outreach log, folded in — not duplicated into the table).
function renderNotifBadge() {
  const b = document.getElementById("notif-badge");
  if (!b) return;
  const n = (state.notifications && state.notifications.unread) | 0;
  if (n > 0) { b.textContent = n > 99 ? "99+" : String(n); b.style.display = ""; }
  else b.style.display = "none";
}
async function loadNotifications() {
  try { state.notifications = await (await fetch("/api/notifications")).json(); }
  catch { return; }
  renderNotifBadge();
  if (state.view === "inbox") renderNotifications();
}

// The link-to-role picker options come from the jobs table state.
function jobOptionsHTML() {
  const opts = (state.jobs || []).map(j =>
    `<option value="${escapeHTML(j.posting_id)}">${escapeHTML((j.company || "") + " — " + (j.title || "(untitled)"))}</option>`
  ).join("");
  return `<option value="">link to role…</option>` + opts;
}

function notifItemHTML(n) {
  const ctx = (n.company || n.role)
    ? `<div class="notif-ctx">${escapeHTML([n.company, n.role].filter(Boolean).join(" · "))}</div>`
    : `<div class="notif-ctx dim">not linked to a role</div>`;
  const when = n.created_at ? `<span class="notif-when">${escapeHTML((n.created_at || "").replace("T", " ").slice(0, 16))}</span>` : "";
  const apply = (n.kind === "app_status" && n.suggested_status && !n.actioned && n.posting_id)
    ? `<button class="btn btn-primary notif-apply" data-id="${n.id}">Apply: ${escapeHTML(n.suggested_status)}</button>`
    : "";
  const link = !n.posting_id
    ? `<select class="input notif-link" data-id="${n.id}" title="link this to a role">${jobOptionsHTML()}</select>`
    : "";
  return `<div class="notif-item${n.seen ? "" : " is-unread"}" data-id="${n.id}" data-seen="${n.seen ? 1 : 0}">
    <div class="notif-main">
      <div class="notif-title">${n.seen ? "" : '<span class="notif-dot" aria-label="unread"></span>'}${escapeHTML(n.title)}</div>
      ${ctx}
      ${n.detail ? `<div class="notif-detail">${escapeHTML(n.detail)}</div>` : ""}
    </div>
    <div class="notif-side">${when}<div class="notif-acts">${apply}${link}</div></div>
  </div>`;
}

function followupItemHTML(f) {
  return `<div class="notif-item notif-followup">
    <div class="notif-main">
      <div class="notif-title">Follow up: ${escapeHTML(f.contact_name || "contact")}</div>
      <div class="notif-ctx">${escapeHTML([f.company, f.role].filter(Boolean).join(" · "))}</div>
      <div class="notif-detail dim">due ${escapeHTML(f.due_at || "")}</div>
    </div>
    <div class="notif-side"><button class="btn notif-open" data-pid="${escapeHTML(f.posting_id)}">Open</button></div>
  </div>`;
}

function renderNotifications() {
  const host = document.getElementById("notifications-body");
  if (!host) return;
  const s = state.notifications || { notifications: [], followups: [] };
  const notifs = s.notifications || [];
  const fus = s.followups || [];
  if (!notifs.length && !fus.length) {
    host.innerHTML = `<div class="cc-empty dim">Nothing here yet. Replies, application updates, and follow-ups show up as Gmail syncs.</div>`;
    return;
  }
  let html = "";
  if (notifs.length) html += `<div class="settings-group-h">Updates</div>` + notifs.map(notifItemHTML).join("");
  if (fus.length) html += `<div class="settings-group-h">Follow-ups due</div>` + fus.map(followupItemHTML).join("");
  host.innerHTML = html;
  wireNotifications();
}

function wireNotifications() {
  const host = document.getElementById("notifications-body");
  if (!host) return;
  host.querySelectorAll(".notif-item[data-id]").forEach(item => {
    const id = (item as HTMLElement).dataset.id;
    const main = item.querySelector(".notif-main");
    // Opening (clicking) an unread item marks it read — a reply "sets seen".
    if (main && (item as HTMLElement).dataset.seen === "0") main.addEventListener("click", () => markNotifSeen(id));
  });
  host.querySelectorAll<HTMLElement>(".notif-apply").forEach(b =>
    b.addEventListener("click", e => { e.stopPropagation(); applyNotif(b.dataset.id); }));
  host.querySelectorAll<HTMLSelectElement>(".notif-link").forEach(sel =>
    sel.addEventListener("change", e => { e.stopPropagation(); if (sel.value) linkNotif(sel.dataset.id, sel.value); }));
  host.querySelectorAll<HTMLElement>(".notif-open").forEach(b =>
    b.addEventListener("click", () => { const pid = b.dataset.pid; setView("jobs"); openPursuit(pid); }));
}

async function markNotifSeen(id) {
  try { await fetch(`/api/notifications/${id}/seen`, { method: "POST" }); } catch { return; }
  await loadNotifications();
}
async function applyNotif(id) {
  let resp;
  try { resp = await fetch(`/api/notifications/${id}/apply`, { method: "POST" }); }
  catch (e) { toast(`apply failed: ${e.message}`); return; }
  if (!resp.ok) { toast((await resp.text().catch(() => "")).trim() || `HTTP ${resp.status}`); return; }
  const j = await resp.json().catch(() => ({}));
  toast(`status set to ${j.applied || "updated"}`);
  await loadNotifications();
  await loadJobs();   // reflect the new application_status in the table
}
async function linkNotif(id, postingId) {
  let resp;
  try {
    resp = await fetch(`/api/notifications/${id}/link`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ posting_id: postingId }),
    });
  } catch (e) { toast(`link failed: ${e.message}`); return; }
  if (!resp.ok) { toast((await resp.text().catch(() => "")).trim() || `HTTP ${resp.status}`); return; }
  toast("linked to role");
  await loadNotifications();
}
async function syncGmailNow() {
  const btn = document.getElementById("notifications-sync") as HTMLButtonElement | null;
  if (btn) { btn.disabled = true; btn.textContent = "Syncing…"; }
  try {
    const r = await fetch("/api/gmail/sync", { method: "POST" });
    toast(r.ok ? "synced" : ((await r.text().catch(() => "")).trim() || `HTTP ${r.status}`));
  } catch (e) { toast(`sync failed: ${e.message}`); }
  if (btn) { btn.disabled = false; btn.textContent = "Sync now"; }
  await loadNotifications();
  await loadJobs();
}
document.getElementById("notifications-sync").onclick = syncGmailNow;

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
  // tool_use → the custom tool's name; server_tool_use → the hosted web_search
  // (shown as "web search") so web calls leave a visible footnote on the turn.
  return (content || [])
    .filter(b => b && (b.type === "tool_use" || b.type === "server_tool_use"))
    .map(b => b.type === "server_tool_use" ? "web search" : b.name);
}

// Minimal markdown → safe HTML for assistant bubbles. Escapes first, then
// applies a small block + inline subset (fenced code, lists, headings,
// paragraphs; bold/italic/inline-code/links). Not a full parser — just what
// chat replies actually use. Safe by construction: every text run is
// HTML-escaped before we introduce any of our own (known) tags.
function chatInline(s) {
  return s
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)/g,
      (_m, t, u) => `<a href="${u}" target="_blank" rel="noopener noreferrer">${t}</a>`)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
}
function renderMarkdown(src) {
  const lines = String(src || "").split("\n");
  const out = [];
  let list = null;                                  // "ul" | "ol" | null
  const closeList = () => { if (list) { out.push("</" + list + ">"); list = null; } };
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^```/.test(line)) {                         // fenced code block
      closeList(); i++;
      const buf = [];
      while (i < lines.length && !/^```/.test(lines[i])) { buf.push(lines[i]); i++; }
      i++;                                           // skip closing fence
      out.push("<pre><code>" + escapeHTML(buf.join("\n")) + "</code></pre>");
      continue;
    }
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) { closeList(); const n = h[1].length; out.push("<h" + n + ">" + chatInline(escapeHTML(h[2])) + "</h" + n + ">"); i++; continue; }
    const ul = line.match(/^\s*[-*]\s+(.*)$/);
    if (ul) { if (list !== "ul") { closeList(); out.push("<ul>"); list = "ul"; } out.push("<li>" + chatInline(escapeHTML(ul[1])) + "</li>"); i++; continue; }
    const ol = line.match(/^\s*\d+\.\s+(.*)$/);
    if (ol) { if (list !== "ol") { closeList(); out.push("<ol>"); list = "ol"; } out.push("<li>" + chatInline(escapeHTML(ol[1])) + "</li>"); i++; continue; }
    if (line.trim() === "") { closeList(); i++; continue; }
    closeList();                                     // paragraph: gather until a blank/special line
    const para = [];
    while (i < lines.length && lines[i].trim() !== "" && !/^```|^#{1,6}\s|^\s*[-*]\s+|^\s*\d+\.\s+/.test(lines[i])) {
      para.push(chatInline(escapeHTML(lines[i]))); i++;
    }
    out.push("<p>" + para.join("<br>") + "</p>");
  }
  closeList();
  return out.join("");
}

function chatBubbleEl(role, text) {
  const div = document.createElement("div");
  div.className = "chat-msg chat-" + role;
  if (role === "assistant") div.innerHTML = renderMarkdown(text || "");
  else div.textContent = text || "";
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
  // Transient status line: shows the latest tool/web-search activity while the
  // turn streams, then is removed when the turn ends (the canonical reload shows
  // the persistent "· used X" chips).
  const activity = document.createElement("div");
  activity.className = "chat-activity";
  activity.style.display = "none";
  host.appendChild(activity);
  const clearActivity = () => { activity.remove(); };
  chatScrollBottom();

  let acc = "";
  const fail = (msg) => { clearActivity(); asst.classList.remove("chat-streaming"); asst.textContent = "⚠ " + msg; chatSetSending(false); };

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
  es.addEventListener("activity", (e) => {
    activity.style.display = "";
    activity.textContent = "· " + e.data + "…";
    chatScrollBottom();
  });
  es.addEventListener("end", async (e) => {
    es.close();
    if (state.chat.es === es) state.chat.es = null;
    clearActivity();
    asst.classList.remove("chat-streaming");
    chatSetSending(false);
    if (state.chat.threadId === threadId) await reloadChat();
    refreshAfterChat();
    if (typeof e.data === "string" && e.data.indexOf("error") === 0) toast("chat: " + e.data);
  });
  es.onerror = () => {
    es.close();
    if (state.chat.es === es) state.chat.es = null;
    clearActivity();
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
loadKeyState();
loadGmailState();  // M55: Gmail connection status for the Integrations card + send button
loadNotifications();  // M55: inbox bell badge (replies / application updates / follow-ups due)
setInterval(loadNotifications, 90000);  // keep the bell fresh as the poller syncs
loadStatusVocab(); // the configurable stage/status vocabularies drive the jobs dropdowns + filter chips

// Surface the OAuth round-trip result (the callback redirects to /?gmail=…), then
// clean the query so a refresh doesn't re-toast.
(function gmailReturn() {
  const m = /[?&]gmail=(connected|error)/.exec(location.search);
  if (!m) return;
  toast(m[1] === "connected" ? "Gmail connected" : "Gmail connection failed");
  history.replaceState(null, "", location.pathname + location.hash);
})();
}
