// Prebuild step: generate the PWA manifest from the toolkit and copy the
// toolkit's standard service worker into public/ so Vite emits dist/sw.js.
// Both files are build artifacts (gitignored) — the toolkit is the single
// source of truth for the manifest shape + the SW. The icons in public/ are
// committed (real PNGs) and are NOT regenerated here.
import { writeFileSync, copyFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { manifest } from "@brainbot/web-toolkit/pwa";
import { swSource } from "@brainbot/web-toolkit/vite-preset";

const here = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(here, "..", "public");
mkdirSync(publicDir, { recursive: true });

writeFileSync(
  resolve(publicDir, "manifest.webmanifest"),
  JSON.stringify(
    manifest({
      name: "scout",
      short_name: "scout",
      description: "Personal job-fit scorer.",
    }),
    null,
    2,
  ),
);
copyFileSync(swSource, resolve(publicDir, "sw.js"));
