// Run-confirm modal (Enrich / Verdict) — carries the "only blanks" scope toggle
// and the parallel-workers input, and warns before a verdict run when companies
// are still un-enriched (they'd be silently skipped). Port of openRunConfirm +
// the run-go handler.
import { useState } from "react";
import { Modal } from "../../components/Modal";
import { useDispatch } from "../../store/ui";
import { useRun } from "../../store/run";
import { useStats } from "../../api/settings";

const DESCS: Record<string, string> = {
  enrich: "Fetches and summarizes each company's pages, filling its enrichment row.",
  verdict: "Scores every company against your criteria — one LLM call each. Only companies with a successful enrichment are scored.",
};

export function RunConfirmModal({ stage }: { stage: "enrich" | "verdict" }) {
  const dispatch = useDispatch();
  const { startRun } = useRun();
  const { data: stats } = useStats();
  const [blanks, setBlanks] = useState(false);
  const [workers, setWorkers] = useState(stage === "verdict" ? 10 : 8);
  const close = () => dispatch({ type: "closeModal" });

  const s = (stats ?? {}) as { total_companies?: number; enriched_ok?: number };
  const unenriched = Math.max(0, (s.total_companies || 0) - (s.enriched_ok || 0));
  const showWarn = stage === "verdict" && unenriched > 0;

  const go = () => {
    close();
    const opts: Record<string, unknown> = {};
    if (blanks) opts.only_blanks = true;
    if (workers > 0) opts.workers = workers;
    void startRun(stage, opts);
  };

  return (
    <Modal width={440} onClose={close}>
      <div className="modal-head">
        <h2 id="run-title">Run {stage}</h2>
      </div>
      <div className="modal-body">
        <p id="run-desc" style={{ margin: "0 0 6px", fontSize: 13, color: "var(--fg-mute)", lineHeight: 1.5 }}>
          {DESCS[stage]}
        </p>
        <a className="help-link" id="run-learn" style={{ marginBottom: 12 }} onClick={() => { close(); dispatch({ type: "setView", view: "docs" }); }}>
          Learn more →
        </a>
        {showWarn ? (
          <div className="run-warn" id="run-warn">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 2L1.5 13.5h13z" />
              <path d="M8 6.5v3.5M8 12v.3" />
            </svg>
            <span id="run-warn-text">
              {unenriched} {unenriched === 1 ? "company isn't" : "companies aren't"} enriched yet — verdict will skip{" "}
              {unenriched === 1 ? "it" : "them"}. Run Enrich first to include {unenriched === 1 ? "it" : "them"}.
            </span>
          </div>
        ) : null}
        <label className="enrich-row" id="run-blanks-row">
          <input type="checkbox" id="run-only-blanks" checked={blanks} onChange={(e) => setBlanks(e.target.checked)} />
          <span className="cbox" aria-hidden="true">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3.5 8.5l3 3 6-7" />
            </svg>
          </span>
          <span>only blanks — only touch companies never seen before (no enrichment row / no verdict yet)</span>
        </label>
        <div className="run-workers">
          <label htmlFor="run-workers-input">Parallel workers</label>
          <input className="input" type="number" id="run-workers-input" min={1} max={24} step={1} inputMode="numeric" value={workers} onChange={(e) => setWorkers(Math.max(1, Math.min(24, parseInt(e.target.value, 10) || 1)))} />
          <span className="run-workers-hint">faster, up to your API rate limit</span>
        </div>
      </div>
      <div className="modal-foot">
        <button className="btn" id="run-cancel" onClick={close}>
          Cancel
        </button>
        <button className="btn btn-primary" id="run-go" onClick={go}>
          Run
        </button>
      </div>
    </Modal>
  );
}
