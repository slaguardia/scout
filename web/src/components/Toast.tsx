// Toast — the vanilla `toast(msg)` as a context. A single bottom transient
// message; a failure-ish message gets the red `.err` dot (same regex as before);
// it auto-clears after 2.2s. Exposed via useToast() so any component or mutation
// can call it, matching the old global `toast()`.
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

const ERR_RE = /\b(fail(ed)?|error|disabled|already running)\b/i;

type ToastFn = (msg: string) => void;
const ToastCtx = createContext<ToastFn | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState("");
  const [show, setShow] = useState(false);
  const [err, setErr] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const toast = useCallback<ToastFn>((m) => {
    setMsg(m);
    setErr(ERR_RE.test(m));
    setShow(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setShow(false), 2200);
  }, []);

  return (
    <ToastCtx.Provider value={toast}>
      {children}
      <div id="toast" className={"toast" + (show ? " show" : "") + (err ? " err" : "")}>
        {msg}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast(): ToastFn {
  const t = useContext(ToastCtx);
  if (!t) throw new Error("useToast outside ToastProvider");
  return t;
}

/**
 * copyToClipboard — async Clipboard API with an execCommand fallback for
 * insecure contexts; toasts the outcome. Returns a helper bound to a toast fn.
 */
export async function copyToClipboard(text: string, toast: ToastFn, okMsg = "copied"): Promise<void> {
  if (!text) {
    toast("nothing to copy");
    return;
  }
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    toast(okMsg);
  } catch (e) {
    toast(`copy failed: ${(e as Error).message}`);
  }
}
