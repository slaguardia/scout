// Enrichment fetch-status → a friendly pill label + class. Mirrors app.ts's
// ENRICH_STATUS map + enrichStatus(): clean read is green, soft misses amber,
// the rest red; http_<code> and anything unmapped fall through to an error pill.
const ENRICH_STATUS: Record<string, [string, string]> = {
  ok: ["good", "pill-good"],
  low_content: ["thin page", "pill-warn"],
  challenge: ["blocked", "pill-warn"],
  soft_404: ["page not found", "pill-bad"],
  no_domain: ["no domain", "pill-none"],
  dns: ["unreachable", "pill-bad"],
  refused: ["refused", "pill-bad"],
  timeout: ["timed out", "pill-bad"],
  error: ["error", "pill-bad"],
  "": ["not enriched", "pill-none"],
};

export function enrichStatus(s?: string | null): { label: string; cls: string } {
  s = s || "";
  if (s in ENRICH_STATUS) {
    const [label, cls] = ENRICH_STATUS[s];
    return { label, cls };
  }
  if (s.startsWith("http_")) return { label: s.replace("http_", "HTTP "), cls: "pill-bad" };
  return { label: s, cls: "pill-bad" };
}
