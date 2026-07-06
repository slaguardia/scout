// Minimal markdown → safe HTML for assistant chat bubbles. Escapes first, then a
// small block + inline subset (fenced code, lists, headings, paragraphs;
// bold/italic/inline-code/links). Safe by construction: every text run is
// HTML-escaped before any known tags are introduced. Port of app.ts's
// renderMarkdown + chatInline.
function escapeHTML(s: string): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

function chatInline(s: string): string {
  return s
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)/g, (_m, t, u) => `<a href="${u}" target="_blank" rel="noopener noreferrer">${t}</a>`)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
}

export function renderMarkdown(src: string): string {
  const lines = String(src || "").split("\n");
  const out: string[] = [];
  let list: "ul" | "ol" | null = null;
  const closeList = () => {
    if (list) {
      out.push("</" + list + ">");
      list = null;
    }
  };
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^```/.test(line)) {
      closeList();
      i++;
      const buf: string[] = [];
      while (i < lines.length && !/^```/.test(lines[i])) {
        buf.push(lines[i]);
        i++;
      }
      i++;
      out.push("<pre><code>" + escapeHTML(buf.join("\n")) + "</code></pre>");
      continue;
    }
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      closeList();
      const n = h[1].length;
      out.push("<h" + n + ">" + chatInline(escapeHTML(h[2])) + "</h" + n + ">");
      i++;
      continue;
    }
    const ul = line.match(/^\s*[-*]\s+(.*)$/);
    if (ul) {
      if (list !== "ul") {
        closeList();
        out.push("<ul>");
        list = "ul";
      }
      out.push("<li>" + chatInline(escapeHTML(ul[1])) + "</li>");
      i++;
      continue;
    }
    const ol = line.match(/^\s*\d+\.\s+(.*)$/);
    if (ol) {
      if (list !== "ol") {
        closeList();
        out.push("<ol>");
        list = "ol";
      }
      out.push("<li>" + chatInline(escapeHTML(ol[1])) + "</li>");
      i++;
      continue;
    }
    if (line.trim() === "") {
      closeList();
      i++;
      continue;
    }
    closeList();
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() !== "" && !/^```|^#{1,6}\s|^\s*[-*]\s+|^\s*\d+\.\s+/.test(lines[i])) {
      para.push(chatInline(escapeHTML(lines[i])));
      i++;
    }
    out.push("<p>" + para.join("<br>") + "</p>");
  }
  closeList();
  return out.join("");
}
