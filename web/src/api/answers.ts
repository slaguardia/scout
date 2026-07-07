// Application answers — the per-posting essay questions + their mutations. The
// query polls every 4s while any answer is still generating.
import { useQuery } from "@tanstack/react-query";
import { getJSON, putJSON, request } from "./client";
import type { Answer } from "./types";

export function answersKey(postingId: string | null) {
  return ["answers", postingId] as const;
}

export interface AnswersData {
  answers: Answer[];
  questions_status: string;
}

export function useAnswers(postingId: string | null) {
  return useQuery({
    queryKey: answersKey(postingId),
    queryFn: async (): Promise<AnswersData> => {
      const d = await getJSON<{ answers?: Answer[]; questions_status?: string }>(
        `/api/postings/${postingId}/answers`,
      );
      return { answers: d.answers ?? [], questions_status: d.questions_status ?? "" };
    },
    enabled: postingId !== null,
    refetchInterval: (query) =>
      (query.state.data?.answers ?? []).some((a) => a.status === "generating") ? 4000 : false,
  });
}

/** POST generation (detect-if-missing server-side). Raw Response for 202/412/503. */
export function startAnswersRequest(postingId: string): Promise<Response> {
  return fetch(`/api/postings/${postingId}/answers`, { method: "POST" });
}

export function redetectRequest(postingId: string): Promise<Response> {
  return fetch(`/api/postings/${postingId}/answers/redetect`, { method: "POST" });
}

export function saveAnswerEdit(id: string, edited: string): Promise<Answer> {
  return putJSON<Answer>(`/api/answers/${id}`, { edited });
}

/** Regenerate one answer. Raw Response for 412/503 branching. */
export function regenerateAnswerRequest(id: string): Promise<Response> {
  return fetch(`/api/answers/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ regenerate: true }),
  });
}

export function removeAnswer(id: string): Promise<void> {
  return request<void>(`/api/answers/${id}`, { method: "DELETE" });
}
