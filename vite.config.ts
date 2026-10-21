import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";
import { aiRoute } from "./server/aiRoute.ts";
import { appVersion, serviceWorkerBuild } from "./worker/plugin.ts";

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

// Limits scripts, styles, images, fonts and connections to the app's own origin, with no exception
// for inline styles (R-19). Only the production build carries it, because the dev server's hot
// reload needs inline scripts and a WebSocket. The one exception is OpenAI's API, which the AI
// features reach with the user's own key (R-31).
const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self'",
  "font-src 'self'",
  "connect-src 'self' https://api.openai.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

function contentSecurityPolicyTag(): Plugin {
  return {
    name: "content-security-policy",
    apply: "build",
    transformIndexHtml: () => [
      {
        tag: "meta",
        attrs: { "http-equiv": "Content-Security-Policy", content: contentSecurityPolicy },
        // First in <head>, so the policy applies to every script and stylesheet after it.
        injectTo: "head-prepend",
      },
    ],
  };
}

export default defineConfig({
  // Relative asset URLs let the build load from any path or from local files (R-20).
  base: "./",
  plugins: [
    react(),
    tailwindcss(),
    appCommit(),
    contentSecurityPolicyTag(),
    aiRoute(),
    serviceWorkerBuild(),
  ],
  // The header shows the version the build's worker names (FR-088, R-30).
  define: { __APP_VERSION__: JSON.stringify(appVersion()) },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  // Browsers keep data per origin, so a silently moved port would open the app empty (R-20).
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  // Domain and store tests run in Node; the browser is Playwright's job (R-17).
  test: {
    environment: "node",
    include: [
      "src/**/*.test.ts",
      "server/**/*.test.ts",
      "worker/**/*.test.ts",
      "scripts/**/*.test.ts",
    ],
    passWithNoTests: true,
    // A zone west of UTC, where a date read as UTC midnight shows as the day before, so tests
    // catch that mistake on every machine.
    env: { TZ: "America/Los_Angeles" },
  },
});
