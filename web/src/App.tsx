// The app shell. Replaces the vanilla `.layout` markup + initScout's top-level
// wiring: the sidebar, the view containers (companies/jobs always mounted +
// display-toggled, like the original; settings/inbox/docs mounted on demand),
// the slide-in panes, the modal host, and the run drawer — plus the three
// document-level behaviours that lived at the bottom of app.ts: the global
// Escape peel order, the GPU-tile repaint nudge, and the Gmail OAuth-return toast.
import { useEffect } from "react";
import { useUI, useDispatch } from "./store/ui";
import { useToast } from "./components/Toast";
import { Sidebar } from "./views/Sidebar";
import { ChatFab } from "./views/ChatFab";
import { CompaniesView } from "./views/CompaniesView";
import { JobsView } from "./views/JobsView";
import { SettingsView } from "./views/SettingsView";
import { InboxView } from "./views/InboxView";
import { DocsView } from "./views/DocsView";
import { CompanyPane } from "./views/CompanyPane";
import { PursuitPane } from "./views/pursuit/PursuitPane";
import { ChatPane } from "./views/ChatPane";
import { ProgressDrawer } from "./views/ProgressDrawer";
import { Modals } from "./views/Modals";

export function App() {
  const ui = useUI();
  const dispatch = useDispatch();
  const toast = useToast();
  const { view } = ui;

  // Global Escape peel order (dropdowns handle their own in capture phase and
  // stopPropagation, so they're peeled first): chat → modal → top pane.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (ui.chat) {
        dispatch({ type: "closeChat" });
        return;
      }
      if (ui.modal) {
        dispatch({ type: "closeModal" });
        return;
      }
      const companyOpen = ui.openCompanyId !== null;
      const pursuitOpen = ui.openPursuitId !== null;
      if (companyOpen || pursuitOpen) {
        if (ui.topPane === "pursuit" && pursuitOpen) dispatch({ type: "closePursuit" });
        else if (ui.topPane === "company" && companyOpen) dispatch({ type: "closeCompany" });
        else if (companyOpen) dispatch({ type: "closeCompany" });
        else dispatch({ type: "closePursuit" });
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [ui.chat, ui.modal, ui.openCompanyId, ui.openPursuitId, ui.topPane, dispatch]);

  // Nudge the compositor to re-raster stale GPU tiles when the tab becomes
  // visible again (macOS + Chromium Spaces switch). Toggles a transform on
  // .layout only (a sibling of the fixed panes/scrims/FAB) across two rAFs.
  useEffect(() => {
    const nudge = () => {
      const layout = document.querySelector(".layout") as HTMLElement | null;
      if (!layout) return;
      layout.style.transform = "translateZ(0)";
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          layout.style.transform = "";
        }),
      );
    };
    const onVis = () => {
      if (!document.hidden) nudge();
    };
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) nudge();
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pageshow", onShow);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pageshow", onShow);
    };
  }, []);

  // Surface the Gmail OAuth round-trip result (?gmail=connected|error), then
  // clean the query so a refresh doesn't re-toast.
  useEffect(() => {
    const m = /[?&]gmail=(connected|error)/.exec(location.search);
    if (!m) return;
    toast(m[1] === "connected" ? "Gmail connected" : "Gmail connection failed");
    history.replaceState(null, "", location.pathname + location.hash);
  }, [toast]);

  return (
    <>
      <div className="layout">
        <Sidebar />
        <ChatFab />
        <main>
          <CompaniesView active={view === "companies"} />
          <JobsView active={view === "jobs"} />
          {view === "settings" ? <SettingsView /> : null}
        </main>
      </div>

      <CompanyPane />
      <PursuitPane />
      <ChatPane />
      <ProgressDrawer />
      <Modals />

      {view === "inbox" ? <InboxView /> : null}
      {view === "docs" ? <DocsView /> : null}
    </>
  );
}
