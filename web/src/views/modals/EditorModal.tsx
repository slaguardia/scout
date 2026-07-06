// Generic text-artifact editor modal. Currently reached only from the outreach
// drafts input gate ("Write email template" → outreach-template), but written to
// the vanilla openEditor contract: loads GET /api/<kind>, saves PUT {content},
// with a version tag and (for pipeline stages) a reset. Port of openEditor/
// saveEditor + editorLabel.
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Modal, ModalNote } from "../../components/Modal";
import { useToast } from "../../components/Toast";
import { useDispatch } from "../../store/ui";
import { getJSON, putJSON } from "../../api/client";
import type { FieldData } from "../../api/settings";

const STAGE_LABELS: Record<string, string> = {
  researcher: "researcher",
  fill: "writer",
  humanizer: "humanizer",
  honesty: "honesty check",
};

function editorLabel(kind: string): string {
  if (kind === "outreach-template") return "email body";
  if (kind === "outreach-subject") return "email subject";
  if (kind === "followup-template") return "follow-up body";
  if (kind === "playbook") return "playbook";
  if (kind === "application-stages") return "application stages";
  if (kind === "outreach-statuses") return "outreach statuses";
  if (kind.startsWith("outreach-prompts/")) {
    const stage = kind.slice("outreach-prompts/".length);
    return (STAGE_LABELS[stage] || stage) + " prompt";
  }
  return kind + ".md";
}
const isStatusList = (kind: string) => kind === "application-stages" || kind === "outreach-statuses";

export function EditorModal({ editorKind }: { editorKind: string }) {
  const dispatch = useDispatch();
  const qc = useQueryClient();
  const toast = useToast();
  const taRef = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState("loading…");
  const [ver, setVer] = useState("");
  const [busy, setBusy] = useState(false);
  const close = () => dispatch({ type: "closeModal" });

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const d = await getJSON<FieldData>(`/api/${editorKind}`);
        if (!live) return;
        setText(isStatusList(editorKind) ? (d.statuses || []).join("\n") : d.content || "");
        if (d.taste_version) setVer("version " + d.taste_version);
      } catch (e) {
        if (live) setText("failed to load: " + (e as Error).message);
      }
    })();
    return () => {
      live = false;
    };
  }, [editorKind]);

  const save = async () => {
    const val = taRef.current?.value ?? "";
    const body = isStatusList(editorKind)
      ? { statuses: val.split(/\r?\n/).map((s) => s.trim()).filter(Boolean) }
      : { content: val };
    setBusy(true);
    try {
      await putJSON(`/api/${editorKind}`, body);
      void qc.invalidateQueries({ queryKey: ["settings", editorKind] });
      toast(`${editorLabel(editorKind)} saved`);
      close();
    } catch (e) {
      toast(`save failed: ${(e as Error).message}`);
      setBusy(false);
    }
  };

  return (
    <Modal onClose={close}>
      <div className="modal-head">
        <h2 id="editor-title">edit {editorLabel(editorKind)}</h2>
        <span className="ver" id="editor-ver">
          {ver}
        </span>
      </div>
      <div className="modal-body">
        <textarea id="editor-text" spellCheck={false} value={text} onChange={(e) => setText(e.target.value)} ref={taRef} />
        <ModalNote>
          Edits write the local file only — never the brain. Existing verdicts are left as-is; the new criteria apply to
          companies you score or re-score from here on.
        </ModalNote>
      </div>
      <div className="modal-foot">
        <button className="btn" id="editor-cancel" onClick={close}>
          Cancel
        </button>
        <button className="btn btn-primary" id="editor-save" disabled={busy} onClick={save}>
          Save
        </button>
      </div>
    </Modal>
  );
}
