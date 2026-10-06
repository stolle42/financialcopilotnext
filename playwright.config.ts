import { defineConfig, devices } from "@playwright/test";

// Without BASE_URL, test the local production build; CI's `deployed` job passes the Vercel
// production domain (R-18).
const baseURL = process.env.BASE_URL ?? "http://localhost:4173";

export default defineConfig({
  testDir: "e2e",
  forbidOnly: !!process.env.CI,
  reporter: [["html", { open: "never" }]],
  use: {
    baseURL,
    // A fixed locale, so amounts and dates read the same on every machine (FR-060).
    locale: "en-US",
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
