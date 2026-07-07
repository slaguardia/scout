// linkify renders a draft body for the READ views: markdown links [label](url)
// and bare URLs become clickable anchors (mirrors what the Gmail send does), the
// rest stays plain text. Returns React nodes (no dangerouslySetInnerHTML).
import type { ReactNode } from "react";

const RE = /\[([^\]]+)\]\(([^)\s]+)\)|(https?:\/\/[^\s<]+)/g;

export function linkify(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  RE.lastIndex = 0;
  while ((m = RE.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const [, mdLabel, mdUrl, bareUrl] = m;
    if (bareUrl) {
      const trail = (bareUrl.match(/[.,;:)\]]+$/) || [""])[0];
      const url = bareUrl.slice(0, bareUrl.length - trail.length);
      out.push(
        <a key={key++} href={url} target="_blank" rel="noopener noreferrer">
          {url}
        </a>,
      );
      if (trail) out.push(trail);
    } else {
      out.push(
        <a key={key++} href={mdUrl} target="_blank" rel="noopener noreferrer">
          {mdLabel}
        </a>,
      );
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
