import type {
  Browser,
  BrowserContext,
  Page,
  PlaywrightWorkerArgs,
  PlaywrightWorkerOptions,
} from "@playwright/test";
import { addTransaction } from "./support/app";
import { byKey, readDownload, saveBackup, storedData } from "./support/backup";
import { expect, guardNetwork, guardWatchesOnly, test } from "./support/test";
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

test.describe("Install app (FR-122, FR-075)", () => {
  const installApp = (page: Page) => banner(page).getByRole("button", { name: "Install app" });

  /**
   * Fires a `beforeinstallprompt` as Chrome and Edge do, whose `prompt()` counts its calls in
   * `window.promptCalls`, and gives whether the app prevented the browser's own offer.
   */
  function offerInstall(page: Page): Promise<boolean> {
    return page.evaluate(() => {
      const counter = window as unknown as { promptCalls: number };
      counter.promptCalls = 0;
      const event = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
        prompt: () => {
          counter.promptCalls++;
          return Promise.resolve();
        },
        userChoice: Promise.resolve({ outcome: "accepted", platform: "web" }),
      });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    });
  }

  const promptCalls = (page: Page) =>
    page.evaluate(() => (window as unknown as { promptCalls: number }).promptCalls);

  async function openApp(page: Page, path = "/") {
    await page.goto(path);
    await expect(banner(page).getByRole("button", { name: "Add transaction" })).toBeVisible();
  }

  test("scenario 2: while the browser offers it, Install app shows before Add transaction, and selecting it asks the browser's question once", async ({
    page,
  }) => {
    await openApp(page);
    expect(await offerInstall(page)).toBe(true);

    await expect(installApp(page)).toBeVisible();
    const names = await banner(page).getByRole("button").allTextContents();
    const install = names.findIndex((name) => name.includes("Install app"));
    const add = names.findIndex((name) => name.includes("Add transaction"));
    expect(install).toBeGreaterThanOrEqual(0);
    expect(install).toBeLessThan(add);

    await installApp(page).click();
    await expect.poll(() => promptCalls(page)).toBe(1);
    await expect(installApp(page)).toHaveCount(0);
  });

  test("scenario 2: once the app is installed, Install app goes", async ({ page }) => {
    await openApp(page);
    await offerInstall(page);
    await expect(installApp(page)).toBeVisible();

    await page.evaluate(() => window.dispatchEvent(new Event("appinstalled")));
    await expect(installApp(page)).toHaveCount(0);
    expect(await promptCalls(page)).toBe(0);
  });

  test("scenario 3: Firefox offers no Install app, and the app works as in Chrome", async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== "firefox", "Firefox only");
    await openApp(page);
    await addTransaction(page, { amount: "5.00", category: "Groceries", description: "Firefox" });
    await expect(ledgerRows(page).filter({ hasText: "Firefox" })).toHaveCount(1);
    await page.waitForTimeout(2000);
    await expect(installApp(page)).toHaveCount(0);
  });

  test("scenario 8: with persistent storage not granted, the Backup note says installing helps keep the data, and offers Install app (SC-017)", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      StorageManager.prototype.persist = () => Promise.resolve(false);
    });
    await openApp(page, "/#/backup");
    await offerInstall(page);

    await expect(main(page).getByText(/browser may (clear|delete)/i)).toBeVisible();
    await expect(main(page)).toContainText(/installing the app/i);
    const noteInstall = main(page).getByRole("button", { name: "Install app" });
    await expect(noteInstall).toBeVisible();

    await noteInstall.click();
    await expect.poll(() => promptCalls(page)).toBe(1);
    await expect(noteInstall).toHaveCount(0);
    await expect(installApp(page)).toHaveCount(0);
  });
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
    // In Firefox a page.route passes the worker by, so only Chromium can tell that it lets the
    // request go; and the guard there only watches, so the stand-in's request would fail the test.
    test.skip(({ browserName }) => browserName === "firefox", "Chromium only");

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

const updateNotice = (page: Page) => main(page).getByText(/is available/);
const headerVersion = (page: Page) => banner(page).getByText(/^Version /);

/**
 * Opens the browser with the profile in `dir`, at `server`, with workers allowed and the network
 * guard on it. Closing the context closes the browser; opening `dir` again opens the same profile.
 */
async function openProfile(
  playwright: PlaywrightWorkerArgs["playwright"],
  browserName: PlaywrightWorkerOptions["browserName"],
  dir: string,
  server: VersionsServer,
) {
  const context = await playwright[browserName].launchPersistentContext(dir, {
    baseURL: server.url,
    serviceWorkers: "allow",
    locale: "en-US",
    acceptDownloads: true,
  });
  const page = context.pages()[0] ?? (await context.newPage());
  const check = await guardNetwork(context, page, server.url, {
    watchOnly: guardWatchesOnly(browserName, "allow"),
  });
  return { context, page, check };
}

/** Waits until the worker that controls the page is the one of `build`. */
async function waitForOwn(page: Page, build: { id: string }) {
  await expect
    .poll(
      async () =>
        ((await askWorker(page, { type: "versions" })) as { own?: { id: string } }).own?.id,
      {
        timeout: 30_000,
      },
    )
    .toBe(build.id);
}

/** A context of the test's own at `server`, with workers allowed and the network guard on it. */
async function contextAt(browser: Browser, server: VersionsServer) {
  const context = await browser.newContext({
    baseURL: server.url,
    serviceWorkers: "allow",
    locale: "en-US",
    acceptDownloads: true,
  });
  const page = await context.newPage();
  const check = await guardNetwork(context, page, server.url, {
    watchOnly: guardWatchesOnly(browser.browserType().name(), "allow"),
  });
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

  // Possibly flaky: failed once in a full local run on a busy machine (2026-10-21), passed alone
  // and in CI. Not fixed; if it fails again, find the cause before rerunning.
  test("scenarios 5 – 7: with the next MINOR published, the old version stays through three openings, Backup saves a backup, and Update opens the new version with every record as before (FR-124, SC-019)", async ({
    playwright,
    browserName,
  }, testInfo) => {
    const dir = testInfo.outputPath("profile");
    const old = versions.current.build.version;
    const next = versions.next.build.version;
    let profile = await openProfile(playwright, browserName, dir, server);
    try {
      await firstVisit(profile.page);
      await addTransaction(profile.page, {
        amount: "12.00",
        category: "Groceries",
        description: "Before the update",
      });

      server.publish("next");
      for (let opening = 1; opening <= 3; opening++) {
        if (opening > 1) {
          await profile.check();
          await profile.context.close();
          profile = await openProfile(playwright, browserName, dir, server);
        }
        await profile.page.goto("/#/settings");
        await expect(updateNotice(profile.page)).toHaveText(
          `Version ${next} is available (you have ${old}). Make a backup first.`,
          { timeout: 30_000 },
        );
        await expect(headerVersion(profile.page)).toHaveText(`Version ${old}`);
      }
      const { page } = profile;

      // Scenario 6: Backup saves a backup as Save backup on the Backup screen does.
      const download = page.waitForEvent("download");
      await main(page).getByRole("button", { name: "Backup", exact: true }).click();
      const backup = await readDownload(await download);
      expect(backup.fileName).toMatch(/^financial-copilot-backup-\d{4}-\d{2}-\d{2}\.json$/);
      expect(backup.json.data.transactions.map((t) => t.description)).toContain(
        "Before the update",
      );
      const before = byKey(await storedData(page));

      // Scenario 7: Update opens the app on the new version, with every store as before.
      await main(page).getByRole("button", { name: "Update", exact: true }).click();
      await expect(headerVersion(page)).toHaveText(`Version ${next}`, { timeout: 30_000 });
      expect(await pageBuild(page)).toBe(versions.next.build.id);
      await expect
        .poll(() => inUse(page))
        .toEqual({
          id: versions.next.build.id,
          version: next,
        });
      await page.goto("/#/settings");
      await expect(main(page).getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();
      await expect(updateNotice(page)).toHaveCount(0);
      expect(byKey(await storedData(page))).toEqual(before);
      await profile.check();
    } finally {
      await profile.context.close();
    }
  });

  test("a build of the same MAJOR.MINOR with other files shows no notice (FR-124)", async ({
    playwright,
    browserName,
  }, testInfo) => {
    const old = versions.current.build.version;
    expect(versions.sameVersion.build.version).toBe(old);
    expect(versions.sameVersion.build.id).not.toBe(versions.current.build.id);
    const profile = await openProfile(
      playwright,
      browserName,
      testInfo.outputPath("profile"),
      server,
    );
    try {
      await firstVisit(profile.page);
      server.publish("sameVersion");
      await profile.page.goto("/#/settings");
      await waitForOwn(profile.page, versions.sameVersion.build);

      await profile.page.reload();
      await expect(
        main(profile.page).getByRole("heading", { name: "Settings", level: 1 }),
      ).toBeVisible();
      await expect(updateNotice(profile.page)).toHaveCount(0);
      await expect(
        main(profile.page).getByRole("button", { name: "Update", exact: true }),
      ).toHaveCount(0);
      await expect(headerVersion(profile.page)).toHaveText(`Version ${old}`);
      await profile.check();
    } finally {
      await profile.context.close();
    }
  });

  test("with two newer versions published, the notice names the newest and Update goes to it (FR-124)", async ({
    playwright,
    browserName,
  }, testInfo) => {
    const old = versions.current.build.version;
    const newest = versions.newest.build.version;
    const profile = await openProfile(
      playwright,
      browserName,
      testInfo.outputPath("profile"),
      server,
    );
    const { page } = profile;
    try {
      await firstVisit(page);
      server.publish("next");
      await page.goto("/#/settings");
      await waitForOwn(page, versions.next.build);
      server.publish("newest");
      await page.reload();
      await waitForOwn(page, versions.newest.build);

      await page.goto("/#/settings");
      await expect(updateNotice(page)).toHaveText(
        `Version ${newest} is available (you have ${old}). Make a backup first.`,
        { timeout: 30_000 },
      );
      await main(page).getByRole("button", { name: "Update", exact: true }).click();
      await expect(headerVersion(page)).toHaveText(`Version ${newest}`, { timeout: 30_000 });
      await expect
        .poll(() => inUse(page))
        .toEqual({
          id: versions.newest.build.id,
          version: newest,
        });
      await profile.check();
    } finally {
      await profile.context.close();
    }
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
