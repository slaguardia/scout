// PillSelect — a single-choice dropdown drawn in the app's own vocabulary
// instead of the browser's. The native <select> it replaces had no affordance
// (the jobs-row stage pill looked exactly like the read-only pills beside it)
// and its option popup is OS chrome: unstyled, un-colorable, and jarring against
// a dark UI.
//
// Floating behavior mirrors ActionsMenu/FilterDropdown — position:fixed portaled
// to body (a `.pane`'s transform would otherwise become the containing block, and
// the jobs table's overflow:auto would clip it), capture-phase outside-mousedown
// and Escape dismissal, re-anchor on scroll/resize — plus a flip-up when the
// trigger sits low in the viewport, which row controls need and a menu button
// doesn't.
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IconChevron, IconStageCheck } from "./icons";

export type PillOption = {
  value: string;
  label: string;
  /** Palette class for the leading dot (`sc-N`, `pill-archived`, …). */
  dot?: string;
};

type Pos = { left: number; top: number; minWidth: number; maxHeight: number };

const MENU_MIN_W = 168;

export function PillSelect({
  value,
  options,
  onChange,
  placeholder,
  valueClass,
  variant = "pill",
  title,
  ariaLabel,
}: {
  /** null = nothing chosen (the trigger shows `placeholder`, no row is current). */
  value: string | null;
  options: PillOption[];
  onChange: (v: string) => void;
  placeholder?: string;
  /** Palette class tinting the trigger (and its dot) for the current value. */
  valueClass?: string;
  variant?: "pill" | "box";
  title?: string;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<Pos | null>(null);
  const [active, setActive] = useState(0);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const curIdx = options.findIndex((o) => o.value === value);
  const cur = curIdx < 0 ? null : options[curIdx];

  const position = () => {
    const b = btnRef.current;
    if (!b) return;
    const r = b.getBoundingClientRect();
    const width = Math.max(MENU_MIN_W, Math.round(r.width));
    const left = Math.max(8, Math.min(Math.round(r.left), window.innerWidth - width - 8));
    // Flip above when the room below can't hold a usable menu — a stage pill on
    // the last row of a long table would otherwise open into a 40px sliver.
    const below = window.innerHeight - r.bottom - 8;
    const above = r.top - 8;
    const want = Math.min(options.length * 30 + 12, 300);
    const flip = below < want && above > below;
    setPos({
      left,
      top: flip ? Math.max(8, r.top - Math.min(want, above) - 4) : Math.round(r.bottom + 4),
      minWidth: width,
      maxHeight: Math.max(120, flip ? above : below),
    });
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
    return () => {
      window.removeEventListener("scroll", reanchor, true);
      window.removeEventListener("resize", reanchor);
      document.removeEventListener("mousedown", onDown, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // keep the keyboard-highlighted row visible in a menu long enough to scroll
  useEffect(() => {
    if (!open) return;
    menuRef.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  const openMenu = (from: number) => {
    setActive(from < 0 ? 0 : from);
    setOpen(true);
  };

  const pick = (v: string) => {
    setOpen(false);
    btnRef.current?.focus();
    if (v !== value) onChange(v);
  };

  // One key handler for both trigger and menu: the menu keeps DOM focus on the
  // trigger (roving `aria-activedescendant`), so arrows work either way.
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      if (!open) return;
      e.preventDefault();
      e.stopPropagation(); // peel this menu before App's global Escape
      setOpen(false);
      return;
    }
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openMenu(curIdx);
      }
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const d = e.key === "ArrowDown" ? 1 : -1;
      setActive((i) => (i + d + options.length) % options.length);
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      setActive(e.key === "Home" ? 0 : options.length - 1);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const o = options[active];
      if (o) pick(o.value);
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  };

  // ids must be unique per instance — a jobs table renders one of these per row
  const uid = useId();
  const listId = `pselect-list-${uid}`;
  const optId = (i: number) => `pselect-opt-${uid}-${i}`;
  // a list with no palette behind it (contacts, funding stages) skips the dot
  // column rather than drawing a row of identical grey dots
  const dots = options.some((o) => !!o.dot);

  return (
    <div className={"pselect" + (open ? " is-open" : "")}>
      <button
        ref={btnRef}
        type="button"
        className={
          "pselect-btn pselect-btn--" + variant + (valueClass ? " " + valueClass : "") + (cur ? "" : " is-empty")
        }
        title={title}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? optId(active) : undefined}
        onClick={() => (open ? setOpen(false) : openMenu(curIdx))}
        onKeyDown={onKeyDown}
      >
        <span className="pselect-val">{cur ? cur.label : placeholder}</span>
        <IconChevron className="pselect-chev" />
      </button>
      {open && pos
        ? createPortal(
            <div
              ref={menuRef}
              id={listId}
              className="pselect-menu"
              role="listbox"
              style={pos}
            >
              {options.map((o, i) => (
                <button
                  key={o.value}
                  id={optId(i)}
                  type="button"
                  role="option"
                  aria-selected={o.value === value}
                  className={
                    "pselect-item" +
                    (o.value === value ? " is-current" : "") +
                    (i === active ? " is-active" : "")
                  }
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pick(o.value)}
                >
                  {dots ? (
                    <span className={"pselect-dot " + (o.dot || "pselect-dot--none")} aria-hidden="true" />
                  ) : null}
                  <span className="pselect-label">{o.label}</span>
                  {o.value === value ? <IconStageCheck className="pselect-tick" /> : null}
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
