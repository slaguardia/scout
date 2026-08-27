// Run-confirm modal (Enrich / Verdict). For verdict it shows the whole funnel
// before you spend anything — a run drops companies at three gates (the
// pre-filter, the enrichment requirement, and the skip-already-scored rule) and
// all three used to be silent, so a 300-company list reported "scoring 41" with
// no account of the other 259. The scope picker turns the criteria→verdict loop
// into a real loop: "stale" re-judges exactly what a criteria edit invalidated.
import { useState } from "react";
import { Modal, ModalNote } from "../../components/Modal";
import { useDispatch } from "../../store/ui";
import { useRun } from "../../store/run";
import { useVerdictPlan, type VerdictPlan } from "../../api/queries";

const DESCS: Record<string, string> = {
  enrich: "Fetches and summarizes each company's pages, filling its enrichment row.",
  verdict:
    "Scores companies against your criteria — one LLM call each. Only companies that pass your pre-filter and have a readable website are scored.",
};

type Scope = "new" | "stale" | "all";

/** Human labels for the pre-filter's internal drop reasons. */
const DROP_LABEL: Record<string, string> = {
  location: "location",
  headcount_min: "too small",
  headcount_max: "too big",
  vertical_excluded: "excluded vertical",
  vertical_not_allowed: "vertical not allowed",
  funding_stage: "funding stage",
};

export function RunConfirmModal({ stage }: { stage: "enrich" | "verdict" }) {
  const dispatch = useDispatch();
  const { startRun } = useRun();
  const isVerdict = stage === "verdict";
  const { data: plan, isLoading: planLoading } = useVerdictPlan(isVerdict);
  const [blanks, setBlanks] = useState(false);
  const [scope, setScope] = useState<Scope>("new");
  const [includeManual, setIncludeManual] = useState(false);
  const [workers, setWorkers] = useState(isVerdict ? 10 : 8);
  const close = () => dispatch({ type: "closeModal" });


  const go = () => {
    close();
    const opts: Record<string, unknown> = {};
    if (isVerdict) {
      if (scope === "new") opts.only_blanks = true;
      else if (scope === "stale") opts.redo_stale = true;
      else opts.force = true;
      if (scope !== "new" && includeManual) opts.include_manual = true;
    } else if (blanks) {
      opts.only_blanks = true;
    }
    if (workers > 0) opts.workers = workers;
    void startRun(stage, opts);
  };

  return (
    <Modal width={isVerdict ? 500 : 440} onClose={close}>
      <div className="modal-head">
        <h2 id="run-title">Run {stage}</h2>
      </div>
      <div className="modal-body">
        <p id="run-desc" style={{ margin: "0 0 6px", fontSize: 13, color: "var(--fg-mute)", lineHeight: 1.5 }}>
          {DESCS[stage]}
        </p>
        <a className="help-link" id="run-learn" style={{ marginBottom: 12 }} onClick={() => { close(); dispatch({ type: "gotoDocs", section: stage }); }}>
          Learn more →
        </a>

        {isVerdict ? (
          <VerdictScope
            plan={plan ?? null}
            loading={planLoading}
            scope={scope}
            setScope={setScope}
            includeManual={includeManual}
            setIncludeManual={setIncludeManual}
            onOpenPrefilter={() => {
              close();
              dispatch({ type: "setView", view: "settings" });
              dispatch({ type: "setSettingsGroup", group: "job-hunting" });
            }}
          />
        ) : (
          <label className="enrich-row" id="run-blanks-row">
              <input type="checkbox" id="run-only-blanks" checked={blanks} onChange={(e) => setBlanks(e.target.checked)} />
              <span className="cbox" aria-hidden="true">
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3.5 8.5l3 3 6-7" />
                </svg>
              </span>
            <span>only blanks — only touch companies never seen before (no enrichment row yet)</span>
          </label>
        )}

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

/** How many LLM calls each scope would actually cost, given the funnel. */
function scopeCost(p: VerdictPlan | null, scope: Scope, includeManual: boolean): number | null {
  if (!p) return null;
  // Only companies that clear the pre-filter AND have a readable site are ever
  // scored, so the scope counts (which are over the whole verdicts table) are
  // capped by the eligible set.
  const eligible = p.enriched;
  const unscored = Math.max(eligible - p.scored, 0);
  const manual = includeManual ? p.manual : 0;
  if (scope === "new") return unscored;
  if (scope === "stale") return Math.min(unscored + p.stale + manual, eligible);
  return Math.min(unscored + p.stale + p.current + manual, eligible);
}

function VerdictScope({
  plan,
  loading,
  scope,
  setScope,
  includeManual,
  setIncludeManual,
  onOpenPrefilter,
}: {
  plan: VerdictPlan | null;
  loading: boolean;
  scope: Scope;
  setScope: (s: Scope) => void;
  includeManual: boolean;
  setIncludeManual: (b: boolean) => void;
  onOpenPrefilter: () => void;
}) {
  if (loading) return <div className="run-funnel dim">counting…</div>;
  if (!plan) return null;

  const gated = plan.total - plan.passes_prefilter;
  const dropList = Object.entries(plan.dropped_by)
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${DROP_LABEL[k] || k}: ${n}`)
    .join(", ");

  const opts: [Scope, string, string][] = [
    ["new", "New companies only", "never scored"],
    ["stale", "Stale + new", "re-judge what your criteria edit invalidated"],
    ["all", "Everything", "re-score every eligible company"],
  ];

  return (
    <>
      <div className="run-funnel">
        <div className="rf-row">
          <span className="rf-n">{plan.total}</span>
          <span className="rf-label">companies</span>
        </div>
        {gated > 0 ? (
          <div className="rf-row rf-drop">
            <span className="rf-n">−{gated}</span>
            <span className="rf-label">
              gated by the pre-filter{dropList ? ` (${dropList})` : ""} —{" "}
              <button type="button" className="linkbtn" onClick={onOpenPrefilter}>
                change it
              </button>{" "}
              to score more
            </span>
          </div>
        ) : null}
        {plan.unenriched > 0 ? (
          <div className="rf-row rf-drop">
            <span className="rf-n">−{plan.unenriched}</span>
            <span className="rf-label">no readable website yet — run Enrich to include them</span>
          </div>
        ) : null}
        <div className="rf-row rf-total">
          <span className="rf-n">{plan.enriched}</span>
          <span className="rf-label">eligible to score</span>
        </div>
      </div>

      <div className="run-scope" role="radiogroup" aria-label="what to score">
        {opts.map(([id, label, hint]) => {
          const n = scopeCost(plan, id, includeManual);
          return (
            <label key={id} className={"rs-opt" + (scope === id ? " is-on" : "")}>
              <input type="radio" name="run-scope" checked={scope === id} onChange={() => setScope(id)} />
              <span className="rs-main">
                <span className="rs-label">{label}</span>
                <span className="rs-hint">{hint}</span>
              </span>
              <span className="rs-n">{n === null ? "" : `${n} call${n === 1 ? "" : "s"}`}</span>
            </label>
          );
        })}
      </div>

      {scope !== "new" && plan.manual > 0 ? (
        <label className="enrich-row">
          <input type="checkbox" checked={includeManual} onChange={(e) => setIncludeManual(e.target.checked)} />
          <span className="cbox" aria-hidden="true">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3.5 8.5l3 3 6-7" />
            </svg>
          </span>
          <span>
            also re-judge my {plan.manual} hand-set verdict{plan.manual === 1 ? "" : "s"} — they're kept by default
          </span>
        </label>
      ) : null}

      {scope === "all" ? (
        <ModalNote danger>
          Re-scores verdicts that already match your current criteria. That's{" "}
          {scopeCost(plan, "all", includeManual)} LLM calls, and the results replace what's on file.
        </ModalNote>
      ) : null}
    </>
  );
}
