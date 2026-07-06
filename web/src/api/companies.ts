// Companies list + detail + per-company mutations (flag/reviewed/verdict/fields/
// domain/notes/add-posting/delete/trace). The list feeds the companies table AND
// the sidebar's verdict/flag filter counts; the detail feeds the pane.
import { useQuery } from "@tanstack/react-query";
import { getJSON, putJSON, postJSON, del } from "./client";
import type { Company, CompanyDetail, PostingSummary, TraceEvent } from "./types";

export const companiesKey = ["companies"] as const;

export function useCompanies() {
  return useQuery({
    queryKey: companiesKey,
    queryFn: async () => (await getJSON<{ rows?: Company[] }>("/api/companies")).rows ?? [],
  });
}

export function useCompanyDetail(id: string | null) {
  return useQuery({
    queryKey: ["company", id],
    queryFn: () => getJSON<CompanyDetail>(`/api/companies/${id}`),
    enabled: id !== null,
  });
}

export function useTrace(id: string | null) {
  return useQuery({
    queryKey: ["company", id, "trace"],
    queryFn: async () => (await getJSON<{ events?: TraceEvent[] }>(`/api/companies/${id}/trace`)).events ?? [],
    enabled: id !== null,
  });
}

/* ---- mutations (raw calls; the pane orchestrates query invalidation) -------- */

export function postReviewed(id: string): Promise<CompanyDetail> {
  return postJSON<CompanyDetail>(`/api/companies/${id}/reviewed`);
}

export function putFlag(id: string, flagged: boolean): Promise<CompanyDetail> {
  return putJSON<CompanyDetail>(`/api/companies/${id}/flagged`, { flagged });
}

export function putVerdict(id: string, verdict: string, reason: string): Promise<CompanyDetail> {
  return putJSON<CompanyDetail>(`/api/companies/${id}/verdict`, { verdict, reason });
}

/** PUT the whole editable facts payload with one field changed (server folds). */
export function putCompanyField(
  d: CompanyDetail,
  key: string,
  val: string,
): Promise<CompanyDetail> {
  const body: Record<string, unknown> = {
    name: d.name || "",
    headcount: d.headcount || "",
    funding_stage: d.funding_stage || "",
    location: d.location || "",
    vertical: d.vertical || "",
    [key]: val,
  };
  if (!String(body.name).trim()) return Promise.reject(new Error("name is required"));
  return putJSON<CompanyDetail>(`/api/companies/${d.company_id}`, body);
}

/** Domain change re-keys the company; the response carries a (possibly new) id. */
export function putCompanyDomain(id: string, website: string): Promise<CompanyDetail> {
  return putJSON<CompanyDetail>(`/api/companies/${id}/domain`, { website });
}

export function putCompanyNotes(id: string, notes: string): Promise<CompanyDetail> {
  return putJSON<CompanyDetail>(`/api/companies/${id}/notes`, { notes });
}

export function postPosting(id: string, url: string, title: string): Promise<PostingSummary> {
  return postJSON<PostingSummary>(`/api/companies/${id}/postings`, { url, title });
}

export function deleteCompany(id: string): Promise<void> {
  return del<void>(`/api/companies/${id}`);
}
