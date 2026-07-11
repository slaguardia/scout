// Company detail pane (#pane) — everything scout knows about one company:
// inline-editable name + facts + notes, the jobs list (read-only pursuit cards),
// the verdict block + manual override, enrichment, the decision trail, and the
// danger-zone delete. Faithful port of openDetail/renderDetail + its handlers,
// with query invalidation replacing the vanilla's manual loadList/loadJobs calls.
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { SlidePane, PaneHead } from "../components/Pane";
import { InlineField } from "../components/InlineField";
import { LoadingRow, pillClass } from "../components/Pill";
import { useToast } from "../components/Toast";
import { useUI, useDispatch } from "../store/ui";
import { useRun } from "../store/run";
import { useMeta, useVocab, vocabColorClass } from "../api/queries";
import { useFacets } from "../api/runs";
import { useCompanyActions } from "../hooks/useCompanyActions";
import {
  useCompanyDetail,
  useTrace,
  putVerdict,
  putCompanyField,
  putCompanyDomain,
  putCompanyNotes,
  postPosting,
} from "../api/companies";
import { enrichStatus } from "../lib/enrich";
import type { CompanyDetail, PostingSummary, TraceEvent } from "../api/types";

export function CompanyPane() {
  const ui = useUI();
  const dispatch = useDispatch();
  const id = ui.openCompanyId;
  const onTop = ui.topPane === "company";
  return (
    <SlidePane
      open={id !== null}
      onClose={() => dispatch({ type: "closeCompany" })}
      paneId="pane"
      scrimId="scrim"
      paneZ={onTop ? 55 : 53}
      scrimZ={onTop ? 54 : 52}
    >
      {id !== null ? <DetailBody key={id} id={id} /> : <PaneHead title="—" onClose={() => dispatch({ type: "closeCompany" })} />}
    </SlidePane>
  );
}

function DetailBody({ id }: { id: string }) {
  const { data: d, isLoading, isError, error } = useCompanyDetail(id);
  const dispatch = useDispatch();
  const meta = useMeta().data;

  const onClose = () => dispatch({ type: "closeCompany" });

  if (isLoading || !d) {
    return (
      <>
        <PaneHead title={isError ? "—" : "loading…"} onClose={onClose} />
        <div className="pane-body" id="pane-body">
          {isError ? (
            <div className="muted">Failed to load detail: {(error as Error)?.message}</div>
          ) : (
            <LoadingRow />
          )}
        </div>
      </>
    );
  }

  return (
    <>
      <PaneHead
        title={<CompanyTitle d={d} />}
        pills={
          <span className={pillClass(d.has_verdict ? d.verdict : "")}>
            {d.has_verdict ? d.verdict : "unscored"}
          </span>
        }
        onChat={meta?.chat ? () => dispatch({ type: "openChat", scope: "company", scopeId: d.company_id, title: d.name || "" }) : undefined}
        chatLabel="Chat about this company"
        onClose={onClose}
      />
      <div className="pane-body" id="pane-body">
        <FlagBar d={d} />
        <JobsSection d={d} />
        <NotesSection d={d} />
        <FactsSection d={d} />
        <VerdictSection d={d} />
        <EnrichmentSection d={d} />
        <TraceSection id={id} />
        <div className="pane-danger">
          <button
            className="btn-delete"
            title="permanently delete this company and everything attached to it"
            onClick={() => dispatch({ type: "openModal", modal: { kind: "delCompany", company: d } })}
          >
            Delete company
          </button>
        </div>
      </div>
    </>
  );
}

/* ---- header title (inline name) -------------------------------------------- */

function CompanyTitle({ d }: { d: CompanyDetail }) {
  const qc = useQueryClient();
  return (
    <InlineField
      className="ie ie-title"
      id="pane-title-input"
      placeholder="company name"
      initial={d.name || ""}
      save={async (v) => {
        await putCompanyField(d, "name", v);
        void qc.invalidateQueries({ queryKey: ["companies"] });
        void qc.invalidateQueries({ queryKey: ["jobs"] });
        void qc.invalidateQueries({ queryKey: ["company", d.company_id] });
      }}
    />
  );
}

/* ---- flag + reviewed bar --------------------------------------------------- */

function FlagBar({ d }: { d: CompanyDetail }) {
  const { toggleFlag, markReviewed } = useCompanyActions();
  return (
    <div className="flag-bar">
      <span className={"fb-state" + (d.flagged ? " is-flagged" : "")}>
        {d.flagged ? "⚑ flagged" : "not flagged"}
        <span className="small muted"> · {d.reviewed_at ? `last reviewed ${d.reviewed_at}` : "never reviewed"}</span>
      </span>
      <span className="fb-actions">
        <button
          className={"btn" + (d.flagged ? " flag-on" : "")}
          title={d.flagged ? "unflag" : "flag this company"}
          onClick={() => toggleFlag(d.company_id, !!d.flagged)}
        >
          {d.flagged ? "⚑ unflag" : "⚐ flag"}
        </button>
        <button
          className="btn btn-primary"
          title="stamp this company as reviewed now — the table sorts on it"
          onClick={() => markReviewed(d.company_id)}
        >
          Mark reviewed
        </button>
      </span>
    </div>
  );
}

/* ---- jobs list + add posting ----------------------------------------------- */

function JobsSection({ d }: { d: CompanyDetail }) {
  const dispatch = useDispatch();
  const qc = useQueryClient();
  const toast = useToast();
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [adding, setAdding] = useState(false);
  const ps = d.postings || [];

  const add = async () => {
    if (!url.trim()) {
      toast("Enter a URL first.");
      return;
    }
    setAdding(true);
    try {
      await postPosting(d.company_id, url.trim(), title.trim());
      void qc.invalidateQueries({ queryKey: ["company", d.company_id] });
      void qc.invalidateQueries({ queryKey: ["jobs"] });
      setUrl("");
      setTitle("");
      toast("link added");
    } catch (e) {
      toast(`add failed: ${(e as Error).message}`);
    } finally {
      setAdding(false);
    }
  };

  return (
    <section className="pane-section">
      <h3>
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 4V3a1 1 0 011-1h4a1 1 0 011 1v1m-9 0h11a1 1 0 011 1v7a1 1 0 01-1 1H2.5a1 1 0 01-1-1V5a1 1 0 011-1z" />
        </svg>
        Jobs
      </h3>
      <div id="postings-list">
        {ps.length === 0 ? (
          <div className="muted">No job links yet.</div>
        ) : (
          ps.map((p) => <PostingCard key={p.id} p={p} onOpen={() => dispatch({ type: "openPursuit", id: p.id })} />)
        )}
      </div>
      <div className="posting-add">
        <input className="input" placeholder="https://… job posting URL" value={url} onChange={(e) => setUrl(e.target.value)} />
        <div className="prow">
          <input className="input" placeholder="title (optional)" value={title} onChange={(e) => setTitle(e.target.value)} />
          <button className="btn btn-primary" disabled={adding} onClick={add}>
            Add
          </button>
        </div>
      </div>
    </section>
  );
}

function PostingCard({ p, onOpen }: { p: PostingSummary; onOpen: () => void }) {
  const stages = useVocab().data?.applicationStages ?? [];
  const meta = [p.location, p.source === "capture" ? "captured" : "added", (p.created_at || "").slice(0, 10)]
    .filter(Boolean)
    .join(" · ");
  const stage = p.application_status || "";
  const stageDot = stage ? vocabColorClass(stage, stages) : "";
  const desc = p.description
    ? p.description.length > 200
      ? p.description.slice(0, 200).trimEnd() + "…"
      : p.description
    : "";
  return (
    <div
      className="brain-node posting-card"
      title="open the pursuit — tracking, outreach, drafts"
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("a")) return;
        onOpen();
      }}
    >
      <div className="n">
        <a href={safeHref(p.url)} target="_blank" rel="noopener">
          {p.title || p.url} ↗
        </a>
      </div>
      {desc ? <div className="small muted" style={{ marginTop: 3 }}>{desc}</div> : null}
      {meta ? <div className="l" style={{ marginTop: 3 }}>{meta}</div> : null}
      <div className="pcard-status">
        {p.next_up ? (
          <span className="draft-badge db-next" style={{ marginLeft: 0 }} title="queued next up for outreach">
            next up
          </span>
        ) : null}
        <span className={"pill " + (stage ? stageDot || "pill-stage" : "pill-none")}>{stage || "—"}</span>
        <span className="pt-meta">{stage ? "tracked" : "not applied"}</span>
        <span className="pt-meta">
          {p.outreach_count ? `${p.outreach_count} sent · last ${p.last_outreach_at || "?"}` : "no outreach yet"}
        </span>
        <span className="pcard-open">open →</span>
      </div>
    </div>
  );
}

/* ---- notes ----------------------------------------------------------------- */

function NotesSection({ d }: { d: CompanyDetail }) {
  return (
    <section className="pane-section">
      <h3>
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 2.5h6l3 3V13a.5.5 0 01-.5.5h-8A.5.5 0 014 13V3a.5.5 0 010-.5z" />
          <path d="M9.5 2.5V6h3M6 8.5h4M6 10.5h4" />
        </svg>
        Notes
      </h3>
      <InlineField
        className="ie ie-notes"
        id="pane-notes-input"
        multiline
        rows={4}
        placeholder="—"
        initial={d.notes || ""}
        save={async (v) => {
          await putCompanyNotes(d.company_id, v);
        }}
      />
    </section>
  );
}

/* ---- company facts --------------------------------------------------------- */

function FactsSection({ d }: { d: CompanyDetail }) {
  const qc = useQueryClient();
  const dispatch = useDispatch();
  const facets = useFacets(true).data;
  const saveField = (key: string) => async (v: string) => {
    await putCompanyField(d, key, v);
    void qc.invalidateQueries({ queryKey: ["companies"] });
    void qc.invalidateQueries({ queryKey: ["jobs"] });
    void qc.invalidateQueries({ queryKey: ["company", d.company_id] });
  };
  const saveDomain = async (v: string) => {
    const fresh = await putCompanyDomain(d.company_id, v);
    void qc.invalidateQueries({ queryKey: ["companies"] });
    void qc.invalidateQueries({ queryKey: ["jobs"] });
    if (fresh.company_id !== d.company_id) dispatch({ type: "openCompany", id: fresh.company_id });
    else void qc.invalidateQueries({ queryKey: ["company", d.company_id] });
  };
  const rawRows = Object.keys(d.raw_json || {}).sort();

  return (
    <section className="pane-section">
      <h3>
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2.5" y="3" width="11" height="10" rx="1" />
          <path d="M5 6h6M5 9h4" />
        </svg>
        Company facts
      </h3>
      <div id="facts-body">
        <div className="ie-grid">
          <div className="ie-field">
            <label>
              website
              {d.domain ? (
                <>
                  {" · "}
                  <a href={`https://${d.domain}`} target="_blank" rel="noopener">open ↗</a>
                </>
              ) : null}
            </label>
            <InlineField className="ie" id="pane-domain-input" placeholder="acme.com" initial={d.domain || ""} save={saveDomain} />
          </div>
          <div className="ie-field">
            <label>vertical</label>
            <InlineField className="ie" placeholder="—" initial={d.vertical || ""} save={saveField("vertical")} />
          </div>
          <div className="prow">
            <div className="ie-field">
              <label>location</label>
              <InlineField className="ie" list="facet-locations" placeholder="—" initial={d.location || ""} save={saveField("location")} />
            </div>
            <div className="ie-field">
              <label>headcount</label>
              <InlineField className="ie" placeholder="—" initial={d.headcount ? String(d.headcount) : ""} save={saveField("headcount")} />
            </div>
          </div>
          <div className="ie-field">
            <label>stage</label>
            <InlineField className="ie" list="facet-stages" placeholder="—" initial={d.funding_stage || ""} save={saveField("funding_stage")} />
          </div>
        </div>
        <datalist id="facet-locations">
          {(facets?.locations ?? []).map((v) => (
            <option key={v} value={v} />
          ))}
        </datalist>
        <datalist id="facet-stages">
          {(facets?.funding_stages ?? []).map((v) => (
            <option key={v} value={v} />
          ))}
        </datalist>
        <dl className="kv facts-ro">
          <dt>source</dt>
          <dd className="small muted">{d.source} · {d.source_id}</dd>
          <dt>ingested</dt>
          <dd className="small muted">{d.ingested_at}</dd>
        </dl>
      </div>
      {rawRows.length > 0 ? (
        <details className="raw-json">
          <summary>
            Raw row <span className="dim">({rawRows.length} fields)</span>
          </summary>
          <table>
            <tbody>
              {rawRows.map((k) => (
                <tr key={k}>
                  <td className="k">{k}</td>
                  <td>{String((d.raw_json as Record<string, unknown>)[k])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      ) : null}
    </section>
  );
}

/* ---- verdict + manual override --------------------------------------------- */

function VerdictSection({ d }: { d: CompanyDetail }) {
  const qc = useQueryClient();
  const toast = useToast();
  const meta = useMeta().data;
  const { startRun } = useRun();
  const manual = d.model === "manual";
  const [picked, setPicked] = useState<string>(d.has_verdict && d.verdict ? d.verdict : "");
  const [reason, setReason] = useState<string>(manual ? d.reason || "" : "");
  const [saving, setSaving] = useState(false);

  const canControl = !meta || meta.control !== false;
  const showRescore = canControl && meta && meta.verdict;

  const save = async () => {
    if (!picked) {
      toast("Pick yes, maybe, or no.");
      return;
    }
    setSaving(true);
    try {
      await putVerdict(d.company_id, picked, reason.trim());
      void qc.invalidateQueries({ queryKey: ["company", d.company_id] });
      void qc.invalidateQueries({ queryKey: ["companies"] });
      void qc.invalidateQueries({ queryKey: ["stats"] });
      void qc.invalidateQueries({ queryKey: ["jobs"] });
      toast("verdict saved");
    } catch (e) {
      toast(`save failed: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="pane-section">
      <h3>
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 8l3 3 7-7" />
        </svg>
        Verdict
        {showRescore ? (
          <button
            className="h3-action"
            title="re-score just this company — replaces the current verdict, manual or not"
            onClick={() => startRun("verdict", { company_ids: [d.company_id] })}
          >
            ↻ re-score
          </button>
        ) : null}
      </h3>
      {d.has_verdict ? (
        <dl className="kv">
          <dt>verdict</dt>
          <dd>
            <span className={pillClass(d.verdict)}>{d.verdict}</span>
            {manual ? <span className="small muted"> · set by hand</span> : null}
          </dd>
          <dt>reason</dt>
          <dd>{d.reason || ""}</dd>
          <dt>model</dt>
          <dd className="small muted">{d.model || ""}</dd>
          <dt>taste version</dt>
          <dd className="small muted">
            <span className="tooltip" title={`scored ${d.scored_at} · model ${d.model}`}>{d.taste_version || ""}</span>
          </dd>
          <dt>scored at</dt>
          <dd className="small muted">{d.scored_at || ""}</dd>
        </dl>
      ) : (
        <div className="muted">
          Not yet scored. Run <code>scout verdict</code>, or set one by hand below.
        </div>
      )}
      <div className="verdict-edit" id="verdict-edit">
        <div className="ve-label muted small">{d.has_verdict ? "override verdict" : "set verdict"}</div>
        <div className="ve-pick" id="ve-pick">
          {["yes", "maybe", "no"].map((v) => (
            <button key={v} type="button" className={"ve-opt" + (picked === v ? " is-on" : "")} onClick={() => setPicked(v)}>
              {v}
            </button>
          ))}
        </div>
        <div className="prow">
          <input className="input" placeholder="reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} />
          <button className="btn btn-primary" disabled={saving} onClick={save}>
            Save
          </button>
        </div>
      </div>
    </section>
  );
}

/* ---- enrichment ------------------------------------------------------------ */

function EnrichmentSection({ d }: { d: CompanyDetail }) {
  const meta = useMeta().data;
  const { startRun } = useRun();
  const canControl = !meta || meta.control !== false;
  const es = enrichStatus(d.fetch_status);
  return (
    <section className="pane-section">
      <h3>
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="8" cy="8" r="6" />
          <path d="M2 8h12M8 2c2 2 3 4 3 6s-1 4-3 6c-2-2-3-4-3-6s1-4 3-6z" />
        </svg>
        Enrichment
        {canControl && d.domain ? (
          <button className="h3-action" title="re-fetch this company’s site now" onClick={() => startRun("enrich", { company_ids: [d.company_id] })}>
            ↻ re-enrich
          </button>
        ) : null}
      </h3>
      {d.has_enrichment ? (
        <dl className="kv">
          <dt>url</dt>
          <dd>
            {d.website_url ? (
              <a href={safeHref(d.website_url)} target="_blank" rel="noopener">
                {d.website_url} ↗
              </a>
            ) : (
              <span className="muted">—</span>
            )}
          </dd>
          <dt>status</dt>
          <dd className="small">
            <span className={"pill " + es.cls}>{es.label}</span>
            {d.fetch_error ? <span className="muted"> ({d.fetch_error})</span> : null}
          </dd>
          <dt>fetched</dt>
          <dd className="small muted">{d.fetched_at || ""}</dd>
        </dl>
      ) : (
        <div className="muted">
          No enrichment yet. Run <code>scout enrich</code>.
        </div>
      )}
    </section>
  );
}

/* ---- decision trail -------------------------------------------------------- */

function TraceSection({ id }: { id: string }) {
  const { data: events, isLoading } = useTrace(id);
  return (
    <section className="pane-section" id="trace-section">
      <h3>
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="8" cy="8" r="6" />
          <path d="M8 5v3l2 1.5" />
        </svg>
        Decision trail
      </h3>
      <div id="trace-body">
        {isLoading ? (
          <LoadingRow msg="loading trail…" />
        ) : !events || events.length === 0 ? (
          <div className="muted">
            No decision trail yet. Run <code>verdict</code> to record one — every scoring pass is captured here.
          </div>
        ) : (
          events.map((e, i) => <TraceRow key={i} e={e} />)
        )}
      </div>
    </section>
  );
}

function TraceRow({ e }: { e: TraceEvent }) {
  const sourceBits = [e.criteria_source, e.taste_version].filter(Boolean) as string[];
  if (e.run_id) sourceBits.push("run " + e.run_id.slice(0, 8));
  return (
    <div className="trail-event">
      <div className="trail-head">
        <span className={pillClass(e.verdict)}>{e.verdict}</span>
        <span className="trail-meta mono">{e.model || ""}</span>
        <span className="trail-meta trail-time">{e.scored_at || ""}</span>
      </div>
      <div className="trail-decision">
        <span className="trail-reason">{e.reason || ""}</span>
      </div>
      <div className="trail-foot muted small">criteria: {sourceBits.join(" · ") || "—"}</div>
    </div>
  );
}

function safeHref(u?: string | null): string {
  return /^https?:\/\//i.test(String(u ?? "")) ? String(u) : "#";
}
