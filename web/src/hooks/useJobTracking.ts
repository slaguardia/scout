// Posting-tracking mutations shared by the jobs-row inline controls and the
// pursuit pane: next-up toggle + lifecycle (stage/status/notes) saves. Each
// invalidates the jobs list (the table + pursuit read from it) and the company
// queries (the company pane's posting card mirrors the lifecycle).
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "../components/Toast";
import { putNextUp, putPostingTracking } from "../api/postings";
import type { Posting } from "../api/types";

export function useJobTracking() {
  const qc = useQueryClient();
  const toast = useToast();

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["jobs"] });
    void qc.invalidateQueries({ queryKey: ["company"] });
  };

  const toggleNextUp = async (j: Posting) => {
    try {
      const fresh = await putNextUp(j.posting_id, !j.next_up);
      invalidate();
      toast(fresh.next_up ? "queued next up" : "removed from the queue");
    } catch (e) {
      toast(`save failed: ${(e as Error).message}`);
    }
  };

  const saveTracking = async (j: Posting, patch: Record<string, unknown>) => {
    try {
      await putPostingTracking(j, patch);
      invalidate();
      toast("tracking saved");
    } catch (e) {
      toast(`save failed: ${(e as Error).message}`);
    }
  };

  return { toggleNextUp, saveTracking };
}
