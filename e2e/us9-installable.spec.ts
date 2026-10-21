import type { Browser, BrowserContext, Page } from "@playwright/test";
import { addTransaction } from "./support/app";
import { saveBackup } from "./support/backup";
import { expect, guardNetwork, test } from "./support/test";
import {
  prepareVersions,
  startVersionsServer,
  VERSIONS_PORT,
  type Version,
  type VersionName,
  type VersionsServer,
} from "./support/versions";
import {
  askWorker,
  buildCaches,
  cachedFiles,
  inUse,
  pageBuild,
  waitForWorker,
  workerControls,
} from "./support/worker";

// User Story 9: the app at its web address, installable, offline after the first visit, and on a
// newer version only after Update (quickstart.md, US9; FR-121 – FR-125, FR-075; R-30;
// contracts/app-updates.md). Every other spec blocks service workers; this one allows them.

test.use({ serviceWorkers: "allow" });

const main = (page: Page) => page.getByRole("main");
const banner = (page: Page) => page.getByRole("banner");
const ledgerRows = (page: Page) =>
  page.getByRole("list", { name: "Transactions" }).getByRole("listitem");

/** The build that sw.js at the page's address names in its first line. */
async function workerBuild(page: Page) {
  const response = await page.request.get(new URL("sw.js", page.url()).href);
  const [header = ""] = (await response.text()).split("\n");
  return JSON.parse(header.slice("self.BUILD = ".length, -1)) as {
    id: string;
    version: string;
    files: string[];
  };
}

/** Opens the app and waits until its worker controls the page and names the build in use. */
async function firstVisit(page: Page) {
  await page.goto("/");
  await expect(main(page).getByRole("heading", { name: "Transactions", level: 1 })).toBeVisible();
  await waitForWorker(page);
  await expect.poll(() => inUse(page)).toBeDefined();
}

test("scenario 1: a browser that never opened the app shows the transaction list, and asks for nothing (FR-121, SC-016)", async ({
  page,
}) => {
  await page.goto("/");
  await expect(main(page).getByRole("heading", { name: "Transactions", level: 1 })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect(banner(page).getByRole("button", { name: "Install app" })).toHaveCount(0);
});

test.describe("the service worker (contracts/app-updates.md, the worker's lifecycle)", () => {
  test("after the first visit, sw.js controls the page, its build's cache holds every file, and in-use names the build", async ({
    page,
  }) => {
    await firstVisit(page);
    const build = await workerBuild(page);
    expect(build.id).toBe(await pageBuild(page));

    expect(await workerControls(page)).toBe(true);
    expect(await cachedFiles(page, build.id)).toEqual([...build.files].sort());
    expect(await inUse(page)).toEqual({ id: build.id, version: build.version });
  });

  test("scenario 4: offline, the app opens with its data, records an expense, shows Insights and saves a backup (FR-123, SC-018)", async ({
    page,
    context,
  }) => {
    await firstVisit(page);
    await addTransaction(page, { amount: "12.00", category: "Groceries", description: "Online" });

    await context.setOffline(true);
    await page.reload();
    await expect(ledgerRows(page).filter({ hasText: "Online" })).toHaveCount(1);

    await addTransaction(page, { amount: "8.00", category: "Groceries", description: "Offline" });
    await expect(ledgerRows(page).filter({ hasText: "Offline" })).toHaveCount(1);

    await page.goto("/#/insights");
    await expect(main(page).getByRole("heading", { name: "Insights", level: 1 })).toBeVisible();

    const backup = await saveBackup(page);
    expect(backup.json.data.transactions.map((t) => t.description).sort()).toEqual([
      "Offline",
      "Online",
    ]);
  });

  test.describe("requests to another origin", () => {
    // Until v1.6 the page's policy lets it reach no other origin; this test asks one itself.
    test.use({ bypassCSP: true });

    test("are left to the browser, so a stand-in's page.route still sees them", async ({
      page,
    }) => {
      await firstVisit(page);
      const seen: string[] = [];
      await page.route("https://api.openai.com/v1/models", (route) => {
        seen.push(route.request().url());
        return route.fulfill({
          status: 200,
          headers: { "Access-Control-Allow-Origin": "*" },
          body: "stand-in",
        });
      });

      const answer = await page.evaluate(() =>
        fetch("https://api.openai.com/v1/models").then((response) => response.text()),
      );

      expect(answer).toBe("stand-in");
      expect(seen).toEqual(["https://api.openai.com/v1/models"]);
    });
  });

  test("answers versions with the build in use and its own, and an unknown type not at all (contracts/app-updates.md, messages)", async ({
    page,
  }) => {
    await firstVisit(page);
    const { id, version } = await workerBuild(page);

    expect(await askWorker(page, { type: "versions" })).toEqual({
      inUse: { id, version },
      own: { id, version },
    });
    expect(await askWorker(page, { type: "nonsense" }, 5000)).toBe("no answer");
  });

  test("with the cache of the build in use gone, a reload opens the app, and in-use names the worker's build", async ({
    page,
  }) => {
    await firstVisit(page);
    const { id, version } = await workerBuild(page);

    // As after the browser cleared the caches of an older build that was in use.
    await page.evaluate(async (ownId) => {
      await caches.delete(`build-${ownId}`);
      const scope = (await navigator.serviceWorker.ready).scope;
      await (
        await caches.open("app-state")
      ).put(new URL("in-use", scope), Response.json({ id: "0123456789ab", version: "1.4" }));
    }, id);

    await page.reload();
    await expect(main(page).getByRole("heading", { name: "Transactions", level: 1 })).toBeVisible();
    await expect.poll(() => inUse(page)).toEqual({ id, version });
  });
});

/** A context of the test's own at `server`, with workers allowed and the network guard on it. */
async function contextAt(browser: Browser, server: VersionsServer) {
  const context = await browser.newContext({
    baseURL: server.url,
    serviceWorkers: "allow",
    locale: "en-US",
    acceptDownloads: true,
  });
  const page = await context.newPage();
  const check = await guardNetwork(context, page, server.url);
  return { context, page, check };
}

test.describe("publishing a build (e2e/support/versions.ts)", () => {
  // These tests publish builds of their own, which only the local build allows (R-30).
  test.skip(() => !!process.env.BASE_URL, "publishes builds of its own");

  let versions: Record<VersionName, Version>;
  let server: VersionsServer;

  test.beforeAll(async ({}, testInfo) => {
    // The first worker to get here builds the next versions, which takes a while.
    testInfo.setTimeout(300_000);
    versions = prepareVersions();
    server = await startVersionsServer(versions, VERSIONS_PORT + testInfo.parallelIndex);
  });

  test.afterAll(async () => {
    await server?.close();
  });

  test.beforeEach(() => {
    server.publish("current");
  });

  test("an index.html of another build fails the install and leaves no build cache of its own", async ({
    browser,
  }) => {
    server.publish("current", { indexOf: "next" });
    const { context, page, check } = await contextAt(browser, server);
    try {
      await page.goto(server.url);
      const state = await page.evaluate(async () => {
        const registration = await navigator.serviceWorker.register("./sw.js", { scope: "./" });
        const worker = registration.installing ?? registration.waiting ?? registration.active!;
        if (worker.state === "redundant" || worker.state === "activated") return worker.state;
        return new Promise<string>((resolve) =>
          worker.addEventListener("statechange", () => {
            if (worker.state === "redundant" || worker.state === "activated") {
              resolve(worker.state);
            }
          }),
        );
      });
      expect(state).toBe("redundant");
      expect(await buildCaches(page)).toEqual([]);
      await check();
    } finally {
      await context.close();
    }
  });
});

test.describe("without a worker", () => {
  test.skip(() => !!process.env.BASE_URL, "starts a dev server of its own");

  let devServer: { url: string; close(): Promise<void> };

  test.beforeAll(async ({}, testInfo) => {
    testInfo.setTimeout(120_000);
    const { createServer } = await import("vite");
    const port = 5180 + testInfo.parallelIndex;
    const server = await createServer({ server: { port, strictPort: true } });
    await server.listen();
    devServer = { url: `http://localhost:${port}/`, close: () => server.close() };
  });

  test.afterAll(async () => {
    await devServer?.close();
  });

  test("the dev server registers none (contracts/app-updates.md, the page's side)", async ({
    browser,
  }) => {
    const context: BrowserContext = await browser.newContext({ serviceWorkers: "allow" });
    const page = await context.newPage();
    const check = await guardNetwork(context, page, devServer.url);
    try {
      await page.goto(devServer.url);
      await expect(
        main(page).getByRole("heading", { name: "Transactions", level: 1 }),
      ).toBeVisible();
      await page.reload();
      await expect(
        main(page).getByRole("heading", { name: "Transactions", level: 1 }),
      ).toBeVisible();
      await page.waitForTimeout(2000);
      expect(await workerControls(page)).toBe(false);
      expect(
        await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length),
      ).toBe(0);
      await check();
    } finally {
      await context.close();
    }
  });
});
