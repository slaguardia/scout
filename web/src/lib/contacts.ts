// parseContacts turns the stored contacts value into [{position, email}] entries.
// Current format is a JSON array; legacy free-form strings ("VP Eng
// <jane@a.com>, cto@b.io") still parse — each comma-part's email-shaped token
// becomes the email and the remainder the position. Mirrors app.ts's parseContacts.
const RE_EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;

export interface ParsedContact {
  position: string;
  email: string;
}

export function parseContacts(s?: string | null): ParsedContact[] {
  const str = String(s || "").trim();
  if (!str) return [];
  if (str[0] === "[") {
    try {
      const a = JSON.parse(str);
      if (Array.isArray(a)) {
        return a
          .map((c) => ({
            position: String(c?.position || "").trim(),
            email: String(c?.email || "").trim(),
          }))
          .filter((c) => c.position || c.email);
      }
    } catch {
      /* fall through to legacy parse */
    }
  }
  return str
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .map((part) => {
      const m = part.match(RE_EMAIL);
      const email = m ? m[0] : "";
      let position = email ? part.replace(email, "") : part;
      position = position.replace(/[<>()]/g, "").replace(/[\s:–—-]+$/, "").trim();
      return { position, email };
    });
}
