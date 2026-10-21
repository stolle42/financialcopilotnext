import { defineConfig, devices } from "@playwright/test";

// Without BASE_URL, test the local production build; CI's `deployed` job passes the Vercel
// production domain (R-18).
const baseURL = process.env.BASE_URL ?? "http://localhost:4173";

const performanceSpec = /performance\.spec\.ts$/;

export default defineConfig({
  testDir: "e2e",
  forbidOnly: !!process.env.CI,
  reporter: [["html", { open: "never" }]],
  use: {
    baseURL,
    // A fixed locale, so amounts and dates read the same on every machine (FR-060).
    locale: "en-US",
    // Every spec but the installable app's runs without the service worker, so it sees each
    // request the page makes (R-30).
    serviceWorkers: "block",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] }, testIgnore: performanceSpec },
    { name: "firefox", use: { ...devices["Desktop Firefox"] }, testIgnore: performanceSpec },
    // Every story but the AI features', with the network cut once the service worker controls the
    // page (SC-018, R-30); e2e/support/test.ts checks that it stayed so.
    {
      name: "offline",
      testMatch: /us[1-7]-.*\.spec\.ts$/,
      use: { ...devices["Desktop Chrome"], serviceWorkers: "allow" },
    },
    // The performance checks time the app, so they run after everything else, one browser at a
    // time, with nothing else competing for the machine: beside six other workers they ran two to
    // four times slower than on a quiet one. They measure the local build, not a remote site, where
    // the network would be part of the time.
    ...(process.env.BASE_URL
      ? []
      : [
          {
            name: "performance-chromium",
            testMatch: performanceSpec,
            use: { ...devices["Desktop Chrome"] },
            dependencies: ["chromium", "firefox"],
          },
          {
            name: "performance-firefox",
            testMatch: performanceSpec,
            use: { ...devices["Desktop Firefox"] },
            dependencies: ["performance-chromium"],
          },
        ]),
  ],
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: "npx vite preview",
        url: "http://localhost:4173",
        reuseExistingServer: !process.env.CI,
        // No key, so a request that no stand-in answers can never reach OpenAI (R-24).
        env: { OPENAI_API_KEY: "" },
      },
});
