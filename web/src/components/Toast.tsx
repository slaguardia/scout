// Toast — the vanilla `toast(msg)` as a context. A single bottom transient
// message; a failure-ish message gets the red `.err` dot (same regex as before);
// it auto-clears after 2.2s. Exposed via useToast() so any component or mutation
// can call it, matching the old global `toast()`.
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { emailBodyToHtml, emailBodyToPlain } from "../lib/emailBody";

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

/**
 * copyEmailBody — copy a draft/follow-up body so markdown links [label](url)
 * paste as real anchors in a rich mail client (a text/html flavor, matching the
 * Gmail send) and as clean plain text elsewhere — never raw markdown. Falls back
 * to a plain copy when the rich Clipboard API is unavailable or refused.
 */
export async function copyEmailBody(body: string, toast: ToastFn, okMsg = "copied"): Promise<void> {
  if (!body) {
    toast("nothing to copy");
    return;
  }
  const plain = emailBodyToPlain(body);
  const canRich =
    typeof ClipboardItem !== "undefined" && navigator.clipboard && typeof navigator.clipboard.write === "function" && window.isSecureContext;
  if (canRich) {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/plain": new Blob([plain], { type: "text/plain" }),
          "text/html": new Blob([emailBodyToHtml(body)], { type: "text/html" }),
        }),
      ]);
      toast(okMsg);
      return;
    } catch {
      // Rich write refused (permissions / unsupported type) — fall through to plain.
    }
  }
  await copyToClipboard(plain, toast, okMsg);
}
