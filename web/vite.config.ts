import { defineConfig, mergeConfig } from "vite";
import { toolkitVite } from "@brainbot/web-toolkit/vite-preset";

// scout's Go server IS the backend (no Node server, unlike the brainbot
// reference). In dev, proxy /api/* to the running `scout serve` (default :8765).
// The build emits to ../internal/web/dist so the Go server can go:embed it —
// Vite resolves outDir relative to this project root (web/), landing at
// scout/internal/web/dist.
export default mergeConfig(
  toolkitVite({ apiProxyTarget: "http://127.0.0.1:8765" }),
  defineConfig({
    build: {
      outDir: "../internal/web/dist",
      emptyOutDir: true,
    },
  }),
);
