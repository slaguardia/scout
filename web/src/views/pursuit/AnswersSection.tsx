// Application answers (4d) — the essay questions detected on the posting's
// application form, each with an inline-save drafted answer, a status pill, a
// char counter, a per-question Generate/Regenerate, copy, and remove. Footer
// offers bulk "Draft all blank" + Re-detect. Faithful port of
// renderAnswersSection/answerCardHTML/wireAnswers + the start/redetect/regenerate/
// remove handlers; the generating poll is the useAnswers refetchInterval.
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast, copyToClipboard } from "../../components/Toast";
import { useDispatch } from "../../store/ui";
import { InlineField } from "../../components/InlineField";
import { IconCopy } from "../../components/icons";
import {
  useAnswers,
  startAnswersRequest,
  redetectRequest,
  saveAnswerEdit,
  regenerateAnswerRequest,
  removeAnswer,
} from "../../api/answers";
import type { Answer, Posting } from "../../api/types";

function answerText(a: Answer): string {
  return a.edited && a.edited.trim() ? a.edited : a.answer || "";
}
function answersHeader(status: string, n: number): string {
  switch (status) {
    case "":
      return "Not detected yet";
    case "ok":
      return `${n} question${n === 1 ? "" : "s"} found`;
    case "none":
      return "No essay questions on this form";
    case "unsupported":
      return "Couldn't read this form — apply on the site";
    case "unreachable":
      return "Couldn't reach the application form — try re-detecting";
    default:
      return "Couldn't read this form";
  }
}
function trimReason(s?: string | null): string {
  const str = String(s || "");
  return str.length > 160 ? str.slice(0, 160) + "…" : str;
}

interface GateState {
  error?: string;
}

export function AnswersSection({ posting: j }: { posting: Posting }) {
  const { data } = useAnswers(j.posting_id);
  const qc = useQueryClient();
  const toast = useToast();
  const dispatch = useDispatch();
  const [detecting, setDetecting] = useState(false);
  const [gate, setGate] = useState<GateState | null>(null);
  const [devNote, setDevNote] = useState("");
  const [busy, setBusy] = useState(false);

  const answers = data?.answers ?? [];
  const status = data?.questions_status ?? "";
  const generating = answers.some((a) => a.status === "generating");

  const invalidate = () => void qc.invalidateQueries({ queryKey: ["answers", j.posting_id] });

  const start = async () => {
    setBusy(true);
    setGate(null);
    try {
      const resp = await startAnswersRequest(j.posting_id);
      if (resp.status === 202) {
        invalidate();
        return;
      }
      if (resp.status === 412) {
        const body = (await resp.json().catch(() => ({}))) as GateState;
        setGate({ error: body.error });
        return;
      }
      if (resp.status === 503) {
        setDevNote("Answer generation isn't running in this build.");
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

  const redetect = async () => {
    setDetecting(true);
    try {
      const resp = await redetectRequest(j.posting_id);
      if (!resp.ok) {
        const txt = (await resp.text().catch(() => "")).trim();
        toast(`detect failed: ${txt || "HTTP " + resp.status}`);
      }
    } catch (e) {
      toast(`detect failed: ${(e as Error).message}`);
    } finally {
      setDetecting(false);
      invalidate();
    }
  };

  const startDis = generating || detecting || busy;
  const redetectBtn = (txt: string) => (
    <button className="btn" id="answers-redetect-btn" disabled={detecting} onClick={redetect}>
      {detecting ? "Detecting…" : txt}
    </button>
  );

  let footer: React.ReactNode;
  if (gate) {
    footer = (
      <div className="blocks-gate">
        <div className="draft-note">{gate.error || "Drafting answers needs an experience page in your brain."}</div>
        <div className="answers-actions">
          <button className="btn btn-primary" onClick={() => dispatch({ type: "openModal", modal: { kind: "sources" } })}>
            View brain knowledge
          </button>
          <button className="btn" onClick={start}>
            Retry
          </button>
        </div>
      </div>
    );
  } else if (status === "ok" && answers.length) {
    const anyBlank = answers.some((a) => !answerText(a) && a.status !== "generating");
    footer = (
      <div className="answers-actions">
        {anyBlank ? (
          <button className="btn" id="answers-start-btn" disabled={startDis} onClick={start}>
            {generating ? "Drafting…" : "Draft all blank"}
          </button>
        ) : null}
        {redetectBtn("Re-detect")}
      </div>
    );
  } else if (status === "" || status === "unreachable") {
    footer = (
      <div className="answers-actions">
        <button className="btn btn-primary" id="answers-start-btn" disabled={startDis} onClick={start}>
          {generating ? "Drafting…" : "Draft answers"}
        </button>
        {redetectBtn("Re-detect questions")}
      </div>
    );
  } else {
    footer = <div className="answers-actions">{redetectBtn("Re-detect questions")}</div>;
  }

  return (
    <>
      <div className="answers-meta">{answersHeader(status, answers.length)}</div>
      {answers.length ? (
        <div className="answers-list">
          {answers.map((a) => (
            <AnswerCard key={a.id} a={a} onInvalidate={invalidate} setGate={setGate} setDevNote={setDevNote} />
          ))}
        </div>
      ) : null}
      {footer}
      {devNote ? <div className="draft-note">{devNote}</div> : null}
    </>
  );
}

function AnswerCard({
  a,
  onInvalidate,
  setGate,
  setDevNote,
}: {
  a: Answer;
  onInvalidate: () => void;
  setGate: (g: GateState) => void;
  setDevNote: (s: string) => void;
}) {
  const toast = useToast();
  const [count, setCount] = useState(answerText(a).length);
  const liveRef = useState(() => ({ v: answerText(a) }))[0];
  const busy = a.status === "generating";
  const text = answerText(a);
  const edited = a.edited && a.edited.trim();
  const drafted = !!text;
  const over = !!a.max_length && count > a.max_length;

  const regen = async () => {
    try {
      const resp = await regenerateAnswerRequest(a.id);
      if (resp.status === 503) {
        setDevNote("Answer generation isn't running in this build.");
        return;
      }
      if (resp.status === 412) {
        const body = (await resp.json().catch(() => ({}))) as GateState;
        setGate({ error: body.error });
        return;
      }
      if (!resp.ok) {
        const txt = (await resp.text().catch(() => "")).trim();
        toast(`regenerate failed: ${txt || "HTTP " + resp.status}`);
        return;
      }
      onInvalidate();
    } catch (e) {
      toast(`regenerate failed: ${(e as Error).message}`);
    }
  };

  const remove = async () => {
    try {
      await removeAnswer(a.id);
      onInvalidate();
    } catch (e) {
      toast(`remove failed: ${(e as Error).message}`);
    }
  };

  const statusPill = () => {
    switch (a.status) {
      case "ready":
        return <span className="pill pill-yes">ready</span>;
      case "needs_review":
        return <span className="pill pill-maybe">needs review</span>;
      case "failed":
        return <span className="pill pill-no">failed</span>;
      case "generating":
        return <span className="pill pill-info">drafting…</span>;
      default:
        return <span className="pill pill-info">not drafted</span>;
    }
  };

  return (
    <div className={"answer-card ac-" + a.status} data-aid={a.id}>
      <div className="answer-prompt">{a.prompt}</div>
      {busy ? (
        <div className="answer-busy">
          <span className="spinner"></span>
          <span>drafting…</span>
        </div>
      ) : (
        <InlineField
          className="ie answer-textarea"
          id={`answer-edit-${a.id}`}
          multiline
          rows={5}
          placeholder="Generate an answer to this question, or write your own."
          initial={text}
          onInput={(v) => {
            liveRef.v = v;
            setCount(v.length);
          }}
          save={async (v) => {
            await saveAnswerEdit(a.id, v);
          }}
        />
      )}
      <div className="answer-foot">
        {statusPill()}
        {edited ? (
          <span className="answer-edited" title="your edit wins over the drafted answer">
            edited
          </span>
        ) : null}
        {busy ? null : (
          <span className={"answer-count" + (over ? " over" : "")}>{a.max_length ? `${count} / ${a.max_length}` : `${count} chars`}</span>
        )}
        {busy ? null : (
          <button className={"btn " + (drafted ? "" : "btn-primary ") + "answer-regen-btn"} title={drafted ? "re-draft this answer (discards the current text)" : "draft an answer to just this question"} onClick={regen}>
            {drafted ? "Regenerate" : "Generate"}
          </button>
        )}
        {busy || !drafted ? null : (
          <button className="answer-copy-btn dh-copy" title="copy this answer to the clipboard" aria-label="copy answer" onClick={() => copyToClipboard(liveRef.v, toast, "answer copied")}>
            <IconCopy />
          </button>
        )}
        {busy ? null : (
          <button className="answer-remove-btn" title="remove this question" aria-label="remove question" onClick={remove}>
            ×
          </button>
        )}
      </div>
      {a.status === "needs_review" ? (
        <div className="answer-note answer-review">Flagged by the honesty check — confirm it doesn't overstate your experience before sending.</div>
      ) : null}
      {a.status === "failed" && a.fail_reason ? <div className="answer-note answer-fail">{trimReason(a.fail_reason)}</div> : null}
    </div>
  );
}
