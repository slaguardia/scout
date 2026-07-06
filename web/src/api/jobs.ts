// Jobs (postings) list. Feeds the jobs table, the queue nav, and the sidebar's
// stage/status filter counts. Polls its draft-status while any row is drafting
// (wired via refetchInterval in the view).
import { useQuery } from "@tanstack/react-query";
import { getJSON } from "./client";
import type { Posting } from "./types";

export const jobsKey = ["jobs"] as const;

export function useJobs() {
  return useQuery({
    queryKey: jobsKey,
    queryFn: async () => (await getJSON<{ rows?: Posting[] }>("/api/postings")).rows ?? [],
    // Poll every 4s while any row's draft is still researching (fire-and-forget
    // drafting surfaces its "ready" badge on its own), then stop.
    refetchInterval: (query) =>
      (query.state.data ?? []).some((j) => j.outreach_draft_status === "researching") ? 4000 : false,
  });
}
