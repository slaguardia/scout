// RunController — the pipeline-run machinery behind the bottom-right progress
// drawer: startRun (enrich/verdict), uploadCSV (ingest), and the EventSource that
// streams a job's lines into the drawer, classifies them (verdict rows / headers
// / picks / warnings / errors), tallies verdicts, and — on end — refreshes the
// queries the run could have changed. Shared by the sidebar Enrich/Verdict, the
// company pane's ↻ re-score/re-enrich, the Add dialog's CSV import, and Phase 6's
// run-confirm modal. Mirrors app.ts's streamJob/startRun/uploadCSV + drawer TTL.
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "../components/Toast";

export interface DrawerLine {
  cls: string; // "ln" | "ln ln-verdict" | "ln ln-head" | "ln ln-pick" | "ln ln-warn" | "ln ln-err"
  text?: string;
  verdict?: string;
  name?: string;
  reason?: string;
}

export interface SummaryChip {
  verdict: string;
  n: number;
}

interface RunState {
  open: boolean;
  title: string;
  running: boolean;
  lines: DrawerLine[];
  summary: SummaryChip[];
}

interface RunApi {
  startRun: (stage: string, opts?: Record<string, unknown>) => Promise<void>;
  uploadCSV: (file: File) => Promise<void>;
  cancel: () => void;
  closeDrawer: () => void;
  pauseTTL: () => void;
  armTTL: () => void;
}

const StateCtx = createContext<RunState | null>(null);
const ApiCtx = createContext<RunApi | null>(null);

const DRAWER_TTL_MS = 6000;
const VERDICT_RE = /^(.+?)\s*→\s*(yes|maybe|no)\s*—\s*([\s\S]*)$/i;

function classifyLine(text: string, isErr: boolean): DrawerLine {
  let m: RegExpMatchArray | null;
  if (!isErr && (m = text.match(VERDICT_RE))) {
    const verdict = m[2].toLowerCase();
    return { cls: "ln ln-verdict", verdict, name: m[1].trim(), reason: (m[3] || "").trim() };
  }
  if (!isErr && /^(scoring|enriching|ingesting)\b/i.test(text)) return { cls: "ln ln-head", text };
  if (!isErr && /^·\s/.test(text)) return { cls: "ln ln-pick", text };
  const isWarn = !isErr && /^\s*warn:/i.test(text);
  return {
    cls: "ln" + (isErr ? " ln-err" : isWarn ? " ln-warn" : ""),
    text: isWarn ? text.replace(/^\s*warn:\s*/i, "⚠ ") : text,
  };
}

export function RunProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [state, setState] = useState<RunState>({
    open: false,
    title: "run",
    running: false,
    lines: [],
    summary: [],
  });
  const activeJob = useRef<string | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const ttlRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const clearTTL = useCallback(() => {
    clearTimeout(ttlRef.current);
    ttlRef.current = undefined;
  }, []);
  const closeDrawer = useCallback(() => {
    clearTTL();
    setState((s) => ({ ...s, open: false }));
  }, [clearTTL]);
  const armTTL = useCallback(() => {
    clearTTL();
    ttlRef.current = setTimeout(closeDrawer, DRAWER_TTL_MS);
  }, [clearTTL, closeDrawer]);

  const streamJob = useCallback(
    (stage: string, jobId: string, opts?: Record<string, unknown>) => {
      activeJob.current = jobId;
      clearTTL();
      setState({ open: true, title: stage, running: true, lines: [], summary: [] });
      void qc.invalidateQueries({ queryKey: ["runs"] });

      const tally: Record<string, number> = { yes: 0, maybe: 0, no: 0 };
      const es = new EventSource(`/api/jobs/${jobId}/stream`);
      esRef.current = es;

      es.addEventListener("line", (e: MessageEvent) => {
        const isErr = /error|failed/i.test(e.data);
        const line = classifyLine(e.data, isErr);
        if (line.verdict) tally[line.verdict] = (tally[line.verdict] || 0) + 1;
        setState((s) => ({ ...s, lines: [...s.lines, line] }));
      });

      es.addEventListener("end", (e: MessageEvent) => {
        es.close();
        esRef.current = null;
        activeJob.current = null;
        const endLine = classifyLine(`— ${e.data} —`, e.data === "failed");
        const summary: SummaryChip[] = [];
        for (const k of ["yes", "maybe", "no"]) if (tally[k]) summary.push({ verdict: k, n: tally[k] });
        setState((s) => ({ ...s, running: false, lines: [...s.lines, endLine], summary }));
        armTTL();
        toast(`${stage} ${e.data}`);
        // Refresh everything the run could have changed — React's keyed
        // reconciliation handles the "no flash" the vanilla updateCompanyRows
        // hand-optimized for.
        void qc.invalidateQueries({ queryKey: ["companies"] });
        void qc.invalidateQueries({ queryKey: ["stats"] });
        void qc.invalidateQueries({ queryKey: ["runs"] });
        void qc.invalidateQueries({ queryKey: ["jobs"] });
        const ids = opts?.company_ids;
        if (Array.isArray(ids)) for (const id of ids) void qc.invalidateQueries({ queryKey: ["company", id] });
        else void qc.invalidateQueries({ queryKey: ["company"] });
      });

      es.onerror = () => {
        es.close();
        esRef.current = null;
      };
    },
    [qc, toast, clearTTL, armTTL],
  );

  const startRun = useCallback(
    async (stage: string, opts?: Record<string, unknown>) => {
      let resp: Response;
      try {
        resp = await fetch(`/api/run/${stage}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(opts || {}),
        });
      } catch (e) {
        toast(`run failed: ${(e as Error).message}`);
        return;
      }
      if (resp.status === 409) return toast("a job is already running");
      if (resp.status === 412) return toast((await resp.text()).trim());
      if (!resp.ok) return toast(`run failed: HTTP ${resp.status}`);
      const { job_id } = (await resp.json()) as { job_id: string };
      streamJob(stage, job_id, opts);
    },
    [toast, streamJob],
  );

  const uploadCSV = useCallback(
    async (file: File) => {
      const fd = new FormData();
      fd.append("csv", file);
      let resp: Response;
      try {
        resp = await fetch("/api/ingest", { method: "POST", body: fd });
      } catch (e) {
        toast(`upload failed: ${(e as Error).message}`);
        return;
      }
      if (resp.status === 409) return toast("a job is already running");
      if (!resp.ok) return toast(`upload failed: HTTP ${resp.status}`);
      const { job_id } = (await resp.json()) as { job_id: string };
      streamJob("ingest", job_id);
    },
    [toast, streamJob],
  );

  const cancel = useCallback(() => {
    if (!activeJob.current) return;
    void fetch(`/api/jobs/${activeJob.current}/cancel`, { method: "POST" }).catch(() => {});
  }, []);

  const api = useMemo<RunApi>(
    () => ({ startRun, uploadCSV, cancel, closeDrawer, pauseTTL: clearTTL, armTTL }),
    [startRun, uploadCSV, cancel, closeDrawer, clearTTL, armTTL],
  );

  return (
    <StateCtx.Provider value={state}>
      <ApiCtx.Provider value={api}>{children}</ApiCtx.Provider>
    </StateCtx.Provider>
  );
}

export function useRun(): RunApi {
  const a = useContext(ApiCtx);
  if (!a) throw new Error("useRun outside RunProvider");
  return a;
}

export function useRunState(): RunState {
  const s = useContext(StateCtx);
  if (!s) throw new Error("useRunState outside RunProvider");
  return s;
}
