// Modal — the `.modal-scrim > .modal` shell every dialog shares. Backdrop click
// closes (the vanilla scrims all did `if (e.target.id === scrim) close()`).
// Escape is handled globally in <App>. Each concrete modal composes its own
// .modal-head / .modal-body / .modal-foot inside.
import type { ReactNode } from "react";

export function Modal({
  onClose,
  width,
  children,
}: {
  onClose: () => void;
  width?: number;
  children: ReactNode;
}) {
  return (
    <div
      className="modal-scrim open"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal" style={width ? { width } : undefined}>
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
