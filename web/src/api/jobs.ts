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
  });
}
