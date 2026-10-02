import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";

// Names the commit in the built page, so CI's `deployed` job can wait until the production domain
// serves the commit it was triggered for (R-18). Vercel provides the id to its builds.
function appCommit(): Plugin {
  return {
    name: "app-commit",
    apply: "build",
    transformIndexHtml: () => [
      {
        tag: "meta",
        attrs: { name: "app-commit", content: process.env.VERCEL_GIT_COMMIT_SHA ?? "local" },
        injectTo: "head",
      },
    ],
  };
}

export default defineConfig({
  // Relative asset URLs let the build load from any path or from local files (R-20).
  base: "./",
  plugins: [react(), tailwindcss(), appCommit()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  // Browsers keep data per origin, so a silently moved port would open the app empty (R-20).
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  // Domain and store tests run in Node; the browser is Playwright's job (R-17).
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    passWithNoTests: true,
    // A zone west of UTC, where a date read as UTC midnight shows as the day before, so tests
    // catch that mistake on every machine.
    env: { TZ: "America/Los_Angeles" },
  },
});
