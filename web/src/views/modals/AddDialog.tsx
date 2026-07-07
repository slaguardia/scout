// The Add dialog — company or job, link-first; every other field optional. With
// "fill in the blanks" ticked the agent/ATS pass fills the rest (POST /api/capture);
// unticked writes plainly (POST /api/companies | /api/postings). Company mode has
// a CSV bulk-import sub-tab. Port of openAdd/setAddKind/applyAddLayout/updateAddNote/
// submitAdd + the vertical chips.
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Modal } from "../../components/Modal";
import { useToast } from "../../components/Toast";
import { useUI, useDispatch } from "../../store/ui";
import { useMeta } from "../../api/queries";
import { useRun } from "../../store/run";
import { useCompanies } from "../../api/companies";
import { useFacets } from "../../api/runs";
import { postJSON, ApiError } from "../../api/client";

type Kind = "company" | "job";
type Mode = "single" | "csv";

const httpsURL = (u: string) => (/^https?:\/\//i.test(u) ? u : "https://" + u);

export function AddDialog() {
  const ui = useUI();
  const dispatch = useDispatch();
  const qc = useQueryClient();
  const toast = useToast();
  const meta = useMeta().data;
  const { uploadCSV, startRun } = useRun();
  const { data: companies } = useCompanies();

  const [kind, setKind] = useState<Kind>(ui.view === "jobs" ? "job" : "company");
  const [mode, setMode] = useState<Mode>("single");
  const { data: facets } = useFacets(true);

  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [headcount, setHeadcount] = useState("");
  const [fundingStage, setFundingStage] = useState("");
  const [title, setTitle] = useState("");
  const [jobCompany, setJobCompany] = useState("");
  const [vertFilter, setVertFilter] = useState("");
  const [vertSel, setVertSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [enrich, setEnrich] = useState(!!meta?.capture);

  const captureOn = !!meta?.capture && enrich;
  const csv = kind === "company" && mode === "csv";
  const close = () => dispatch({ type: "closeModal" });

  const note = captureOn
    ? kind === "company"
      ? "scout fetches the page and fills the blank fields — your values win. The page text also seeds enrichment, so the next Verdict can score it. Pages behind a login wall (LinkedIn) usually can't be fetched."
      : "scout fetches the posting and fills in the title, location and description — your values win. The job attaches to its company, adding it to the list first if needed. Pages behind a login wall (LinkedIn) usually can't be fetched."
    : kind === "company"
      ? "Stored as source manual. Run Enrich then Verdict to score it. A website already in the list is rejected — manual adds never overwrite an existing company."
      : "Stored as-is, no fetch. The job attaches to the typed company, or to the link's own domain when the posting lives on the company's site — for an ATS link (greenhouse, lever, …), type the company.";

  const verticals = facets?.verticals ?? [];
  const shownVerticals = useMemo(() => {
    const q = vertFilter.trim().toLowerCase();
    return verticals.filter((v) => !q || v.toLowerCase().includes(q));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verticals, vertFilter]);

  const submit = async () => {
    if (csv) return;
    if (!url.trim()) {
      toast(kind === "company" ? "Website is required." : "Posting URL is required.");
      return;
    }
    setBusy(true);
    let endpoint: string;
    let body: Record<string, unknown>;
    if (captureOn) {
      endpoint = "/api/capture";
      body = {
        url: httpsURL(url.trim()),
        kind: kind === "company" ? "company_page" : "job_posting",
        fields:
          kind === "company"
            ? { name: name.trim(), location: location.trim(), headcount: headcount.trim(), funding_stage: fundingStage, vertical: [...vertSel].join(", ") }
            : { name: jobCompany.trim(), title: title.trim() },
      };
    } else if (kind === "company") {
      endpoint = "/api/companies";
      body = { website: url.trim(), name: name.trim(), vertical: [...vertSel].join(", "), location: location.trim(), headcount: headcount.trim(), funding_stage: fundingStage };
    } else {
      endpoint = "/api/postings";
      body = { url: httpsURL(url.trim()), title: title.trim(), company: jobCompany.trim() };
    }

    try {
      const res = await postJSON<Record<string, unknown>>(endpoint, body);
      setBusy(false);
      // The agent pass can decline to write (unidentifiable) — reported honestly.
      if (captureOn && !res.company_id) {
        toast((res.note as string) || "couldn't classify that page");
        return;
      }
      close();
      void qc.invalidateQueries({ queryKey: ["companies"] });
      void qc.invalidateQueries({ queryKey: ["stats"] });
      void qc.invalidateQueries({ queryKey: ["jobs"] });
      if (kind === "job") {
        const posting = res.posting as { title?: string } | undefined;
        const what = posting?.title || "job link";
        toast(`tracking: ${what} @ ${res.company_name}${res.posting_updated ? " (refreshed)" : ""}`);
        dispatch({ type: "setView", view: "jobs" });
      } else if (captureOn) {
        toast((res.note as string) || (res.company_created ? `company added: ${res.company_name}` : `${res.company_name} is already in the list`));
        dispatch({ type: "openCompany", id: res.company_id as string });
        const canScore = (!meta || meta.control !== false) && meta?.verdict;
        if (res.fetch_status === "ok" && canScore) startRun("verdict", { company_ids: [res.company_id] });
      } else {
        toast("company added");
      }
    } catch (e) {
      setBusy(false);
      const err = e as ApiError;
      if (err.status === 409) {
        toast(err.message || "That company is already in the list.");
        return;
      }
      toast(`add failed: ${err.message}`);
    }
  };

  const onFile = (f: File | undefined) => {
    if (f) {
      close();
      void uploadCSV(f);
    }
  };

  return (
    <Modal width={560} onClose={close}>
      <div className="modal-head">
        <h2>Add</h2>
        <div className="kind-toggle" id="add-kind">
          <button className={"v-chip" + (kind === "company" ? " is-on" : "")} onClick={() => { setKind("company"); setMode("single"); }}>
            company
          </button>
          <button className={"v-chip" + (kind === "job" ? " is-on" : "")} onClick={() => { setKind("job"); setMode("single"); }}>
            job
          </button>
        </div>
      </div>
      <div className="modal-body">
        {kind === "company" ? (
          <div className="subtabs" id="add-cmode">
            <button type="button" className={"subtab" + (mode === "single" ? " is-on" : "")} onClick={() => setMode("single")}>
              One company
            </button>
            <button type="button" className={"subtab" + (mode === "csv" ? " is-on" : "")} onClick={() => setMode("csv")}>
              Bulk add
            </button>
          </div>
        ) : null}

        {!csv ? (
          <div className="form-field" id="add-url-field">
            <label htmlFor="add-url" id="add-url-label">
              {kind === "company" ? "Website" : "Posting URL"}
              <span className="req">*</span>
            </label>
            <input className="input" id="add-url" placeholder={kind === "company" ? "acme.com" : "https://… the job posting"} autoComplete="off" spellCheck={false} value={url} onChange={(e) => setUrl(e.target.value)} autoFocus />
          </div>
        ) : null}

        {kind === "job" ? (
          <div id="add-job-fields">
            <div className="form-grid">
              <div className="form-field">
                <label htmlFor="add-title">Title</label>
                <input className="input" id="add-title" placeholder="e.g. Solutions Engineer" autoComplete="off" value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
              <div className="form-field">
                <label htmlFor="add-job-company">Company</label>
                <input className="input" id="add-job-company" list="add-company-names" placeholder="from the link if blank" autoComplete="off" value={jobCompany} onChange={(e) => setJobCompany(e.target.value)} />
                <datalist id="add-company-names">
                  {(companies ?? []).map((r) => (
                    <option key={r.company_id} value={r.name} />
                  ))}
                </datalist>
              </div>
            </div>
          </div>
        ) : null}

        {kind === "company" && !csv ? (
          <div id="add-company-fields">
            <div className="form-field">
              <label htmlFor="add-name">Name</label>
              <input className="input" id="add-name" placeholder="defaults to the domain" autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="form-grid">
              <div className="form-field">
                <label htmlFor="add-location">Location</label>
                <input className="input" id="add-location" autoComplete="off" value={location} onChange={(e) => setLocation(e.target.value)} />
              </div>
              <div className="form-field">
                <label htmlFor="add-headcount">Headcount</label>
                <input className="input" id="add-headcount" inputMode="numeric" placeholder="e.g. 250" autoComplete="off" value={headcount} onChange={(e) => setHeadcount(e.target.value.replace(/[^0-9]/g, ""))} />
              </div>
              <div className="form-field">
                <label htmlFor="add-stage">Funding stage</label>
                <select className="input" id="add-stage" value={fundingStage} onChange={(e) => setFundingStage(e.target.value)}>
                  <option value="">—</option>
                  {(facets?.funding_stages ?? []).map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="form-field">
              <label>
                Verticals{" "}
                <span id="add-vertical-count" style={{ color: "var(--fg-dim)", fontWeight: 400 }}>
                  {vertSel.size ? `· ${vertSel.size} selected` : ""}
                </span>
              </label>
              <input className="input" id="add-vertical-filter" placeholder="filter verticals…" autoComplete="off" value={vertFilter} onChange={(e) => setVertFilter(e.target.value)} />
              <div className="vchips" id="add-vertical-chips">
                {shownVerticals.length === 0 ? (
                  <div className="none">{verticals.length ? "no match" : "no verticals in the set yet"}</div>
                ) : (
                  shownVerticals.map((v) => (
                    <button
                      key={v}
                      type="button"
                      className={"vchip" + (vertSel.has(v) ? " sel" : "")}
                      onClick={() =>
                        setVertSel((s) => {
                          const n = new Set(s);
                          if (n.has(v)) n.delete(v);
                          else n.add(v);
                          return n;
                        })
                      }
                    >
                      {v}
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        ) : null}

        {csv ? (
          <div id="add-csv-panel">
            <label className="add-csv-drop" id="add-csv" title="upload a CSV export (e.g. Crunchbase) to create many companies at once">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 10V2m0 0L5 5m3-3l3 3M3 13h10" />
              </svg>
              <span className="add-csv-main">Choose a CSV file to import</span>
              <span className="add-csv-hint">a CSV export (e.g. Crunchbase) — columns map to company fields; new companies are created</span>
              <input type="file" accept=".csv,text/csv" style={{ display: "none" }} onChange={(e) => onFile(e.target.files?.[0])} />
            </label>
          </div>
        ) : null}

        {!csv ? (
          <>
            <label className={"enrich-row" + (!meta?.capture ? " disabled" : "")} id="add-enrich-row" title={meta?.capture ? "" : "set ANTHROPIC_API_KEY in the server env to enable"}>
              <input type="checkbox" id="add-enrich" checked={enrich} disabled={!meta?.capture} onChange={(e) => setEnrich(e.target.checked)} />
              <span className="cbox" aria-hidden="true">
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3.5 8.5l3 3 6-7" />
                </svg>
              </span>
              <span>fill in the blanks — ATS links (ashby/greenhouse/lever) read the platform's API directly, anything else gets one cheap agent pass</span>
            </label>
            <div className="modal-note" id="add-note-row">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="8" cy="8" r="6.5" />
                <path d="M8 5v3.5M8 11v.5" strokeLinecap="round" />
              </svg>
              <span id="add-note">{note}</span>
            </div>
            <a className="help-link" id="add-learn" onClick={() => { close(); dispatch({ type: "gotoDocs", section: "ingest" }); }}>
              How adding works →
            </a>
          </>
        ) : null}
      </div>
      <div className="modal-foot">
        <button className="btn" id="add-cancel" onClick={close}>
          Cancel
        </button>
        {!csv ? (
          <button className="btn btn-primary" id="add-save" disabled={busy} onClick={submit}>
            {busy ? (captureOn ? "reading page…" : "…") : kind === "company" ? "Add company" : "Add job"}
          </button>
        ) : null}
      </div>
    </Modal>
  );
}
