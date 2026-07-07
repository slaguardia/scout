// Company mutations shared by the companies table and the detail pane
// (flag toggle, mark-reviewed). Each invalidates the queries the vanilla
// handlers refreshed: the list, the jobs view (rows carry the company flag),
// and the open detail + trace.
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "../components/Toast";
import { postReviewed, putFlag } from "../api/companies";

export function useCompanyActions() {
  const qc = useQueryClient();
  const toast = useToast();

  const invalidate = (id: string) => {
    void qc.invalidateQueries({ queryKey: ["companies"] });
    void qc.invalidateQueries({ queryKey: ["jobs"] });
    void qc.invalidateQueries({ queryKey: ["company", id] });
  };

  const toggleFlag = async (id: string, current: boolean) => {
    try {
      const fresh = await putFlag(id, !current);
      invalidate(id);
      toast(fresh.flagged ? "flagged" : "unflagged");
    } catch (e) {
      toast(`failed: ${(e as Error).message}`);
    }
  };

  const markReviewed = async (id: string) => {
    try {
      await postReviewed(id);
      void qc.invalidateQueries({ queryKey: ["companies"] });
      void qc.invalidateQueries({ queryKey: ["company", id] });
      toast("reviewed");
    } catch (e) {
      toast(`failed: ${(e as Error).message}`);
    }
  };

  return { toggleFlag, markReviewed };
}
