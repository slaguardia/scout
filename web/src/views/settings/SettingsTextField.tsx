// A labeled text artifact that loads GET /api/<kind> and saves PUT on blur (when
// changed), flashing "saved ✓". list=true treats it as a one-label-per-line
// status vocabulary. Faithful port of settingsTextFieldHTML + loadTextField +
// saveTextField.
import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "../../components/Toast";
import { useField, putField } from "../../api/settings";

export function SettingsTextField({
  kind,
  label,
  desc,
  rows,
  list = false,
}: {
  kind: string;
  label: string;
  desc: string;
  rows: number;
  list?: boolean;
}) {
  const { data, isSuccess } = useField(kind, list);

  return (
    <div className="set-field" data-kind={kind} data-list={list ? 1 : 0}>
      <div className="set-field-label">{label}</div>
      <div className="set-field-desc">{desc}</div>
      {isSuccess ? (
        <LoadedTextarea kind={kind} list={list} rows={rows} initial={data} />
      ) : (
        <textarea className="set-textarea" rows={rows} spellCheck={false} defaultValue="loading…" disabled />
      )}
    </div>
  );
}

function LoadedTextarea({ kind, list, rows, initial }: { kind: string; list: boolean; rows: number; initial: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const orig = useRef(initial);
  const [saved, setSaved] = useState(false);
  const flash = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const onBlur = async (e: React.FocusEvent<HTMLTextAreaElement>) => {
    const val = e.currentTarget.value;
    if (val === orig.current) return;
    try {
      await putField(kind, list, val);
      orig.current = val;
      setSaved(true);
      clearTimeout(flash.current);
      flash.current = setTimeout(() => setSaved(false), 1500);
      void qc.invalidateQueries({ queryKey: ["settings", kind] });
      if (kind === "followup-template") void qc.invalidateQueries({ queryKey: ["vocab"] });
      if (list) {
        void qc.invalidateQueries({ queryKey: ["vocab"] });
        void qc.invalidateQueries({ queryKey: ["jobs"] });
      }
    } catch (err) {
      toast(`save failed: ${(err as Error).message}`);
    }
  };

  return (
    <>
      <textarea className="set-textarea" rows={rows} spellCheck={false} defaultValue={initial} onBlur={onBlur} />
      <div className="set-field-foot">
        <span className={"set-saved" + (saved ? " show" : "")}>saved ✓</span>
      </div>
    </>
  );
}
