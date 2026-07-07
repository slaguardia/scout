import { defineConfig, mergeConfig } from "vite";
import react from "@vitejs/plugin-react";
import { toolkitVite } from "@brainbot/web-toolkit/vite-preset";

// scout's Python server (FastAPI) IS the backend (no Node server, unlike the
// brainbot reference). In dev, proxy /api/* to the running `scout serve`
// (default :8765). The build emits to ./dist (web/dist), which the server serves
// as static files — Vite resolves outDir relative to this project root (web/).
//
// React is the only framework change: the toolkit stays vanilla + stack-agnostic
// (no react dep), so plugin-react is added here in scout's own config, not the
// preset.
export default mergeConfig(
  toolkitVite({ apiProxyTarget: "http://127.0.0.1:8765" }),
  defineConfig({
    plugins: [react()],
    build: {
      outDir: "dist",
      emptyOutDir: true,
    },
  }),
);
