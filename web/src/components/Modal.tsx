// Modal — the `.modal-scrim > .modal` shell every dialog shares. Backdrop click
// closes (the vanilla scrims all did `if (e.target.id === scrim) close()`).
// Escape is handled globally in <App>. Each concrete modal composes its own
// .modal-head / .modal-body / .modal-foot inside.
import { useEffect, useRef, type ReactNode } from "react";

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function Modal({
  onClose,
  width,
  scrimId,
  children,
}: {
  onClose: () => void;
  width?: number;
  // The vanilla DOM ids (#add-scrim / #editor-scrim) that CSS keys layout on —
  // top-anchoring the add dialog so its tab strip doesn't re-center, and
  // widening the editor.
  scrimId?: string;
  children: ReactNode;
}) {
  const modalRef = useRef<HTMLDivElement | null>(null);
  // Captured during render, not in the effect: a dialog with an autoFocus field
  // has already moved focus inside itself by the time effects run, so reading
  // document.activeElement there returns the dialog's own input.
  const opener = useRef<HTMLElement | null>(null);
  if (opener.current === null) opener.current = document.activeElement as HTMLElement | null;

  // Move focus into the dialog on open and hand it back to whatever opened it
  // on close, so a keyboard user isn't dropped at the top of the page. Tab is
  // cycled within the dialog — without it, Tab walks the table behind the
  // scrim, which is visually covered and click-blocked.
  useEffect(() => {
    const el = modalRef.current;
    if (el && !el.contains(document.activeElement)) {
      const first = el.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? el).focus();
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !modalRef.current) return;
      const items = [...modalRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (n) => n.offsetParent !== null || n === document.activeElement,
      );
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey, true);
    // lock the page behind the scrim so it can't scroll under the dialog
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = prevOverflow;
      const back = opener.current;
      if (back && document.contains(back)) back.focus();
    };
  }, []);

  return (
    <div
      className="modal-scrim open"
      id={scrimId}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal"
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        style={width ? { width } : undefined}
      >
        {children}
      </div>
    </div>
  );
}

/** The standard info note with an (i) glyph, used inside many modals. */
export function ModalNote({ children, danger }: { children: ReactNode; danger?: boolean }) {
  return (
    <div className={"modal-note" + (danger ? " modal-note-danger" : "")}>
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
        {danger ? (
          <>
            <path d="M8 1.5 1 14h14L8 1.5z" strokeLinejoin="round" />
            <path d="M8 6.5v3.5M8 11.8v.4" strokeLinecap="round" />
          </>
        ) : (
          <>
            <circle cx="8" cy="8" r="6.5" />
            <path d="M8 5v3.5M8 11v.5" strokeLinecap="round" />
          </>
        )}
      </svg>
      <span>{children}</span>
    </div>
  );
}
