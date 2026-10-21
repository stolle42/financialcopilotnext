import type { Page } from "@playwright/test";
import { expect } from "./test";

// The service worker's side, as a test reads it (contracts/app-updates.md).

/** A build as the worker's caches and messages name it. */
export interface BuildName {
  id: string;
  version: string;
}

/** The build the page names in its `app-build` meta. */
export async function pageBuild(page: Page): Promise<string> {
  const id = await page.locator('meta[name="app-build"]').getAttribute("content");
  expect(id).toMatch(/^[0-9a-f]{12}$/);
  return id!;
}

/** Waits until `sw.js` controls the page. */
export async function waitForWorker(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const controller = navigator.serviceWorker?.controller;
    return !!controller && new URL(controller.scriptURL).pathname.endsWith("/sw.js");
  });
}

/** Whether a worker controls the page. */
export function workerControls(page: Page): Promise<boolean> {
  return page.evaluate(() => !!navigator.serviceWorker?.controller);
}

/** The `in-use` entry of `app-state`, or undefined without one. */
export function inUse(page: Page): Promise<BuildName | undefined> {
  return page.evaluate(async () => {
    if (!(await caches.has("app-state"))) return undefined;
    const registration = await navigator.serviceWorker.ready;
    const entry = await (
      await caches.open("app-state")
    ).match(new URL("in-use", registration.scope));
    return entry ? ((await entry.json()) as BuildName) : undefined;
  });
}

/** The paths, relative to the app's address, that the cache `build-<id>` holds, in path order. */
export function cachedFiles(page: Page, id: string): Promise<string[]> {
  return page.evaluate(async (buildId) => {
    const scope = (await navigator.serviceWorker.ready).scope;
    const requests = await (await caches.open(`build-${buildId}`)).keys();
    return requests.map((request) => request.url.slice(scope.length)).sort();
  }, id);
}

/** The names of the caches the worker wrote for builds. */
export function buildCaches(page: Page): Promise<string[]> {
  return page.evaluate(async () =>
    (await caches.keys()).filter((name) => name.startsWith("build-")),
  );
}

/**
 * Posts `message` to the worker that controls the page, with a port for the answer
 * (contracts/app-updates.md, messages), and gives the answer, or "no answer" after `waitMs`.
 */
export function askWorker(page: Page, message: unknown, waitMs = 5000): Promise<unknown> {
  return page.evaluate(
    ([body, wait]) =>
      new Promise((resolve) => {
        const channel = new MessageChannel();
        const timer = setTimeout(() => resolve("no answer"), wait);
        channel.port1.onmessage = (event) => {
          clearTimeout(timer);
          resolve(event.data);
        };
        navigator.serviceWorker.controller!.postMessage(body, [channel.port2]);
      }),
    [message, waitMs] as const,
  );
}
