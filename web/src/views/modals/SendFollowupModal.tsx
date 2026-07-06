// Send-follow-up modal — an editable preview of the rendered follow-up, sent as a
// reply on the contact's Gmail thread. Only reachable from the "Send follow-up"
// button (rendered only when Gmail is connected + threaded).
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Modal } from "../../components/Modal";
import { useToast } from "../../components/Toast";
import { useDispatch } from "../../store/ui";
import { useJobs } from "../../api/jobs";
import { useVocab } from "../../api/queries";
import { sendFollowup } from "../../api/contacts";
import { renderFollowupTemplate } from "../../lib/followup";
import type { Contact, OutreachLogEntry } from "../../api/types";

export function SendFollowupModal({
  postingId,
  contact,
  latest,
}: {
  postingId: string;
  contact: Contact;
  latest: OutreachLogEntry | null;
}) {
  const dispatch = useDispatch();
  const qc = useQueryClient();
  const toast = useToast();
  const posting = (useJobs().data ?? []).find((j) => j.posting_id === postingId);
  const template = useVocab().data?.followupTemplate || "";
  const [body, setBody] = useState(() =>
    posting ? renderFollowupTemplate(template, posting, contact, latest) : "",
  );
  const [busy, setBusy] = useState(false);
  const close = () => dispatch({ type: "closeModal" });

  const send = async () => {
    if (!body.trim()) {
      toast("nothing to send");
      return;
    }
    setBusy(true);
    try {
      await sendFollowup(postingId, contact.id, body);
      close();
      toast("follow-up sent");
      void qc.invalidateQueries({ queryKey: ["jobs"] });
      void qc.invalidateQueries({ queryKey: ["contacts", posting?.company_id] });
      void qc.invalidateQueries({ queryKey: ["outreach-log", postingId] });
    } catch (e) {
      toast(`save failed: ${(e as Error).message}`);
      setBusy(false);
    }
  };

  return (
    <Modal width={560} onClose={close}>
      <div className="modal-head">
        <h2>Send follow-up</h2>
      </div>
      <div className="modal-body">
        <p id="sendfollowup-to" className="small dim" style={{ margin: "0 0 8px" }}>
          To: {contact.email || ""} — replies on the existing thread
        </p>
        <textarea className="input" id="sendfollowup-body" rows={12} spellCheck={false} value={body} onChange={(e) => setBody(e.target.value)} />
        <p className="small dim" style={{ margin: "8px 0 0" }}>
          Sends as a reply on the existing Gmail thread and logs it — the next follow-up re-arms automatically.
        </p>
      </div>
      <div className="modal-foot">
        <button className="btn" onClick={close}>
          Cancel
        </button>
        <button className="btn btn-primary" disabled={busy} onClick={send}>
          Send
        </button>
      </div>
    </Modal>
  );
}
