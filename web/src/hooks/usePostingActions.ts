// Posting-level mutations for the pursuit pane: role-detail saves, URL change,
// notes, re-enrich (recapture), relink to another company, delete. Each
// invalidates the queries the vanilla handlers refreshed (jobs table + the
// company pane's posting card; re-enrich also touches drafts/answers).
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "../components/Toast";
import {
  putPostingDetails,
  putPostingURL,
  putPostingTracking,
  recapturePosting,
  putPostingCompany,
  deletePosting,
} from "../api/postings";
import type { Posting } from "../api/types";

export function usePostingActions() {
  const qc = useQueryClient();
  const toast = useToast();

  const invalidateRow = () => {
    void qc.invalidateQueries({ queryKey: ["jobs"] });
    void qc.invalidateQueries({ queryKey: ["company"] });
  };

  const saveDetail = (j: Posting, key: string) => async (v: string) => {
    await putPostingDetails(j, key, v);
    invalidateRow();
  };

  const saveURL = (j: Posting) => async (v: string) => {
    await putPostingURL(j.posting_id, v);
    invalidateRow();
  };

  const saveNotes = (j: Posting) => async (v: string) => {
    await putPostingTracking(j, { notes: v });
    void qc.invalidateQueries({ queryKey: ["jobs"] });
  };

  const reenrich = async (j: Posting) => {
    try {
      await recapturePosting(j.posting_id);
      void qc.invalidateQueries({ queryKey: ["jobs"] });
      void qc.invalidateQueries({ queryKey: ["company"] });
      void qc.invalidateQueries({ queryKey: ["answers", j.posting_id] });
      toast("re-enriched from the posting link");
    } catch (e) {
      toast(`re-enrich failed: ${(e as Error).message}`);
    }
  };

  const relink = async (j: Posting, companyId: string): Promise<boolean> => {
    if (companyId === j.company_id) return true;
    try {
      const fresh = await putPostingCompany(j.posting_id, companyId);
      invalidateRow();
      toast(`moved to ${fresh.company_name || "company"}`);
      return true;
    } catch (e) {
      toast(`move failed: ${(e as Error).message}`);
      return false;
    }
  };

  const remove = async (j: Posting): Promise<boolean> => {
    try {
      await deletePosting(j.posting_id);
      invalidateRow();
      toast(`deleted ${(j.title || "").trim() || "posting"}`);
      return true;
    } catch (e) {
      toast(`delete failed: ${(e as Error).message}`);
      return false;
    }
  };

  return { saveDetail, saveURL, saveNotes, reenrich, relink, remove };
}
