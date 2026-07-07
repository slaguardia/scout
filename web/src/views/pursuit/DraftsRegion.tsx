// Outreach drafts (4c) — the draft queue: the current draft rendered by status
// (researching progress / awaiting-review editor / no-hook / failed / sent /
// superseded), a start/regenerate control with a skip-research toggle, and the
// history. Draft cards carry the pipeline trace, lint chips, honesty violations,
// an inline-save editor, and the Gmail/mark-sent send controls. Faithful port of
// draftsRegionHTML/draftCardHTML/wireOutreach + the start/cancel/delete/edit/
// send/mark handlers. SSE-free: the vanilla's researching poll is the useDrafts
// refetchInterval.
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast, copyEmailBody } from "../../components/Toast";
import { useDispatch } from "../../store/ui";
import { useGmail } from "../../api/gmail";
import { useContacts } from "../../api/contacts";
import {
  useDrafts,
  startDraftRequest,
  cancelDraft,
  deleteDraft,
  saveDraftEdit,
  sendDraftGmail,
  markDraftSent,
} from "../../api/drafts";
import { InlineField } from "../../components/InlineField";
import { IconRefresh, IconCopy, IconSend, IconStageCheck } from "../../components/icons";
import { linkify } from "../../lib/linkify";
import type { Draft, Posting, Contact } from "../../api/types";

const OUTREACH_STAGES = [
  { key: "research", label: "Research", active: "Researching the company" },
  { key: "fill", label: "Draft", active: "Writing the draft" },
  { key: "humanize", label: "Polish", active: "Polishing the voice" },
  { key: "honesty", label: "Fact-check", active: "Fact-checking against your experience" },
];

function isActiveStatus(st: string): boolean {
  return st === "researching" || st === "awaiting_review" || st === "needs_work" || st === "no_hook";
}
function draftText(d: Draft): string {
  return d.edited && d.edited.trim() ? d.edited : d.draft || "";
}
function safeHref(u?: string | null): string {
  return /^https?:\/\//i.test(String(u ?? "")) ? String(u) : "#";
}
function parseJSON<T>(s?: string | null): T | null {
  try {
    return JSON.parse(s || "null") as T;
  } catch {
    return null;
  }
}

interface GateState {
  need?: string;
  error?: string;
}

export function DraftsRegion({ posting: j }: { posting: Posting }) {
  const { data: drafts } = useDrafts(j.posting_id);
  const qc = useQueryClient();
  const toast = useToast();
  const dispatch = useDispatch();
  const [gate, setGate] = useState<GateState | null>(null);
  const [devNote, setDevNote] = useState("");
  const [skipResearch, setSkipResearch] = useState(false);
  const [busy, setBusy] = useState(false);

  const list = drafts ?? [];
  const current = list[0] || null;
  const history = list.slice(1);

  const invalidate = (contacts = false) => {
    void qc.invalidateQueries({ queryKey: ["drafts", j.posting_id] });
    void qc.invalidateQueries({ queryKey: ["jobs"] });
    if (contacts) {
      void qc.invalidateQueries({ queryKey: ["contacts", j.company_id] });
      void qc.invalidateQueries({ queryKey: ["outreach-log", j.posting_id] });
    }
  };

  const start = async (regenerate: boolean, skip: boolean) => {
    setBusy(true);
    setGate(null);
    try {
      const resp = await startDraftRequest(j.posting_id, { regenerate, skipResearch: skip });
      if (resp.status === 202) {
        const body = await resp.json().catch(() => ({}) as { degraded?: string[] });
        if (Array.isArray(body.degraded) && body.degraded.length)
          toast(`drafting without ${body.degraded.join(", ")} — quality degrades, integrity unaffected`);
        invalidate();
        return;
      }
      if (resp.status === 409) {
        invalidate();
        toast("a draft is already active");
        return;
      }
      if (resp.status === 412) {
        const body = (await resp.json().catch(() => ({}))) as GateState;
        setGate({ need: body.need, error: body.error });
        return;
      }
      if (resp.status === 503) {
        setDevNote("Outreach engine not running in this build.");
        return;
      }
      const txt = (await resp.text().catch(() => "")).trim();
      toast(`draft failed: ${txt || "HTTP " + resp.status}`);
    } catch (e) {
      toast(`draft failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const suppressStart = current && (isActiveStatus(current.status) || current.status === "failed");

  return (
    <div id="oc-drafts">
      <div className="outreach-drafts-head">Drafts</div>
      <div id="draft-current">
        {current ? (
          <DraftCard d={current} readonly={false} posting={j} onStart={start} onInvalidate={invalidate} />
        ) : null}
      </div>
      {gate ? (
        <InputGate gate={gate} onFix={() => (gate.need === "template" ? dispatch({ type: "openModal", modal: { kind: "editor", editorKind: "outreach-template" } }) : dispatch({ type: "openModal", modal: { kind: "sources" } }))} onRetry={() => start(false, skipResearch)} />
      ) : !suppressStart ? (
        <div className="draft-actions">
          <button className="btn btn-primary" id="draft-start-btn" disabled={busy} onClick={() => start(false, skipResearch)}>
            {current ? "Draft again" : "Draft outreach"}
          </button>
          <label className="draft-skip-research" title="Skip the web-research stage — draft from what's already on file instead of searching the web.">
            <input type="checkbox" id="draft-skip-research" checked={skipResearch} onChange={(e) => setSkipResearch(e.target.checked)} /> skip research
          </label>
        </div>
      ) : null}
      {devNote ? <div className="draft-note">{devNote}</div> : null}
      {history.length ? (
        <details className="draft-history">
          <summary>
            {history.length} earlier draft{history.length > 1 ? "s" : ""}
          </summary>
          <div id="draft-history-body">
            {history.map((d) => (
              <DraftCard key={d.id} d={d} readonly posting={j} onStart={start} onInvalidate={invalidate} />
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}

function InputGate({ gate, onFix, onRetry }: { gate: GateState; onFix: () => void; onRetry: () => void }) {
  const label = gate.need === "template" ? "Write email template" : "View brain knowledge";
  return (
    <div className="blocks-gate">
      <div className="draft-note">{gate.error || "Outreach isn't set up yet."}</div>
      <div className="draft-actions">
        <button className="btn btn-primary" onClick={onFix}>
          {label}
        </button>
        <button className="btn" onClick={onRetry}>
          Retry
        </button>
      </div>
    </div>
  );
}

function DraftProgress({ stage, skipResearch }: { stage?: string | null; skipResearch?: boolean }) {
  const stages = skipResearch ? OUTREACH_STAGES.filter((s) => s.key !== "research") : OUTREACH_STAGES;
  let idx = stages.findIndex((s) => s.key === stage);
  if (idx < 0) idx = 0;
  return (
    <div className="draft-progress">
      <div className="dp-track">
        {stages.map((s, i) => {
          const cls = i < idx ? "is-done" : i === idx ? "is-active" : "is-pending";
          return (
            <div key={s.key} className={"dp-seg " + cls}>
              <span className="dp-dot">{i < idx ? <IconStageCheck /> : null}</span>
              <span className="dp-name">{s.label}</span>
            </div>
          );
        })}
      </div>
      <div className="dp-status">
        <span className="spinner"></span>
        <span>{stages[idx].active}…</span>
      </div>
    </div>
  );
}

function DraftCard({
  d,
  readonly,
  posting: j,
  onStart,
  onInvalidate,
}: {
  d: Draft;
  readonly: boolean;
  posting: Posting;
  onStart: (regenerate: boolean, skip: boolean) => void;
  onInvalidate: (contacts?: boolean) => void;
}) {
  const toast = useToast();
  const { data: contacts } = useContacts(j.company_id);
  const [regenSkip, setRegenSkip] = useState(false);

  const del = async () => {
    try {
      await deleteDraft(d.id);
      onInvalidate();
      toast("draft deleted");
    } catch (e) {
      toast(`delete failed: ${(e as Error).message}`);
    }
  };
  const DelBtn = () => (
    <button className="dh-del draft-del-btn" data-did={d.id} title="delete this draft" aria-label="delete draft" onClick={del}>
      ×
    </button>
  );

  if (d.status === "researching") {
    return (
      <div className="draft-card dc-busy">
        <DraftProgress stage={d.stage} skipResearch={d.skip_research} />
        <div className="draft-note">This usually takes a minute or two — leave the panel or check back later.</div>
        <div className="draft-actions">
          <CancelButton id={d.id} onDone={() => onInvalidate()} />
        </div>
      </div>
    );
  }

  if (d.status === "failed") {
    return (
      <div className="draft-card dc-failed" data-did={d.id}>
        <div className="draft-head">
          <span className="pill pill-no">failed</span>
          <DelBtn />
        </div>
        {d.fail_reason ? <div className="draft-note">{d.fail_reason}</div> : null}
        <Violations json={d.violations} />
        <DraftTrace d={d} />
        {readonly ? null : (
          <div className="draft-actions">
            <button className="btn btn-primary draft-retry-btn" onClick={() => onStart(false, false)}>
              <IconRefresh />
              Retry
            </button>
          </div>
        )}
      </div>
    );
  }

  if (d.status === "superseded") {
    return (
      <div className="draft-card dc-sent" data-did={d.id}>
        <div className="draft-head">
          <span className="pill pill-info">replaced</span>
          <DelBtn />
        </div>
        <div className="draft-note">Replaced by a newer draft.</div>
        <div className="draft-sentbody">{linkify(draftText(d) || "(empty)")}</div>
        <DraftTrace d={d} />
      </div>
    );
  }

  if (d.status === "sent") {
    return (
      <div className="draft-card dc-sent" data-did={d.id}>
        <div className="draft-head">
          <span className="pill pill-yes">sent</span>
          {readonly ? null : <CopyButton text={() => draftText(d)} />}
          <DelBtn />
        </div>
        {d.sent_at ? <div className="draft-note">Sent {(d.sent_at || "").replace("T", " ").slice(0, 16)}</div> : null}
        <div className="draft-sentbody">{linkify(draftText(d) || "(empty)")}</div>
        <DraftTrace d={d} />
      </div>
    );
  }

  // awaiting_review or no_hook — both editable; no_hook is NEUTRAL, not an error.
  const text = draftText(d);
  const noHook = d.status === "no_hook";
  const label = noHook ? (
    <span className="pill pill-info">no honest hook</span>
  ) : (
    <span className="pill pill-maybe">awaiting review</span>
  );
  let noHookReason = "";
  if (noHook) noHookReason = parseJSON<{ reasoning?: string }>(d.hook)?.reasoning || "";
  const note = noHook ? (
    <div className="draft-note">
      No honest hook found — nothing true to say yet; scout recommends not emailing.
      {noHookReason ? " " + noHookReason : ""}
    </div>
  ) : null;

  if (readonly) {
    return (
      <div className={"draft-card " + (noHook ? "dc-nohook" : "dc-review")} data-did={d.id}>
        <div className="draft-head">
          {label}
          <DelBtn />
        </div>
        {note}
        <div className="draft-sentbody">{linkify(text || "(empty)")}</div>
        <DraftTrace d={d} />
      </div>
    );
  }

  const editable = text || noHook;
  return (
    <div className={"draft-card " + (noHook ? "dc-nohook" : "dc-review")} data-did={d.id}>
      <div className="draft-head">
        {label}
        {text ? <CopyButton text={() => draftText(d)} /> : null}
        <DelBtn />
      </div>
      {note}
      {editable ? (
        <>
          <DraftEditor d={d} onInvalidate={onInvalidate} />
          <LintChips json={d.lint} />
          <DraftSendControls draft={d} posting={j} contacts={contacts ?? []} onInvalidate={onInvalidate} />
          <div className="draft-actions">
            <button className="btn draft-regen-btn" title="discard this draft (kept in history) and re-run" onClick={() => onStart(true, regenSkip)}>
              <IconRefresh />
              Regenerate
            </button>
            <label className="draft-skip-research" title="Regenerate without web research — writes a plain intro.">
              <input type="checkbox" className="draft-regen-skip" checked={regenSkip} onChange={(e) => setRegenSkip(e.target.checked)} /> skip research
            </label>
          </div>
        </>
      ) : (
        <div className="draft-actions">
          <button className="btn draft-regen-btn" title="re-run the draft — picks up backfilled info" onClick={() => onStart(true, regenSkip)}>
            <IconRefresh />
            Regenerate
          </button>
          <label className="draft-skip-research" title="Regenerate without web research — writes a plain intro.">
            <input type="checkbox" className="draft-regen-skip" checked={regenSkip} onChange={(e) => setRegenSkip(e.target.checked)} /> skip research
          </label>
        </div>
      )}
      <DraftTrace d={d} />
    </div>
  );
}

function DraftEditor({ d, onInvalidate }: { d: Draft; onInvalidate: (c?: boolean) => void }) {
  const qc = useQueryClient();
  return (
    <InlineField
      className="draft-textarea"
      id={`draft-edit-${d.id}`}
      multiline
      initial={draftText(d)}
      save={async (v) => {
        await saveDraftEdit(d.id, v);
        // re-lint comes back on the saved draft; refresh the query so chips update
        void qc.invalidateQueries({ queryKey: ["drafts"] });
        void onInvalidate;
      }}
    />
  );
}

function CancelButton({ id, onDone }: { id: string; onDone: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <button
      className="btn draft-cancel-btn"
      data-did={id}
      disabled={busy}
      title="stop this draft and free up the panel to start over"
      onClick={async () => {
        setBusy(true);
        try {
          await cancelDraft(id);
          onDone();
          toast("draft cancelled");
        } catch (e) {
          toast(`cancel failed: ${(e as Error).message}`);
          setBusy(false);
        }
      }}
    >
      {busy ? "Cancelling…" : "Cancel"}
    </button>
  );
}

function CopyButton({ text }: { text: () => string }) {
  const toast = useToast();
  return (
    <button className="dh-copy draft-copy-btn" title="copy the email to the clipboard" aria-label="copy email" onClick={() => copyEmailBody(text(), toast, "email copied")}>
      <IconCopy />
    </button>
  );
}

function DraftSendControls({
  draft,
  posting: j,
  contacts,
  onInvalidate,
}: {
  draft: Draft;
  posting: Posting;
  contacts: Contact[];
  onInvalidate: (c?: boolean) => void;
}) {
  const gmail = useGmail().data;
  const toast = useToast();
  const emailable = contacts.filter((c) => c.email);
  const [recipient, setRecipient] = useState(emailable[0]?.id || "");
  const [sending, setSending] = useState(false);
  const connected = !!gmail?.connected;

  const sendGmail = async () => {
    setSending(true);
    try {
      const body = await sendDraftGmail(draft.id, recipient);
      toast(body.to ? `sent via Gmail to ${body.to}` : "sent via Gmail");
      onInvalidate(true);
    } catch (e) {
      toast(`send failed: ${(e as Error).message}`);
      setSending(false);
    }
  };
  const markSent = async () => {
    try {
      await markDraftSent(draft.id, recipient);
      toast(recipient ? "marked sent — follow-up armed" : "marked sent");
      onInvalidate(!!recipient);
    } catch (e) {
      toast(`failed: ${(e as Error).message}`);
    }
  };

  return (
    <>
      <div className="draft-gmail-row">
        {emailable.length ? (
          <select className="input draft-recipient" title="recipient" aria-label="recipient" value={recipient} onChange={(e) => setRecipient(e.target.value)}>
            {emailable.map((c) => (
              <option key={c.id} value={c.id}>
                {(c.name || c.email) + (c.email ? ` <${c.email}>` : "")}
              </option>
            ))}
          </select>
        ) : null}
        {connected && emailable.length ? (
          <button className="btn btn-primary draft-gmail-btn" disabled={sending} title="send this email from your Gmail now, log it, and arm a follow-up" onClick={sendGmail}>
            <IconSend />
            {sending ? "Sending…" : "Send via Gmail"}
          </button>
        ) : null}
        <button className="btn draft-sent-btn" title={emailable.length ? "I sent this myself — log it to the chosen contact and arm a follow-up" : "mark this draft sent (no contact to log against)"} onClick={markSent}>
          <IconSend />
          Mark sent{emailable.length ? " (log it)" : ""}
        </button>
      </div>
      {emailable.length ? null : <div className="draft-note dim">Add a contact with an email to log the send + arm a follow-up.</div>}
    </>
  );
}

/* ---- trace / lint / violations --------------------------------------------- */

interface ResearchHook {
  type?: string;
  source_url?: string;
  quote?: string;
  context?: string;
}
interface ResearchData {
  what_they_do?: string;
  customer?: string;
  stage?: string;
  headcount_est?: string;
  role?: { title?: string; jd_quotes?: string[] };
  hooks?: ResearchHook[];
  disambiguation?: string;
  confidence?: string;
}
interface HookData {
  decision?: string;
  closer_mode?: string;
  reasoning?: string;
  hook?: { quote?: string; thread?: string; source_url?: string };
}

function DraftTrace({ d }: { d: Draft }) {
  const research = parseJSON<ResearchData>(d.research);
  const hook = parseJSON<HookData>(d.hook);
  const line = (k: string, v?: string | null) =>
    v ? (
      <div className="tr-line">
        <span className="tr-key">{k}:</span> {v}
      </div>
    ) : null;

  return (
    <>
      {research && typeof research === "object" ? (
        <details className="draft-trace">
          <summary>
            research — {(research.hooks?.length ?? 0)} hook candidate{research.hooks?.length === 1 ? "" : "s"}
          </summary>
          <div className="trace-body">
            {line("what they do", research.what_they_do)}
            {line("customer", research.customer)}
            {line("stage / headcount", [research.stage, research.headcount_est].filter(Boolean).join(" / "))}
            {line("role", research.role?.title)}
            {(research.role?.jd_quotes || []).map((q, i) => (
              <span key={i} className="tr-quote">
                {q}
              </span>
            ))}
            {(research.hooks || []).map((h, i) => (
              <div key={i} className="tr-line">
                <span className="tr-key">{h.type || "hook"}</span>
                {safeHref(h.source_url) !== "#" ? (
                  <>
                    {" · "}
                    <a href={safeHref(h.source_url)} target="_blank" rel="noopener">source</a>
                  </>
                ) : null}
                <span className="tr-quote">{h.quote || ""}</span>
                {h.context ? <span className="tr-key">{h.context}</span> : null}
              </div>
            ))}
            {line("disambiguation", research.disambiguation)}
            {line("confidence", research.confidence)}
          </div>
        </details>
      ) : null}
      {hook && typeof hook === "object" && hook.decision ? (
        <details className="draft-trace">
          <summary>
            hook — {hook.decision}
            {hook.closer_mode ? " · " + hook.closer_mode : ""}
          </summary>
          <div className="trace-body">
            {hook.hook?.quote ? <span className="tr-quote">{hook.hook.quote}</span> : null}
            {hook.hook?.thread ? (
              <div className="tr-line">
                <span className="tr-key">thread:</span> {hook.hook.thread}
              </div>
            ) : null}
            {safeHref(hook.hook?.source_url) !== "#" ? (
              <div className="tr-line">
                <a href={safeHref(hook.hook?.source_url)} target="_blank" rel="noopener">source</a>
              </div>
            ) : null}
            {hook.reasoning ? (
              <div className="tr-line">
                <span className="tr-key">reasoning:</span> {hook.reasoning}
              </div>
            ) : null}
          </div>
        </details>
      ) : null}
    </>
  );
}

function LintChips({ json }: { json?: string | null }) {
  const findings = parseJSON<{ code?: string; message?: string }[]>(json) || [];
  if (!findings.length) return null;
  return (
    <div className="lint-chips">
      {findings.map((f, i) => (
        <span key={i} className="lint-chip" title={f.message || ""}>
          <code>{f.code || ""}</code>
          {f.message || ""}
        </span>
      ))}
    </div>
  );
}

function Violations({ json }: { json?: string | null }) {
  const vios = parseJSON<{ claim?: string; message?: string; why?: string }[]>(json) || [];
  if (!vios.length) return null;
  return (
    <ul className="violation-list">
      {vios.map((v, i) => (
        <li key={i}>
          {v.claim || v.message || String(v)}
          {v.why ? <span className="vl-why"> — {v.why}</span> : null}
        </li>
      ))}
    </ul>
  );
}
