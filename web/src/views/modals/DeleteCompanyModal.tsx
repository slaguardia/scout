// Delete-company confirm — irreversible; spells out what goes with it (its job
// postings). On confirm: DELETE, close the pane if it's showing this company,
// and refresh the table / jobs / stats.
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Modal, ModalNote } from "../../components/Modal";
import { useToast } from "../../components/Toast";
import { useUI, useDispatch } from "../../store/ui";
import { deleteCompany } from "../../api/companies";
import type { CompanyDetail } from "../../api/types";

export function DeleteCompanyModal({ company }: { company: CompanyDetail }) {
  const dispatch = useDispatch();
  const qc = useQueryClient();
  const toast = useToast();
  const ui = useUI();
  const [busy, setBusy] = useState(false);
  const n = (company.postings || []).length;
  const jobs = n ? ` and its ${n} job ${n === 1 ? "posting" : "postings"}` : "";

  const confirm = async () => {
    setBusy(true);
    try {
      await deleteCompany(company.company_id);
      const name = company.name || "company";
      dispatch({ type: "closeModal" });
      if (ui.openCompanyId === company.company_id) dispatch({ type: "closeCompany" });
      void qc.invalidateQueries({ queryKey: ["companies"] });
      void qc.invalidateQueries({ queryKey: ["jobs"] });
      void qc.invalidateQueries({ queryKey: ["stats"] });
      toast(`deleted ${name}`);
    } catch (e) {
      toast(`delete failed: ${(e as Error).message}`);
      setBusy(false);
    }
  };

  return (
    <Modal width={460} onClose={() => dispatch({ type: "closeModal" })}>
      <div className="modal-head">
        <h2>Delete company?</h2>
      </div>
      <div className="modal-body">
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>
          Delete <strong>{company.name || "this company"}</strong>
          {jobs}?
        </p>
        <ModalNote danger>
          This permanently removes the company and everything attached to it — its job postings, outreach
          drafts, application answers, enrichment, verdict, and decision trail. It can't be undone.
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
