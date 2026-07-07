// Companies view — the main triage table. Sort (click a header to cycle
// asc→desc→cleared), the store-driven filters + column visibility, a shimmer
// skeleton while the first fetch is in flight, the empty state, row-click to open
// the detail pane, and the flag toggle. Faithful port of renderList +
// companyRowCells + the sort/skeleton helpers.
import { useMemo } from "react";
import { useCompanies } from "../api/companies";
import { useUI, useDispatch, DEFAULT_SORT, type Sort } from "../store/ui";
import { useCompanyActions } from "../hooks/useCompanyActions";
import { pillClass } from "../components/Pill";
import { IconFlag } from "../components/icons";
import type { Company } from "../api/types";

function compare(a: Company, b: Company, k: string): number {
  const av = (a as unknown as Record<string, unknown>)[k] ?? "";
  const bv = (b as unknown as Record<string, unknown>)[k] ?? "";
  if (k === "headcount") return ((av as number) | 0) - ((bv as number) | 0);
  if (k === "verdict") {
    const order: Record<string, number> = { yes: 0, maybe: 1, no: 2, "": 3 };
    return (order[av as string] ?? 3) - (order[bv as string] ?? 3);
  }
  return String(av).localeCompare(String(bv));
}

const SKEL_COLS: [string | null, string][] = [
  ["flag", "14px"], ["verdict", "46px"], [null, "62%"], ["reason", "85%"],
  ["vertical", "70%"], ["location", "60%"], ["hc", "26px"], ["stage", "55%"],
  ["reviewed", "44px"], ["site", "38px"],
];

export function CompaniesView({ active }: { active: boolean }) {
  const { data: rows, isLoading } = useCompanies();
  const ui = useUI();
  const dispatch = useDispatch();
  const { toggleFlag } = useCompanyActions();
  const f = ui.companiesFilter;
  const sort = ui.companiesSort;
  const hidden = ui.hiddenCols;

  const filtered = useMemo(() => {
    const q = f.q.trim().toLowerCase();
    const list = (rows ?? []).filter((r) => {
      if (f.verdict.size && !f.verdict.has(r.verdict || "__none__")) return false;
      if (f.flagOnly && !r.flagged) return false;
      if (f.enrichedOnly && !r.enriched) return false;
      if (q) {
        const hay = (r.name + " " + (r.vertical || "") + " " + (r.reason || "")).toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    return list.sort((a, b) => sort.dir * compare(a, b, sort.k));
  }, [rows, f, sort]);

  const cycleSort = (k: string) => {
    let next: Sort;
    if (sort.k !== k) next = { k, dir: 1 };
    else if (sort.dir === 1) next = { k, dir: -1 };
    else next = { ...DEFAULT_SORT };
    dispatch({ type: "setCompaniesSort", sort: next });
  };

  const colStyle = (col: string) => (hidden.has(col) ? { display: "none" } : undefined);
  const sortAttr = (k: string) => (sort.k === k ? { "data-sort": sort.dir < 0 ? "desc" : "asc" } : {});

  return (
    <div className="table-wrap" id="companies-view" style={{ display: active ? "" : "none" }}>
      <table id="t">
        <thead>
          <tr>
            <th className="th-flag" data-col="flag" title="flagged" style={colStyle("flag")}></th>
            <th data-k="verdict" data-col="verdict" style={colStyle("verdict")} {...sortAttr("verdict")} onClick={() => cycleSort("verdict")}>verdict</th>
            <th data-k="name" {...sortAttr("name")} onClick={() => cycleSort("name")}>name</th>
            <th data-k="reason" data-col="reason" style={colStyle("reason")} {...sortAttr("reason")} onClick={() => cycleSort("reason")}>reason</th>
            <th data-k="vertical" data-col="vertical" style={colStyle("vertical")} {...sortAttr("vertical")} onClick={() => cycleSort("vertical")}>vertical</th>
            <th data-k="location" data-col="location" style={colStyle("location")} {...sortAttr("location")} onClick={() => cycleSort("location")}>location</th>
            <th data-k="headcount" data-col="hc" style={colStyle("hc")} {...sortAttr("headcount")} onClick={() => cycleSort("headcount")}>hc</th>
            <th data-k="stage" data-col="stage" style={colStyle("stage")} {...sortAttr("stage")} onClick={() => cycleSort("stage")}>stage</th>
            <th data-k="reviewed_at" data-col="reviewed" style={colStyle("reviewed")} {...sortAttr("reviewed_at")} onClick={() => cycleSort("reviewed_at")}>reviewed</th>
            <th data-col="site" style={colStyle("site")}>site</th>
          </tr>
        </thead>
        <tbody>
          {isLoading
            ? Array.from({ length: 7 }).map((_, i) => (
                <tr key={i} className="skel-row">
                  {SKEL_COLS.map(([col, w], j) => (
                    <td key={j} data-col={col ?? undefined} style={col ? colStyle(col) : undefined}>
                      <span className="skel-bar" style={{ width: w }}></span>
                    </td>
                  ))}
                </tr>
              ))
            : filtered.map((r) => (
                <tr
                  key={r.company_id}
                  data-id={r.company_id}
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest("a, .flag-btn")) return;
                    dispatch({ type: "openCompany", id: r.company_id });
                  }}
                >
                  <td className="td-flag" data-col="flag" style={colStyle("flag")}>
                    <button
                      className={"flag-btn" + (r.flagged ? " is-on" : "")}
                      title={r.flagged ? "unflag" : "flag"}
                      onClick={() => toggleFlag(r.company_id, !!r.flagged)}
                    >
                      <IconFlag />
                    </button>
                  </td>
                  <td data-col="verdict" style={colStyle("verdict")}>
                    <span className={pillClass(r.verdict)}>{r.verdict || "—"}</span>
                  </td>
                  <td>
                    <span className="row-name" data-id={r.company_id}>
                      {r.name}
                    </span>
                  </td>
                  <td className="reason" data-col="reason" style={colStyle("reason")}>{r.reason || ""}</td>
                  <td data-col="vertical" style={colStyle("vertical")}>{r.vertical || ""}</td>
                  <td data-col="location" style={colStyle("location")}>{r.location || ""}</td>
                  <td data-col="hc" style={colStyle("hc")}>{r.headcount || ""}</td>
                  <td data-col="stage" style={colStyle("stage")}>{r.stage || ""}</td>
                  <td data-col="reviewed" className="muted" style={colStyle("reviewed")} title={r.reviewed_at || "never reviewed"}>
                    {r.reviewed_at ? r.reviewed_at.slice(0, 10) : "—"}
                  </td>
                  <td data-col="site" style={colStyle("site")}>
                    {r.website_url ? (
                      <a href={safeHref(r.website_url)} target="_blank" rel="noopener" title="open website" aria-label="open website">↗</a>
                    ) : null}
                  </td>
                </tr>
              ))}
        </tbody>
      </table>
      <div id="empty" className="empty" style={{ display: !isLoading && filtered.length === 0 ? "" : "none" }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4.5-4.5" />
        </svg>
        <div className="t">No companies match the current filters.</div>
        <div className="small dim">
          Clear a filter, or run <code>scout ingest &lt;csv&gt;</code>.
        </div>
      </div>
    </div>
  );
}

function safeHref(u?: string | null): string {
  return /^https?:\/\//i.test(String(u ?? "")) ? String(u) : "#";
}
