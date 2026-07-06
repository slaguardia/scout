// scout PWA entry (React). Reuses the toolkit's CSS/tokens verbatim + its PWA and
// session helpers; the framework-bound `shell` (mountApp) is gone — scout is a
// full-bleed app that owns its layout, so React mounts directly on #root. The
// toolkit gains no react dependency; every React line stays inside web/.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import "@brainbot/web-toolkit/base.css";
import "@brainbot/web-toolkit/components.css";
import "./style.css";
import { registerSW } from "@brainbot/web-toolkit/pwa";
import { currentUser } from "@brainbot/web-toolkit/session";
import { queryClient } from "./store/queryClient";
import { UIProvider } from "./store/ui";
import { ToastProvider } from "./components/Toast";
import { App } from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <UIProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </UIProvider>
    </QueryClientProvider>
  </StrictMode>,
);

registerSW();

// Identity hook for when scout sits behind the shared edge (US-004). Resolves to
// null in local dev; does not change the UI.
void currentUser();
