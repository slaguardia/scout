// Settings endpoints — text/list artifacts, pipeline prompts, the pre-filter,
// the company-fit brief/profile, stats, the Anthropic key, Gmail config, and the
// outreach-knowledge sources. Each editor round-trips to its own route.
import { useQuery } from "@tanstack/react-query";
import { getJSON, putJSON, postJSON, del, getOrNull } from "./client";

/* ---- text / list artifacts (GET/PUT /api/<kind>) --------------------------- */

export interface FieldData {
  content?: string;
  statuses?: string[];
  enabled?: boolean;
  taste_version?: string;
}

export function useField(kind: string, list: boolean) {
  return useQuery({
    queryKey: ["settings", kind],
    queryFn: async (): Promise<string> => {
      const d = await getJSON<FieldData>(`/api/${kind}`);
      return list ? (d.statuses || []).join("\n") : d.content || "";
    },
  });
}

export function putField(kind: string, list: boolean, value: string): Promise<unknown> {
  const body = list
    ? { statuses: value.split(/\r?\n/).map((s) => s.trim()).filter(Boolean) }
    : { content: value };
  return putJSON(`/api/${kind}`, body);
}

/* ---- pipeline prompts ------------------------------------------------------ */

export interface PromptData {
  content: string;
  enabled?: boolean;
}

export function usePrompt(key: string) {
  return useQuery({
    queryKey: ["prompt", key],
    queryFn: () => getJSON<PromptData>(`/api/outreach-prompts/${key}`),
  });
}

export function putPrompt(key: string, body: { content: string; enabled?: boolean }): Promise<PromptData> {
  return putJSON<PromptData>(`/api/outreach-prompts/${key}`, body);
}
export function resetPrompt(key: string): Promise<PromptData> {
  return putJSON<PromptData>(`/api/outreach-prompts/${key}`, { reset: true });
}

/* ---- follow-up interval ---------------------------------------------------- */

export function putFollowupInterval(days: number): Promise<unknown> {
  return putJSON(`/api/followup-interval`, { days });
}

/* ---- pre-filter ------------------------------------------------------------ */

export interface TasteFilter {
  rules?: Record<string, unknown>;
  enabled?: boolean;
}
export interface FilterOptions {
  verticals?: { value: string; count: number }[];
  stages?: { value: string; count: number }[];
}

export function getTasteFilter(useDefault: boolean): Promise<TasteFilter> {
  return getJSON<TasteFilter>(`/api/taste-filter${useDefault ? "?default=1" : ""}`);
}
export function putTasteFilter(rules: Record<string, unknown>, enabled: boolean): Promise<unknown> {
  return putJSON(`/api/taste-filter`, { rules, enabled });
}
export function useFilterOptions() {
  return useQuery({
    queryKey: ["filter-options"],
    queryFn: async () => (await getOrNull<FilterOptions>("/api/filter-options")) ?? {},
    staleTime: Infinity,
  });
}

/* ---- profile (company-fit brief) + stats ----------------------------------- */

export interface Profile {
  active_source?: string;
  body?: string;
}

export function useProfile() {
  return useQuery({
    queryKey: ["profile"],
    queryFn: async () => (await getOrNull<Profile>("/api/profile")) ?? null,
  });
}
export function refreshProfileRequest(): Promise<Profile> {
  return postJSON<Profile>("/api/profile/refresh");
}

export interface Stats {
  taste_source?: string;
  [k: string]: unknown;
}
export function useStats() {
  return useQuery({
    queryKey: ["stats"],
    queryFn: async () => (await getOrNull<Stats>("/api/stats")) ?? {},
  });
}

/* ---- integrations: Anthropic key + Gmail config ---------------------------- */

export interface KeyState {
  has_key?: boolean;
  key_source?: string | null;
}
export function useKeyState() {
  return useQuery({
    queryKey: ["anthropic-key"],
    queryFn: async () => (await getOrNull<KeyState>("/api/integrations/anthropic")) ?? {},
  });
}
export function putAnthropicKey(key: string): Promise<unknown> {
  return putJSON(`/api/integrations/anthropic`, { key });
}
export function deleteAnthropicKey(): Promise<unknown> {
  return del(`/api/integrations/anthropic`);
}

export function putGmailConfig(body: { client_id: string; client_secret: string; redirect_uri: string }): Promise<unknown> {
  return putJSON(`/api/gmail/config`, body);
}
export function putGmailAutoflip(enabled: boolean): Promise<unknown> {
  return putJSON(`/api/gmail/autoflip`, { enabled });
}
export function gmailConnect(): Promise<{ auth_url?: string }> {
  return getJSON<{ auth_url?: string }>("/api/gmail/connect");
}
export function gmailDisconnect(): Promise<unknown> {
  return del(`/api/gmail/disconnect`);
}

/* ---- outreach knowledge sources -------------------------------------------- */

export interface SourceRow {
  need: string;
  title?: string;
  page_id?: string;
}
export interface SourcesData {
  needs?: { Key?: string; key?: string; Hard?: boolean; hard?: boolean }[];
  sources?: SourceRow[];
}
export function useSources() {
  return useQuery({
    queryKey: ["outreach-sources"],
    queryFn: () => getJSON<SourcesData>("/api/outreach/sources"),
  });
}
