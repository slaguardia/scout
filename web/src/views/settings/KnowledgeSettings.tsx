// Knowledge group: the four prose docs scout reasons over — company-fit
// criteria, experience, voice, logistics. Each is a DB row you type here (never
// committed); what the brain synced for the same doc is shown read-only beneath,
// so the whole bundle the LLM actually gets is visible. A typed criteria doc wins
// over the brain's brief outright; the three outreach docs are concatenated
// (typed first) with the synced pages.
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "../../components/Toast";
import { useProfile, useStats, refreshProfileRequest, useKnowledge, useField, putField } from "../../api/settings";
import { LoadedTextarea } from "./SettingsTextField";

const NEEDS: { need: string; label: string; desc: string; rows: number; required: boolean }[] = [
  {
    need: "experience",
    label: "Experience",
    desc: "Every role, project, and credential scout is allowed to claim about you. This is the honesty checker's ground truth: if it isn't written here, scout will refuse to say it in an email. Write it however you like — bullets, prose, a pasted résumé.",
    rows: 14,
    required: true,
  },
  {
    need: "voice",
    label: "Voice",
    desc: "How you write — tone, register, the words you'd never use. The humanizer and the answers drafter match it. Optional; without it emails come out plainer.",
    rows: 6,
    required: false,
  },
  {
    need: "logistics",
    label: "Logistics",
    desc: "Where you are, work authorization, comp expectations, availability, relocation, profile links. The only place scout takes biographical facts from — without it, answers leave a [fill-in] placeholder rather than guess.",
    rows: 6,
    required: false,
  },
];

const pages = (n: number) => `${n} page${n === 1 ? "" : "s"}`;

export function KnowledgeSettings() {
  return (
    <>
      <CriteriaField />
      {NEEDS.map((n) => (
        <KnowledgeField key={n.need} {...n} />
      ))}
    </>
  );
}

function CriteriaField() {
  const { data: doc, isSuccess } = useField("criteria", false);
  const { data: profile } = useProfile();
  const { data: stats } = useStats();
  const qc = useQueryClient();
  const toast = useToast();
  const [refreshing, setRefreshing] = useState(false);
  // The textarea is uncontrolled; bumping this remounts it re-seeded from the
  // query cache. Only "Copy to editor" needs that — a blur-save must not remount
  // (it would drop focus and the "saved ✓" flash).
  const [epoch, setEpoch] = useState(0);

  const active = profile?.active_source || stats?.taste_source || "";
  const provenance = active.startsWith("local:")
    ? "typed by you — wins over the brain"
    : active.startsWith("brain:")
      ? "synced from the brain"
      : "nothing on file — scoring is blocked until you type criteria here";
  const brainBody = typeof profile?.body === "string" ? profile.body : "";
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["settings", "criteria"] });
    void qc.invalidateQueries({ queryKey: ["profile"] });
    void qc.invalidateQueries({ queryKey: ["stats"] });
  };

  const refresh = async () => {
    setRefreshing(true);
    try {
      await refreshProfileRequest();
      invalidate();
      toast("company-fit brief re-distilled from the brain");
    } catch (e) {
      toast(`refresh failed: ${(e as Error).message}`);
    } finally {
      setRefreshing(false);
    }
  };

  const copyToEditor = async () => {
    // This replaces the typed criteria outright. Only warn when there is
    // something to lose — a blank editor is the intended one-click path.
    if (doc.trim() && !window.confirm("Replace your typed criteria with the brain's brief? Your current text is overwritten.")) return;
    try {
      await putField("criteria", false, brainBody);
      qc.setQueryData(["settings", "criteria"], brainBody);
      setEpoch((e) => e + 1);
      invalidate();
      toast("brain brief copied into your criteria");
    } catch (e) {
      toast(`save failed: ${(e as Error).message}`);
    }
  };

  return (
    <div className="set-field" data-kind="criteria">
      <div className="set-field-label">
        Criteria <span className="set-status">{provenance}</span>
      </div>
      <div className="set-field-desc">
        What you want in a company — dealbreakers, strong preferences, context. The verdict stage scores every company against this, and the answers drafter uses it for "why this company". Non-empty here and the brain's brief is ignored.
      </div>
      {isSuccess ? (
        <LoadedTextarea key={epoch} kind="criteria" list={false} rows={12} initial={doc} onSaved={invalidate} />
      ) : (
        <textarea className="set-textarea" rows={12} spellCheck={false} defaultValue="loading…" disabled />
      )}
      {profile?.configured ? (
        <details className="set-help set-brain">
          <summary>
            Synced from the brain — {brainBody ? "the distilled company-fit brief" : "no brief yet"}
            {profile.reachable === false ? " (brain unreachable)" : ""}
          </summary>
          <div className="set-help-body">
            <div className="set-field-row">
              <button className="btn btn-sm" id="brief-refresh" disabled={refreshing} title="re-distill from the brain" onClick={refresh}>
                {refreshing ? "Refreshing…" : "Refresh"}
              </button>
              {brainBody ? (
                <button className="btn btn-sm" title="replace your typed criteria with this brief, then edit it" onClick={copyToEditor}>
                  Copy to editor
                </button>
              ) : null}
            </div>
            <pre className="set-readonly">{brainBody || "(no brief yet — Refresh to distill from the brain)"}</pre>
          </div>
        </details>
      ) : null}
    </div>
  );
}

function KnowledgeField({ need, label, desc, rows, required }: { need: string; label: string; desc: string; rows: number; required: boolean }) {
  const { data, isSuccess } = useKnowledge(need);
  const qc = useQueryClient();
  const brain = data?.brain ?? [];
  const typed = (data?.content ?? "").trim() !== "";
  const provenance =
    typed && brain.length
      ? `typed by you + synced from the brain (${pages(brain.length)})`
      : typed
        ? "typed by you"
        : brain.length
          ? `synced from the brain (${pages(brain.length)})`
          : required
            ? "nothing on file — drafting is blocked until this has content"
            : "nothing on file (optional)";
  const kind = `knowledge/${need}`;

  return (
    <div className="set-field" data-kind={kind}>
      <div className="set-field-label">
        {label} <span className="set-status">{provenance}</span>
      </div>
      <div className="set-field-desc">{desc}</div>
      {isSuccess ? (
        <LoadedTextarea kind={kind} list={false} rows={rows} initial={data.content} onSaved={() => void qc.invalidateQueries({ queryKey: ["knowledge", need] })} />
      ) : (
        <textarea className="set-textarea" rows={rows} spellCheck={false} defaultValue="loading…" disabled />
      )}
      {brain.length ? (
        <details className="set-help set-brain">
          <summary>Synced from the brain — {pages(brain.length)}, read-only; the LLM gets these after what you typed</summary>
          <div className="set-help-body">
            {brain.map((p) => (
              <div key={p.page_id}>
                <span className="set-sub-label">{p.title || p.page_id}</span>
                <pre className="set-readonly">{p.content}</pre>
              </div>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}
