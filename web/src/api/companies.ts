// Companies list + per-company mutations (flag/reviewed/verdict/fields/delete).
// The list feeds the companies table AND the sidebar's verdict/flag filter counts.
import { useQuery } from "@tanstack/react-query";
import { getJSON } from "./client";
import type { Company } from "./types";

export const companiesKey = ["companies"] as const;

export function useCompanies() {
  return useQuery({
    queryKey: companiesKey,
    queryFn: async () => (await getJSON<{ rows?: Company[] }>("/api/companies")).rows ?? [],
  });
}
