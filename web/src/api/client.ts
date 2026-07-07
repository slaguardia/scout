// The typed fetch layer. Every `/api/*` call in the app goes through here.
// Mirrors the vanilla app's conventions: JSON in/out, and a server error surfaces
// as `{ error: "..." }` (sometimes with a non-2xx, sometimes 2xx) — we normalize
// both into a thrown ApiError carrying that message, so callers (mutations) can
// `toast("failed: " + err.message)` exactly as before.

export class ApiError extends Error {
  status: number;
  data: unknown;
  constructor(message: string, status: number, data: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

async function parseBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function errorMessage(body: unknown, res: Response): string {
  if (body && typeof body === "object" && "error" in body) {
    const e = (body as { error?: unknown }).error;
    if (typeof e === "string" && e) return e;
  }
  return `HTTP ${res.status}`;
}

/** Core request: parses JSON, throws ApiError on a non-2xx OR an `{error}` body. */
export async function request<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body = await parseBody(res);
  const hasError =
    body && typeof body === "object" && "error" in body && (body as { error?: unknown }).error;
  if (!res.ok || hasError) {
    throw new ApiError(errorMessage(body, res), res.status, body);
  }
  return body as T;
}

const JSON_HEADERS = { "Content-Type": "application/json" };

export function getJSON<T = unknown>(url: string): Promise<T> {
  return request<T>(url);
}

export function postJSON<T = unknown>(url: string, body?: unknown): Promise<T> {
  return request<T>(url, {
    method: "POST",
    headers: body === undefined ? undefined : JSON_HEADERS,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export function putJSON<T = unknown>(url: string, body?: unknown): Promise<T> {
  return request<T>(url, {
    method: "PUT",
    headers: body === undefined ? undefined : JSON_HEADERS,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export function del<T = unknown>(url: string, body?: unknown): Promise<T> {
  return request<T>(url, {
    method: "DELETE",
    headers: body === undefined ? undefined : JSON_HEADERS,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/**
 * A tolerant GET: resolves to `fallback` instead of throwing when the endpoint
 * is unreachable or non-2xx. Mirrors the vanilla `.then(r => r.ok ? … : null).catch(() => {})`
 * pattern used for optional data (vocab, stats, profile) that must never break boot.
 */
export async function getOrNull<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}
