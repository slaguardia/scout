// Chat threads — one thread per (scope, scope_id). getThread resolves/creates it
// and returns the canonical messages; a turn is POST /message then the SSE
// /stream feeds text deltas. Content is a block array (text / tool_use / …).
import { getJSON } from "./client";

export interface ContentBlock {
  type: string;
  text?: string;
  name?: string;
}
export interface ChatMessage {
  role: string;
  content: ContentBlock[];
}
export interface ThreadData {
  thread: { id: string };
  messages: ChatMessage[];
}

function threadsQS(scope: string, scopeId: string): string {
  return "scope=" + encodeURIComponent(scope) + (scopeId ? "&scope_id=" + encodeURIComponent(scopeId) : "");
}

export function getThread(scope: string, scopeId: string): Promise<ThreadData> {
  return getJSON<ThreadData>("/api/chat/threads?" + threadsQS(scope, scopeId));
}

export function postChatMessage(threadId: string, text: string): Promise<Response> {
  return fetch(`/api/chat/${threadId}/message`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
}

/** The prose text of a message (concatenated text blocks). */
export function blockText(content: ContentBlock[]): string {
  return (content || []).filter((b) => b && b.type === "text").map((b) => b.text || "").join("");
}

/** The tool footnote labels for an assistant turn. */
export function blockTools(content: ContentBlock[]): string[] {
  return (content || [])
    .filter((b) => b && (b.type === "tool_use" || b.type === "server_tool_use"))
    .map((b) => (b.type === "server_tool_use" ? "web search" : b.name || ""));
}
