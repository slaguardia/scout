// The UI store — the React replacement for app.ts's single mutable `state`
// object plus its scattered module-level `let`s (open panes, filter selections,
// sort, hidden columns, which modal is open). Server data lives in TanStack
// Query; this store holds only ephemeral view state. A reducer + Context mirror
// the original: one place, typed actions, localStorage persistence for the bits
// the vanilla app persisted (the active tab + hidden columns).
import {
  createContext,
  useContext,
  useReducer,
  useMemo,
  type Dispatch,
  type ReactNode,
} from "react";
import type { CompanyDetail, Posting, Contact, OutreachLogEntry } from "../api/types";

export type View = "companies" | "jobs" | "inbox" | "settings" | "docs";

export interface Sort {
  k: string;
  dir: number; // 1 asc, -1 desc
}

export const DEFAULT_SORT: Sort = { k: "verdict", dir: 1 };
export const DEFAULT_JSORT: Sort = { k: "created_at", dir: 1 };

export interface CompaniesFilter {
  q: string;
  verdict: Set<string>; // "yes"/"maybe"/"no"/"__none__"; empty = no filter
  flagOnly: boolean;
  enrichedOnly: boolean;
}

export interface JobsFilter {
  q: string;
  stages: Set<string> | null; // null until first vocab load seeds it
  statuses: Set<string> | null;
  nextUpOnly: boolean;
  dueOnly: boolean;
  archivedOnly: boolean;
}

// The active modal, as a discriminated union — one field replaces the vanilla
// app's ~11 module-level `let xTarget` handles + per-modal scrim toggles.
export type Modal =
  | { kind: "add" }
  | { kind: "editor"; editorKind: string }
  | { kind: "sources" }
  | { kind: "run"; stage: "enrich" | "verdict" }
  | { kind: "relink"; posting: Posting }
  | { kind: "delCompany"; company: CompanyDetail }
  | { kind: "delJob"; posting: Posting }
  | { kind: "delContact"; contactId: string; name: string; count: number }
  | {
      kind: "sendFollowup";
      postingId: string;
      contact: Contact;
      latest: OutreachLogEntry | null;
    };

export interface UIState {
  view: View;
  companiesSort: Sort;
  jobsSort: Sort;
  companiesFilter: CompaniesFilter;
  jobsFilter: JobsFilter;
  hiddenCols: Set<string>; // companies table
  jHiddenCols: Set<string>; // jobs table
  settingsGroup: string; // active Settings sub-page
  openCompanyId: string | null; // company detail pane
  openPursuitId: string | null; // pursuit pane (jobs)
  chat: { scope: string; scopeId: string; title: string } | null;
  modal: Modal | null;
  topPane: "company" | "pursuit" | null; // which slide-in is stacked on top
  // Last-seen vocab, so a mid-session vocab edit can default genuinely-new
  // stages/statuses to visible while dropping ones that were removed.
  knownStages: string[] | null;
  knownStatuses: string[] | null;
  docsSection: string | null; // deep-link target when opening the docs view
}

function loadHidden(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return new Set(JSON.parse(raw));
  } catch {
    /* ignore */
  }
  return new Set();
}

function savedView(): View {
  try {
    return localStorage.getItem("scout-view") === "jobs" ? "jobs" : "companies";
  } catch {
    return "companies";
  }
}

export function initialUI(): UIState {
  return {
    view: savedView(),
    companiesSort: { ...DEFAULT_SORT },
    jobsSort: { ...DEFAULT_JSORT },
    companiesFilter: { q: "", verdict: new Set(), flagOnly: false, enrichedOnly: false },
    jobsFilter: { q: "", stages: null, statuses: null, nextUpOnly: false, dueOnly: false, archivedOnly: false },
    hiddenCols: loadHidden("scout-hidden-cols"),
    jHiddenCols: loadHidden("scout-hidden-jcols"),
    settingsGroup: "outreach",
    openCompanyId: null,
    openPursuitId: null,
    chat: null,
    modal: null,
    topPane: null,
    knownStages: null,
    knownStatuses: null,
    docsSection: null,
  };
}

export type Action =
  | { type: "setView"; view: View }
  | { type: "gotoDocs"; section: string }
  | { type: "clearDocsSection" }
  | { type: "setSettingsGroup"; group: string }
  | { type: "setCompaniesSort"; sort: Sort }
  | { type: "setJobsSort"; sort: Sort }
  | { type: "setCompaniesFilter"; patch: Partial<CompaniesFilter> }
  | { type: "setJobsFilter"; patch: Partial<JobsFilter> }
  | { type: "reconcileJobsVocab"; stages: string[]; statuses: string[] }
  | { type: "setHiddenCols"; cols: Set<string> }
  | { type: "setJHiddenCols"; cols: Set<string> }
  | { type: "openCompany"; id: string }
  | { type: "closeCompany" }
  | { type: "openPursuit"; id: string }
  | { type: "closePursuit" }
  | { type: "raisePane"; which: "company" | "pursuit" }
  | { type: "openChat"; scope: string; scopeId: string; title: string }
  | { type: "closeChat" }
  | { type: "openModal"; modal: Modal }
  | { type: "closeModal" };

function persist(key: string, val: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch {
    /* ignore */
  }
}

function reducer(state: UIState, action: Action): UIState {
  switch (action.type) {
    case "setView":
      try {
        localStorage.setItem("scout-view", action.view);
      } catch {
        /* ignore */
      }
      return { ...state, view: action.view };
    case "gotoDocs":
      try {
        localStorage.setItem("scout-view", "docs");
      } catch {
        /* ignore */
      }
      return { ...state, view: "docs", docsSection: action.section };
    case "clearDocsSection":
      return { ...state, docsSection: null };
    case "setSettingsGroup":
      return { ...state, settingsGroup: action.group };
    case "setCompaniesSort":
      return { ...state, companiesSort: action.sort };
    case "setJobsSort":
      return { ...state, jobsSort: action.sort };
    case "setCompaniesFilter":
      return { ...state, companiesFilter: { ...state.companiesFilter, ...action.patch } };
    case "setJobsFilter":
      return { ...state, jobsFilter: { ...state.jobsFilter, ...action.patch } };
    case "reconcileJobsVocab": {
      const { stages: allStages, statuses: allStatuses } = action;
      const reconcile = (
        sel: Set<string> | null,
        all: string[],
        known: string[] | null,
      ): Set<string> => {
        if (sel === null) return new Set(["", ...all]);
        const next = new Set(sel);
        for (const s of [...next]) if (s !== "" && !all.includes(s)) next.delete(s);
        if (known) for (const s of all) if (!known.includes(s)) next.add(s);
        return next;
      };
      const stages = reconcile(state.jobsFilter.stages, allStages, state.knownStages);
      const statuses = reconcile(state.jobsFilter.statuses, allStatuses, state.knownStatuses);
      return {
        ...state,
        jobsFilter: { ...state.jobsFilter, stages, statuses },
        knownStages: [...allStages],
        knownStatuses: [...allStatuses],
      };
    }
    case "setHiddenCols":
      persist("scout-hidden-cols", [...action.cols]);
      return { ...state, hiddenCols: action.cols };
    case "setJHiddenCols":
      persist("scout-hidden-jcols", [...action.cols]);
      return { ...state, jHiddenCols: action.cols };
    case "openCompany":
      return { ...state, openCompanyId: action.id, topPane: "company" };
    case "closeCompany":
      return { ...state, openCompanyId: null, topPane: state.topPane === "company" ? null : state.topPane };
    case "openPursuit":
      return { ...state, openPursuitId: action.id, topPane: "pursuit" };
    case "closePursuit":
      return {
        ...state,
        openPursuitId: null,
        topPane: state.topPane === "pursuit" ? null : state.topPane,
      };
    case "raisePane":
      return { ...state, topPane: action.which };
    case "openChat":
      return { ...state, chat: { scope: action.scope, scopeId: action.scopeId, title: action.title } };
    case "closeChat":
      return { ...state, chat: null };
    case "openModal":
      return { ...state, modal: action.modal };
    case "closeModal":
      return { ...state, modal: null };
    default:
      return state;
  }
}

const StateCtx = createContext<UIState | null>(null);
const DispatchCtx = createContext<Dispatch<Action> | null>(null);

export function UIProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, initialUI);
  const disp = useMemo(() => dispatch, [dispatch]);
  return (
    <StateCtx.Provider value={state}>
      <DispatchCtx.Provider value={disp}>{children}</DispatchCtx.Provider>
    </StateCtx.Provider>
  );
}

export function useUI(): UIState {
  const s = useContext(StateCtx);
  if (!s) throw new Error("useUI outside UIProvider");
  return s;
}

export function useDispatch(): Dispatch<Action> {
  const d = useContext(DispatchCtx);
  if (!d) throw new Error("useDispatch outside UIProvider");
  return d;
}
