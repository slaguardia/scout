// Shared TanStack Query hooks for app-wide data (capabilities meta + the
// configurable status vocabularies). Per-view queries live with their views.
import { useQuery } from "@tanstack/react-query";
import { getOrNull } from "./client";
import type { StatusVocab } from "./types";

export interface Meta {
  control: boolean;
  brain: boolean;
  verdict: boolean;
  chat?: boolean;
  capture?: boolean;
}

const DEFAULT_META: Meta = { control: false, brain: false, verdict: false, chat: false, capture: false };

/** GET /api/meta — capability gates (control surface, brain, verdict key, chat). */
export function useMeta() {
  return useQuery({
    queryKey: ["meta"],
    queryFn: async (): Promise<Meta> => (await getOrNull<Meta>("/api/meta")) ?? DEFAULT_META,
    placeholderData: DEFAULT_META,
  });
}

const DEFAULT_VOCAB: StatusVocab = {
  applicationStages: ["applied", "screening", "interview", "offer", "rejected", "archived"],
  outreachStatuses: ["initial contact", "no response", "replied", "followed up"],
  followupInterval: 5,
  followupTemplate: "",
};

/**
 * The configurable vocabularies + follow-up config, loaded from four endpoints
 * (application stages, reply statuses, follow-up interval + template). Each falls
 * back to its compiled default, exactly like the vanilla loadStatusVocab().
 */
export function useVocab() {
  return useQuery({
    queryKey: ["vocab"],
    queryFn: async (): Promise<StatusVocab> => {
      const [stages, statuses, interval, template] = await Promise.all([
        getOrNull<{ statuses?: string[] }>("/api/application-stages"),
        getOrNull<{ statuses?: string[] }>("/api/outreach-statuses"),
        getOrNull<{ days?: number }>("/api/followup-interval"),
        getOrNull<{ content?: string }>("/api/followup-template"),
      ]);
      return {
        applicationStages:
          stages && Array.isArray(stages.statuses) && stages.statuses.length
            ? stages.statuses
            : DEFAULT_VOCAB.applicationStages,
        outreachStatuses:
          statuses && Array.isArray(statuses.statuses) && statuses.statuses.length
            ? statuses.statuses
            : DEFAULT_VOCAB.outreachStatuses,
        followupInterval:
          interval && Number.isInteger(interval.days)
            ? (interval.days as number)
            : DEFAULT_VOCAB.followupInterval,
        followupTemplate:
          template && typeof template.content === "string"
            ? template.content
            : DEFAULT_VOCAB.followupTemplate,
      };
    },
    placeholderData: DEFAULT_VOCAB,
  });
}

/** A stable palette-index class for a vocab value, mirroring vocabColorClass(). */
const VOCAB_COLORS = 8;
export function vocabColorClass(value: string, list: string[]): string {
  const i = list.indexOf(value);
  return i < 0 ? "" : "sc-" + (i % VOCAB_COLORS);
}

/**
 * What a bulk verdict run would actually do, fetched fresh when the run dialog
 * opens. A run funnels through three gates that used to be silent — the
 * pre-filter, the enrichment requirement, and the skip-already-scored rule — so
 * the dialog can show the whole funnel plus the counts behind the scope picker.
 */
export interface VerdictPlan {
  total: number;
  prefilter_enabled: boolean;
  passes_prefilter: number;
  dropped_by: Record<string, number>;
  enriched: number;
  unenriched: number;
  scored: number;
  stale: number;
  current: number;
  manual: number;
  taste_version: string;
}

export function useVerdictPlan(enabled: boolean) {
  return useQuery({
    queryKey: ["verdict-plan"],
    queryFn: async (): Promise<VerdictPlan | null> =>
      getOrNull<VerdictPlan>("/api/run/verdict/plan"),
    enabled,
    staleTime: 0,
  });
}
