// FilterDropdown — the sidebar's `.fdrop` filter/columns menu. The menu is
// position:fixed (so the sidebar's overflow can't clip it), so we own its
// coordinates: anchor under the button, match its width, cap height to the room
// below, and re-anchor on scroll/resize. Only one is open at a time (an
// outside-mousedown closes any open one, so clicking a second button closes the
// first, then opens the second). Escape peels it first (capture + stopPropagation
// keeps App's global Escape from also firing).
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { IconChevron } from "./icons";

export function FilterDropdown({
  label,
  leadIcon,
  count,
  countMuted,
  active,
  title,
  children,
}: {
  label: string;
  leadIcon: ReactNode;
  count?: number;
  countMuted?: boolean;
  active?: boolean;
  title?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<CSSProperties>({});

  const position = useCallback(() => {
    const btn = btnRef.current;
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    setPos({
      left: Math.round(r.left),
      top: Math.round(r.bottom + 4),
      minWidth: Math.round(r.width),
      maxHeight: Math.max(160, Math.round(window.innerHeight - r.bottom - 12)),
    });
  }, []);

  useLayoutEffect(() => {
    if (open) position();
  }, [open, position]);

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
  }, [open, position]);

  const showCount = (count ?? 0) > 0;
  return (
    <div className={"fdrop" + (open ? " is-open" : "")}>
      <button
        className={"fdrop-btn" + (active ? " is-active" : "")}
        ref={btnRef}
        aria-haspopup="true"
        aria-expanded={open}
        title={title}
        onClick={() => setOpen((o) => !o)}
      >
        {leadIcon}
        <span className="fdrop-label-txt">{label}</span>
        <span
          className={"fdrop-count" + (countMuted ? " fdrop-count--muted" : "")}
          style={{ display: showCount ? "" : "none" }}
        >
          {showCount ? count : ""}
        </span>
        <IconChevron className="fdrop-chev" />
      </button>
      <div className="fdrop-menu" ref={menuRef} role="menu" style={pos}>
        {children}
      </div>
    </div>
  );
}

/** A checkbox row inside a filter menu. `dot` tints the leading swatch. */
export function FDropItem({
  checked,
  label,
  dot,
  count,
  onClick,
}: {
  checked: boolean;
  label: string;
  dot?: string;
  count?: number;
  onClick: () => void;
}) {
  return (
    <button
      className={"fdrop-item" + (checked ? " is-checked" : "")}
      role="menuitemcheckbox"
      aria-checked={checked}
      onClick={onClick}
    >
      <span className="fdrop-check" aria-hidden="true"></span>
      {dot ? <span className={"fdrop-dot " + dot}></span> : null}
      <span className="fdrop-label">{label}</span>
      <span className="fdrop-item-count">{count ? count : ""}</span>
    </button>
  );
}

export function FDropHead({ children }: { children: ReactNode }) {
  return <div className="fdrop-head">{children}</div>;
}

/** Section header with an inline all/none toggle (jobs filter panel). */
export function FDropHeadToggle({
  label,
  allOn,
  onToggle,
}: {
  label: string;
  allOn: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="fdrop-head fdrop-head--toggle">
      <span>{label}</span>
      <button type="button" className="fdrop-all" onClick={onToggle}>
        {allOn ? "none" : "all"}
      </button>
    </div>
  );
}
