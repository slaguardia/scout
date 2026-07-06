// SlidePane — a right-side slide-in (`.pane` + its `.scrim`), always mounted so
// the CSS enter/leave transition plays on the `.open` toggle. Used by the company
// detail pane, the pursuit pane, and the chat pane. z-index is passed in so two
// panes can stack (raisePane's ordering); the scrim click closes.
import type { ReactNode } from "react";
import { IconClose } from "./icons";

export function SlidePane({
  open,
  onClose,
  variant,
  paneZ,
  scrimZ,
  ariaLabel,
  children,
}: {
  open: boolean;
  onClose: () => void;
  variant?: string; // "pane-pursuit" | "pane-chat"
  paneZ?: number;
  scrimZ?: number;
  ariaLabel?: string;
  children: ReactNode;
}) {
  return (
    <>
      <div
        className={"scrim" + (open ? " open" : "")}
        style={scrimZ ? { zIndex: scrimZ } : undefined}
        onClick={onClose}
      />
      <aside
        className={"pane" + (variant ? " " + variant : "") + (open ? " open" : "")}
        style={paneZ ? { zIndex: paneZ } : undefined}
        aria-hidden={!open}
        aria-label={ariaLabel}
      >
        {children}
      </aside>
    </>
  );
}

/** The pane header row: title, optional pills slot, optional chat button, close. */
export function PaneHead({
  title,
  pills,
  onChat,
  chatLabel,
  onClose,
}: {
  title: ReactNode;
  pills?: ReactNode;
  onChat?: () => void;
  chatLabel?: string;
  onClose: () => void;
}) {
  return (
    <div className="pane-head">
      <h2>{title}</h2>
      <span className="pills-inline">{pills}</span>
      {onChat ? (
        <button className="pane-chat-btn" title={chatLabel} aria-label="chat" onClick={onChat}>
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2.5 3.5h11a1 1 0 011 1v6a1 1 0 01-1 1H6l-3 2.5V11.5H2.5a1 1 0 01-1-1v-6a1 1 0 011-1z" />
          </svg>
        </button>
      ) : null}
      <button className="close-btn" aria-label="close" onClick={onClose}>
        <IconClose />
      </button>
    </div>
  );
}
