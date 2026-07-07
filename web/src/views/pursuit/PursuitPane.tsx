// Pursuit pane (#pursuit-pane) — the jobs-view role panel: role header +
// editable details, company (with relink), the pipeline (stage/status/next-up),
// notes, the outreach section (contacts + drafts), and — for a not-yet-applied
// posting — the application answers. Faithful port of renderPursuit + roleEditHTML
// + wirePipeline, with the sub-panels split out (4b/4c/4d).
import { useState } from "react";
import { SlidePane, PaneHead } from "../../components/Pane";
import { InlineField } from "../../components/InlineField";
import { LoadingRow, pillClass } from "../../components/Pill";
import { useUI, useDispatch } from "../../store/ui";
import { useJobs } from "../../api/jobs";
import { useVocab, vocabColorClass, useMeta } from "../../api/queries";
import { useJobTracking } from "../../hooks/useJobTracking";
import { usePostingActions } from "../../hooks/usePostingActions";
import { IconNextUp } from "../../components/icons";
import { ContactsManager } from "./ContactsManager";
import { DraftsRegion } from "./DraftsRegion";
import { AnswersSection } from "./AnswersSection";
import type { Posting } from "../../api/types";

export function PursuitPane() {
  const ui = useUI();
  const dispatch = useDispatch();
  const id = ui.openPursuitId;
  const onTop = ui.topPane === "pursuit";
  return (
    <SlidePane
      open={id !== null}
      onClose={() => dispatch({ type: "closePursuit" })}
      variant="pane-pursuit"
      paneId="pursuit-pane"
      scrimId="pursuit-scrim"
      paneZ={onTop ? 55 : 53}
      scrimZ={onTop ? 54 : 52}
    >
      {id !== null ? <PursuitBody key={id} id={id} /> : <PaneHead title="—" onClose={() => dispatch({ type: "closePursuit" })} />}
    </SlidePane>
  );
}

function options(current: string, vocab: string[]): [string, string][] {
  const opts: [string, string][] = [["", "none"]];
  for (const s of vocab) opts.push([s, s]);
  if (current && !vocab.includes(current)) opts.push([current, current + " (removed)"]);
  return opts;
}

function PursuitBody({ id }: { id: string }) {
  const { data: jobs, isLoading } = useJobs();
  const dispatch = useDispatch();
  const vocab = useVocab().data;
  const meta = useMeta().data;
  const { toggleNextUp, saveTracking } = useJobTracking();
  const actions = usePostingActions();

  const j = (jobs ?? []).find((x) => x.posting_id === id);
  const onClose = () => dispatch({ type: "closePursuit" });

  if (!j) {
    return (
      <>
        <PaneHead title={isLoading ? "loading…" : "—"} onClose={onClose} />
        <div className="pane-body" id="pursuit-body">{isLoading ? <LoadingRow /> : <div className="muted">posting not found — refresh</div>}</div>
      </>
    );
  }

  const stages = vocab?.applicationStages ?? [];
  const statuses = vocab?.outreachStatuses ?? [];
  const stage = j.application_status || "";
  const showAnswers = !stage; // answers only for not-yet-applied postings

  return (
    <>
      <PaneHead
        title={
          <InlineField className="ie ie-title" id="pursuit-title-input" placeholder="role name" initial={j.title || ""} save={actions.saveDetail(j, "title")} />
        }
        pills={<span className={"pill " + (stage ? vocabColorClass(stage, stages) || "pill-stage" : "pill-none")}>{stage || "—"}</span>}
        onChat={meta?.chat ? () => dispatch({ type: "openChat", scope: "posting", scopeId: j.posting_id, title: j.title || j.company }) : undefined}
        chatLabel="Chat about this role"
        onClose={onClose}
      />
      <div className="pane-body" id="pursuit-body">
        <section className="pane-section role-head">
          <div id="role-body">
            <RoleBody j={j} actions={actions} />
          </div>
        </section>

        <section className="pane-section">
          <h3>
            Company
            <button
              type="button"
              className="h3-action"
              title="move this job to a different company"
              onClick={() => dispatch({ type: "openModal", modal: { kind: "relink", posting: j } })}
            >
              change
            </button>
          </h3>
          <div className="company-row">
            <button
              type="button"
              className="role-company role-company-link"
              title="open the company panel"
              onClick={() => dispatch({ type: "openCompany", id: j.company_id })}
            >
              {j.company} ↗
            </button>
            {j.verdict ? (
              <span className="role-verdict">
                <span className="role-verdict-label">fit</span>
                <span className={pillClass(j.verdict)} title="scout's company-fit verdict">
                  {j.verdict}
                </span>
              </span>
            ) : null}
          </div>
        </section>

        <section className="pane-section">
          <h3>Pipeline</h3>
          <div className="pipeline-grid">
            <div className="pipeline-row">
              <span className="pl-label">application</span>
              <select className="input pl-appstatus" title="application stage" value={stage} onChange={(e) => saveTracking(j, { application_status: e.target.value })}>
                {options(stage, stages).map(([v, label]) => (
                  <option key={v} value={v}>
                    {label}
                  </option>
                ))}
              </select>
              {stage && j.application_status_at ? <span className="pl-at" title="stage last changed">since {j.application_status_at.slice(0, 10)}</span> : null}
            </div>
            <div className="pipeline-row">
              <span className="pl-label">outreach</span>
              <select className="input pl-ostatus" title="outreach reply status — separate from the application stage" value={j.outreach_status || ""} onChange={(e) => saveTracking(j, { outreach_status: e.target.value })}>
                {options(j.outreach_status || "", statuses).map(([v, label]) => (
                  <option key={v} value={v}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="pipeline-row">
              <span className="pl-label">queue</span>
              <button
                className={"pt-chip pt-nextup" + (j.next_up ? " is-on" : "")}
                title={j.next_up ? "unmark — it also clears itself when you log a +1 outreach" : "mark this pursuit next up for outreach"}
                onClick={() => toggleNextUp(j)}
              >
                <IconNextUp />
                next up
              </button>
            </div>
          </div>
        </section>

        <section className="pane-section">
          <h3>Notes</h3>
          <InlineField className="ie ie-notes" id="pursuit-notes-input" multiline rows={4} placeholder="—" initial={j.notes || ""} save={actions.saveNotes(j)} />
        </section>

        <section className="pane-section">
          <h3>Outreach</h3>
          <div id="outreach-section">
            <ContactsManager posting={j} />
            <DraftsRegion posting={j} />
          </div>
        </section>

        {showAnswers ? (
          <section className="pane-section">
            <h3>Application</h3>
            <div id="answers-section">
              <AnswersSection posting={j} />
            </div>
          </section>
        ) : null}

        <div className="pane-danger">
          <button className="btn-delete" title="permanently delete this job posting and everything attached to it" onClick={() => dispatch({ type: "openModal", modal: { kind: "delJob", posting: j } })}>
            Delete job
          </button>
        </div>
      </div>
    </>
  );
}

function RoleBody({ j, actions }: { j: Posting; actions: ReturnType<typeof usePostingActions> }) {
  return (
    <>
      <div className="role-url ie-field">
        <div className="role-url-head">
          <label>link</label>
          <a className="role-url-open" href={safeHref(j.url)} target="_blank" rel="noopener" title="open the posting">↗</a>
          <ReenrichButton j={j} onReenrich={() => actions.reenrich(j)} />
        </div>
        <InlineField className="ie" id="pursuit-url-input" placeholder="https://…" initial={j.url || ""} save={actions.saveURL(j)} />
      </div>
      <div className="ie-grid">
        <div className="prow">
          <div className="ie-field">
            <label>location</label>
            <InlineField className="ie" placeholder="—" initial={j.location || ""} save={actions.saveDetail(j, "location")} />
          </div>
          <div className="ie-field">
            <label>comp range</label>
            <InlineField className="ie" placeholder="—" initial={j.comp_range || ""} save={actions.saveDetail(j, "comp_range")} />
          </div>
        </div>
        <div className="prow">
          <div className="ie-field">
            <label>employment</label>
            <InlineField className="ie" placeholder="—" initial={j.employment_type || ""} save={actions.saveDetail(j, "employment_type")} />
          </div>
          <div className="ie-field">
            <label>workplace</label>
            <InlineField className="ie" placeholder="—" initial={j.workplace_type || ""} save={actions.saveDetail(j, "workplace_type")} />
          </div>
        </div>
        <div className="ie-field">
          <label>department</label>
          <InlineField className="ie" placeholder="—" initial={j.department || ""} save={actions.saveDetail(j, "department")} />
        </div>
        <div className="ie-field">
          <label>description</label>
          <InlineField className="ie" multiline rows={6} placeholder="—" initial={j.description || ""} save={actions.saveDetail(j, "description")} />
        </div>
      </div>
      {j.posted_at ? <div className="role-posted">posted {j.posted_at}</div> : null}
    </>
  );
}

function ReenrichButton({ onReenrich }: { j: Posting; onReenrich: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className="role-reenrich h3-action"
      disabled={busy}
      title="re-fetch this posting's details from the link — fills in blanks, no re-typing"
      onClick={async () => {
        setBusy(true);
        await onReenrich();
        setBusy(false);
      }}
    >
      {busy ? "re-enriching…" : "↻ re-enrich"}
    </button>
  );
}

function safeHref(u?: string | null): string {
  return /^https?:\/\//i.test(String(u ?? "")) ? String(u) : "#";
}
