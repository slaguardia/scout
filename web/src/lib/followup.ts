// renderFollowupTemplate fills the user's follow-up template with this contact +
// the last send's variables. Mirrors app.ts's version + the server's bareVarRE;
// an unknown {{token}} is left as-is so a typo stays visible.
import type { Contact, OutreachLogEntry, Posting } from "../api/types";

export function renderFollowupTemplate(
  template: string,
  posting: Posting,
  contact: Contact | null,
  latest: OutreachLogEntry | null,
): string {
  const vars: Record<string, string> = {
    company: posting.company || "",
    role: posting.title || "",
    contact_name: contact?.name || "",
    contact_role: contact?.role || "",
    last_sent: latest?.sent_at || "",
    last_message: latest?.body || "",
  };
  return (template || "").replace(/\{\{\s*([A-Za-z][A-Za-z0-9_]*)\s*\}\}/g, (m, k) =>
    k in vars ? vars[k] : m,
  );
}

export const isoToday = (): string => new Date().toISOString().slice(0, 10);
