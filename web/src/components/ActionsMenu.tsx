// A small anchored actions menu (a labeled trigger + a fixed-position popup of
// action rows). Shares FilterDropdown's floating behavior — fixed positioning so
// an overflow:auto ancestor can't clip it, capture-phase mousedown + Escape
// dismissal (Escape stopPropagation so it peels before App's global handler),
// and re-anchoring on scroll/resize. Items are plain `menuitem` rows (not the
// checkbox rows FilterDropdown uses), so it's a sibling, not a reuse.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { IconChevron } from "./icons";

type Pos = { left: number; top: number; minWidth: number; maxHeight: number };
const MENU_MIN_W = 184;

export function ActionsMenu({
  label,
  className,
  children,
}: {
  label: ReactNode;
  className?: string;
  /** Render-prop so items can close the menu after firing. */
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<Pos | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const position = () => {
    const b = btnRef.current;
    if (!b) return;
    const r = b.getBoundingClientRect();
    // Right-align the menu to the trigger (the trigger sits at the card's right
    // edge); clamp into the viewport.
    const left = Math.max(8, Math.min(r.right - MENU_MIN_W, window.innerWidth - MENU_MIN_W - 8));
    setPos({ left, top: r.bottom + 4, minWidth: MENU_MIN_W, maxHeight: Math.max(160, window.innerHeight - r.bottom - 8) });
  };

  useLayoutEffect(() => {
    if (open) position();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const reanchor = () => position();
    window.addEventListener("scroll", reanchor, true);
    window.addEventListener("resize", reanchor);
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!btnRef.current?.contains(t) && !menuRef.current?.contains(t)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown, true);
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener("keydown", onEsc, true);
    return () => {
      window.removeEventListener("scroll", reanchor, true);
      window.removeEventListener("resize", reanchor);
      document.removeEventListener("mousedown", onDown, true);
      document.removeEventListener("keydown", onEsc, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <div className={"amenu" + (open ? " is-open" : "")}>
      <button
        ref={btnRef}
        type="button"
        className={"amenu-btn" + (className ? " " + className : "")}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {label}
        <IconChevron className="amenu-chev" />
      </button>
      {open && pos
        ? createPortal(
            // Portal to body: the pursuit pane sets transform: translateX(0) when
            // open, which would make it the containing block for our position:fixed
            // menu (mis-positioning + clipping it). Rendering into body escapes that.
            <div ref={menuRef} className="amenu-menu" role="menu" style={pos}>
              {children(() => setOpen(false))}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

export function ActionItem({
  label,
  onSelect,
  close,
  muted,
  title,
}: {
  label: ReactNode;
  onSelect: () => void;
  close: () => void;
  muted?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      className={"amenu-item" + (muted ? " is-muted" : "")}
      title={title}
      onClick={() => {
        close();
        onSelect();
      }}
    >
      {label}
    </button>
  );
}

export function ActionSep() {
  return <div className="amenu-sep" role="separator" />;
}
