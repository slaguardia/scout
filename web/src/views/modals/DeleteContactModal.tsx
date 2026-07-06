// Remove-contact confirm — only shown for a contact with logged sends (an
// unwritten-to contact removes straight away in the card). Names the contact +
// count; the logged sends are soft-kept server-side.
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Modal, ModalNote } from "../../components/Modal";
import { useToast } from "../../components/Toast";
import { useDispatch } from "../../store/ui";
import { deleteContact } from "../../api/contacts";

export function DeleteContactModal({ contactId, name, count }: { contactId: string; name: string; count: number }) {
  const dispatch = useDispatch();
  const qc = useQueryClient();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    setBusy(true);
    try {
      await deleteContact(contactId);
      dispatch({ type: "closeModal" });
      void qc.invalidateQueries({ queryKey: ["jobs"] });
      void qc.invalidateQueries({ queryKey: ["contacts"] });
      void qc.invalidateQueries({ queryKey: ["outreach-log"] });
      toast("contact removed");
    } catch (e) {
      toast(`save failed: ${(e as Error).message}`);
      setBusy(false);
    }
  };

  return (
    <Modal width={460} onClose={() => dispatch({ type: "closeModal" })}>
      <div className="modal-head">
        <h2>Remove contact?</h2>
      </div>
      <div className="modal-body">
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>
          Remove <strong>{name}</strong>?
        </p>
        <ModalNote danger>
          You've logged {count} email{count === 1 ? "" : "s"} to this contact — removing them takes that send history
          off this posting.
        </ModalNote>
      </div>
      <div className="modal-foot">
        <button className="btn" onClick={() => dispatch({ type: "closeModal" })}>
          Cancel
        </button>
        <button className="btn btn-danger" disabled={busy} onClick={confirm}>
          Remove
        </button>
      </div>
    </Modal>
  );
}
