// SlidePane — a right-side slide-in (`.pane` + its `.scrim`), always mounted so
// the CSS enter/leave transition plays on the `.open` toggle. Used by the company
// detail pane, the pursuit pane, and the chat pane. z-index is passed in so two
// panes can stack (raisePane's ordering); the scrim click closes.
import { useEffect, useRef, type ReactNode } from "react";
import { IconClose } from "./icons";

export function SlidePane({
  open,
  onClose,
  variant,
  paneId,
  scrimId,
  paneZ,
  scrimZ,
  ariaLabel,
  children,
}: {
  open: boolean;
  onClose: () => void;
  variant?: string; // "pane-pursuit" | "pane-chat"
  paneId?: string; // the vanilla DOM ids (#pane / #pursuit-pane): CSS keys z-index on them
  scrimId?: string;
  paneZ?: number;
  scrimZ?: number;
  ariaLabel?: string;
  children: ReactNode;
}) {
  const paneRef = useRef<HTMLElement | null>(null);
  const opener = useRef<HTMLElement | null>(null);

  // Move focus into the pane when it opens and hand it back to the row that
  // opened it on close. Without this, Tab from an open pane walks the table
  // behind the scrim (visually covered and click-blocked), and closing drops
  // focus to <body> so the next Tab restarts at the top of the page.
  useEffect(() => {
    if (open) {
      opener.current = document.activeElement as HTMLElement | null;
      paneRef.current?.focus();
      return;
    }
    const back = opener.current;
    opener.current = null;
    if (back && document.contains(back)) back.focus();
  }, [open]);

  return (
    <>
      <div
        className={"scrim" + (open ? " open" : "")}
        id={scrimId}
        style={scrimZ ? { zIndex: scrimZ } : undefined}
        onClick={onClose}
      />
      <aside
        className={"pane" + (variant ? " " + variant : "") + (open ? " open" : "")}
        id={paneId}
        ref={paneRef}
        role="dialog"
        aria-modal={open ? true : undefined}
        tabIndex={-1}
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
