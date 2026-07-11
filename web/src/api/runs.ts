// Run state (the sidebar busy indicator) + the Add-dialog facets. Invalidated by
// the RunController on stream start/end.
import { useQuery } from "@tanstack/react-query";
import { getOrNull } from "./client";

export interface RunsState {
  busy_stage?: string;
}

export function useRuns() {
  return useQuery({
    queryKey: ["runs"],
    queryFn: async (): Promise<RunsState> => (await getOrNull<RunsState>("/api/runs")) ?? {},
  });
}

export interface Facets {
  funding_stages: string[];
  verticals: string[];
  locations: string[];
}

export function useFacets(enabled: boolean) {
  return useQuery({
    queryKey: ["facets"],
    queryFn: async (): Promise<Facets> => {
      const f = (await getOrNull<Facets>("/api/facets")) ?? { funding_stages: [], verticals: [], locations: [] };
      return { funding_stages: f.funding_stages ?? [], verticals: f.verticals ?? [], locations: f.locations ?? [] };
    },
    enabled,
    staleTime: 30_000,
  });
}
