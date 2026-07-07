// Converts an email/follow-up body (with markdown links [label](url)) into the
// two clipboard flavors. Mirrors the Gmail send path (scout/gmail/message.py's
// _to_html) so a copied draft pastes into a rich mail client as real anchors,
// and degrades to clean plain text everywhere else — never raw [label](url).
const MD_LINK = /\[([^\]]+)\]\(([^)\s]+)\)/g;

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

// emailBodyToHtml — escape the body, turn markdown links into anchors, newlines
// into <br>. Same transform as the Gmail send, minus the <html><body> wrapper
// (clipboard HTML needs no document shell).
export function emailBodyToHtml(body: string): string {
  const linked = esc(body).replace(MD_LINK, (_m, label, url) => `<a href="${url}">${label}</a>`);
  return linked.replace(/\n/g, "<br>\n");
}

// emailBodyToPlain — drop markdown link syntax for a plain-text paste: keep just
// the label when it already carries the URL, else "label (url)" so nothing is
// lost.
export function emailBodyToPlain(body: string): string {
  return body.replace(MD_LINK, (_m, label, url) => {
    const bare = url.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "");
    return label === url || label === bare ? label : `${label} (${url})`;
  });
}
