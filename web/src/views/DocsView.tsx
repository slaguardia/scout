// Docs view — the "how scout works" guided tour: a numbered nav rail + the static
// content body, with scroll-spy (the nav item for the section in view lights up)
// and click-to-scroll. Port of the docs markup + onDocsShown/setActiveDoc/
// goToDocSection. The body is static trusted HTML extracted from the vanilla
// markup (docsContent.ts).
import { useEffect, useRef, useState } from "react";
import { useUI, useDispatch } from "../store/ui";
import { DOCS_HTML } from "./docsContent";

const NAV: [string, string][] = [
  ["overview", "Overview"],
  ["pipeline", "The pipeline"],
  ["ingest", "Ingest & CSV format"],
  ["filter", "The pre-filter"],
  ["enrich", "Enrichment"],
  ["verdict", "The verdict & prompts"],
  ["files", "Files scout reads"],
  ["triage", "Triage & results"],
];

export function DocsView() {
  const ui = useUI();
  const dispatch = useDispatch();
  const bodyRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState("overview");

  const scrollTo = (sec: string) => {
    const el = document.getElementById("doc-" + sec);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    setActive(sec);
  };

  // Deep-link target (a "Learn more" link jumped here) — scroll once, then clear.
  useEffect(() => {
    if (ui.docsSection) {
      const el = document.getElementById("doc-" + ui.docsSection);
      if (el) el.scrollIntoView({ block: "start" });
      setActive(ui.docsSection);
      dispatch({ type: "clearDocsSection" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Scroll-spy: highlight the nav item for whichever section is in view.
  useEffect(() => {
    const body = bodyRef.current;
    if (!body || !("IntersectionObserver" in window)) return;
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length) setActive(visible[0].target.id.replace(/^doc-/, ""));
      },
      { root: body, rootMargin: "0px 0px -65% 0px", threshold: 0 },
    );
    body.querySelectorAll("section").forEach((s) => obs.observe(s));
    return () => obs.disconnect();
  }, []);

  return (
    <div className="main-view" id="docs-view">
      <div className="docs" aria-label="How scout works">
        <div className="docs-head">
          <span className="dot" aria-hidden="true"></span>
          <h2>How scout works</h2>
          <span className="sub">a guided tour of the pipeline</span>
          <span className="spacer"></span>
        </div>
        <div className="docs-grid">
          <nav className="docs-nav" id="docs-nav">
            {NAV.map(([sec, label], i) => (
              <a key={sec} data-sec={sec} className={active === sec ? "active" : ""} onClick={() => scrollTo(sec)}>
                <span className="nav-num">{i + 1}</span> {label}
              </a>
            ))}
          </nav>
          <div className="docs-body" id="docs-body" ref={bodyRef} dangerouslySetInnerHTML={{ __html: DOCS_HTML }} />
        </div>
      </div>
    </div>
  );
}
