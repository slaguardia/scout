// InlineField — the seamless auto-save input/textarea used across the panes
// (company facts, notes, posting fields, answers). Uncontrolled so the caret
// survives a background refetch; saves on blur / Enter (Cmd/Ctrl+Enter for
// multiline), reverts on Escape, and flashes is-saving/is-saved/is-error — the
// exact wireInlineField behaviour.
import { useEffect, useRef, useState } from "react";
import { useToast } from "./Toast";

type Status = "" | "saving" | "saved" | "error";

export function InlineField({
  initial,
  save,
  multiline = false,
  className = "ie",
  placeholder,
  rows,
  id,
  list,
  onInput,
}: {
  initial: string;
  save: (v: string) => Promise<void>;
  multiline?: boolean;
  className?: string;
  placeholder?: string;
  rows?: number;
  id?: string;
  list?: string;
  onInput?: (v: string) => void;
}) {
  const ref = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const committed = useRef(initial);
  const [status, setStatus] = useState<Status>("");
  const toast = useToast();
  const flash = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Sync a background change (a refetch after a save elsewhere) into the field,
  // but never clobber what the user is mid-edit.
  useEffect(() => {
    committed.current = initial;
    const el = ref.current;
    if (el && document.activeElement !== el) el.value = initial;
  }, [initial]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const el = ref.current;
    if (!el) return;
    if (e.key === "Escape") {
      e.preventDefault();
      el.value = committed.current;
      el.blur();
    } else if (e.key === "Enter" && (!multiline || e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      el.blur();
    }
  };

  const onBlur = async () => {
    const el = ref.current;
    if (!el) return;
    const val = el.value.trim();
    if (val === committed.current.trim()) {
      el.value = committed.current;
      return;
    }
    setStatus("saving");
    try {
      await save(val);
      committed.current = el.value;
      setStatus("saved");
      clearTimeout(flash.current);
      flash.current = setTimeout(() => setStatus(""), 1200);
    } catch (err) {
      el.value = committed.current;
      setStatus("error");
      clearTimeout(flash.current);
      flash.current = setTimeout(() => setStatus(""), 1600);
      toast(`save failed: ${(err as Error).message}`);
    }
  };

  const cls =
    className +
    (status === "saving" ? " is-saving" : status === "saved" ? " is-saved" : status === "error" ? " is-error" : "");

  const handleInput = onInput ? (e: React.FormEvent<HTMLTextAreaElement | HTMLInputElement>) => onInput(e.currentTarget.value) : undefined;

  if (multiline) {
    return (
      <textarea
        ref={ref as React.RefObject<HTMLTextAreaElement>}
        id={id}
        className={cls}
        rows={rows}
        placeholder={placeholder}
        defaultValue={initial}
        onKeyDown={onKeyDown}
        onBlur={onBlur}
        onInput={handleInput}
      />
    );
  }
  return (
    <input
      ref={ref as React.RefObject<HTMLInputElement>}
      id={id}
      className={cls}
      list={list}
      placeholder={placeholder}
      defaultValue={initial}
      onKeyDown={onKeyDown}
      onBlur={onBlur}
      onInput={handleInput}
    />
  );
}
