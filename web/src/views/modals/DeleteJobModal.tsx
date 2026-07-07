// Delete-job confirm — mirrors the company delete. Removes the posting + its
// outreach drafts and application answers; the company stays.
import { useState } from "react";
import { Modal, ModalNote } from "../../components/Modal";
import { useDispatch } from "../../store/ui";
import { usePostingActions } from "../../hooks/usePostingActions";
import type { Posting } from "../../api/types";

export function DeleteJobModal({ posting }: { posting: Posting }) {
  const dispatch = useDispatch();
  const { remove } = usePostingActions();
  const [busy, setBusy] = useState(false);
  const label = (posting.title || "").trim() || "this posting";

  const confirm = async () => {
    setBusy(true);
    const ok = await remove(posting);
    if (ok) {
      dispatch({ type: "closeModal" });
      dispatch({ type: "closePursuit" });
    } else {
      setBusy(false);
    }
  };

  return (
    <Modal width={460} onClose={() => dispatch({ type: "closeModal" })}>
      <div className="modal-head">
        <h2>Delete job?</h2>
      </div>
      <div className="modal-body">
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>
          Delete <strong>{label}</strong>
          {posting.company ? (
            <>
              {" "}at <strong>{posting.company}</strong>
            </>
          ) : null}
          ?
        </p>
        <ModalNote danger>
          This permanently removes the job posting and everything attached to it — its outreach drafts and application
          answers. The company stays. It can't be undone.
        </ModalNote>
      </div>
      <div className="modal-foot">
        <button className="btn" onClick={() => dispatch({ type: "closeModal" })}>
          Cancel
        </button>
        <button className="btn btn-danger" disabled={busy} onClick={confirm}>
          Delete
        </button>
      </div>
    </Modal>
  );
}
