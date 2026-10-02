import { defineConfig, devices } from "@playwright/test";

// Without BASE_URL, test the local production build; CI's `deployed` job passes the Vercel URL (R-18).
const baseURL = process.env.BASE_URL ?? "http://localhost:4173";
const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;

export default defineConfig({
  testDir: "e2e",
  forbidOnly: !!process.env.CI,
  reporter: [["html", { open: "never" }]],
  use: {
    baseURL,
    // Vercel puts deployments behind a login; this header lets the test run through (R-18).
    extraHTTPHeaders: bypassSecret ? { "x-vercel-protection-bypass": bypassSecret } : undefined,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
  ],
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: "npx vite preview",
        url: "http://localhost:4173",
        reuseExistingServer: !process.env.CI,
      },
});
