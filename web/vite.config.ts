import { defineConfig, mergeConfig } from "vite";
import { toolkitVite } from "@brainbot/web-toolkit/vite-preset";

// scout's Python server (FastAPI) IS the backend (no Node server, unlike the
// brainbot reference). In dev, proxy /api/* to the running `scout serve`
// (default :8765). The build emits to ./dist (web/dist), which the server serves
// as static files — Vite resolves outDir relative to this project root (web/).
export default mergeConfig(
  toolkitVite({ apiProxyTarget: "http://127.0.0.1:8765" }),
  defineConfig({
    build: {
      outDir: "dist",
      emptyOutDir: true,
    },
  }),
);
