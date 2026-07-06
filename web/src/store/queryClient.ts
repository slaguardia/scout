import { QueryClient } from "@tanstack/react-query";

// One client for the app. Defaults tuned to match the vanilla app's feel:
// - no refetch-on-focus (the app never did that; it used explicit reloads +
//   fixed-interval polls, which we express as per-query refetchInterval)
// - retry off (the vanilla fetchers didn't retry; a failure surfaces once)
// - staleTime 0 so a query refetches when a view remounts (the "re-fetch on
//   return" behaviour the old view factories had).
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: false,
      staleTime: 0,
    },
  },
});
