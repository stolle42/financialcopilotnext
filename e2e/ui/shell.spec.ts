import type { Locator } from "@playwright/test";
import { readFileSync } from "node:fs";
import { chatButton } from "../support/ai";
import { expect, test } from "../support/test";

// contracts/ui.md, shell and navigation. The network guard also fails these tests on any
// Content-Security-Policy violation (R-19).

test("opens on Transactions with the app's name and the sidebar", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("banner")).toContainText("Financial Copilot");
  await expect(page.getByRole("navigation", { name: "Screens" })).toBeVisible();
  await expect(page.getByRole("main").getByRole("heading", { name: "Transactions" })).toBeVisible();
});

test("shows the app's version, as MAJOR.MINOR of package.json (FR-088)", async ({ page }) => {
  const { version } = JSON.parse(
    readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
  ) as { version: string };
  const majorMinor = version.split(".").slice(0, 2).join(".");
  await page.goto("/");
  await expect(page.getByRole("banner")).toContainText(`Version ${majorMinor}`);
});

test("lists the screens in one flat list, without group headings", async ({ page }) => {
  await page.goto("/");
  // Wait for the shell first, so the absence checks below cannot pass before it renders.
  await expect(page.getByRole("main").getByRole("heading", { name: "Transactions" })).toBeVisible();
  const navigation = page.getByRole("navigation", { name: "Screens" });
  await expect(navigation.getByText("Main", { exact: true })).toHaveCount(0);
  await expect(navigation.getByText("Manage", { exact: true })).toHaveCount(0);
});

test("opens Transactions for an unknown link (FR-063)", async ({ page }) => {
  await page.goto("/#/nowhere");
  await expect(page.getByRole("main").getByRole("heading", { name: "Transactions" })).toBeVisible();
});

test("holds no data-sharing switch; AI features are turned on in Settings (FR-095)", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("banner").getByRole("button", { name: "Add transaction" }),
  ).toBeVisible();
  await expect(page.getByRole("switch", { name: "Data sharing" })).toHaveCount(0);
});
test("carries a Content-Security-Policy that keeps everything on the app's origin", async ({
  page,
}) => {
  await page.goto("/");
  const policy = await page
    .locator('meta[http-equiv="Content-Security-Policy"]')
    .getAttribute("content");
  expect(policy).toContain("default-src 'self'");
  expect(policy).toContain("style-src 'self'");
  expect(policy).not.toContain("unsafe-inline");
});

test("lets the page connect only to the app's own origin, where the AI route is (R-19, R-24)", async ({
  page,
}) => {
  await page.goto("/");
  const policy = await page
    .locator('meta[http-equiv="Content-Security-Policy"]')
    .getAttribute("content");
  const directives = (policy ?? "").split(";").map((directive) => directive.trim());
  expect(directives.filter((directive) => directive.startsWith("connect-src"))).toEqual([
    "connect-src 'self'",
  ]);
});

test.describe("the finance chat's button (contracts/ui.md, finance chat; FR-100)", () => {
  const screens = [
    { path: "/", heading: "Transactions" },
    { path: "/#/import", heading: "Import" },
    { path: "/#/import/profiles/new", heading: "New profile" },
    { path: "/#/categories", heading: "Categories" },
    { path: "/#/accounts", heading: "Accounts" },
    { path: "/#/budgets", heading: "Budgets" },
    { path: "/#/backup", heading: "Backup" },
    { path: "/#/insights", heading: "Insights" },
    { path: "/#/settings", heading: "Settings" },
  ];
  const background = (locator: Locator) =>
    locator.evaluate((element) => getComputedStyle(element).backgroundColor);

  test("shows on every screen at the bottom right, with its name as text in the colour of Add transaction", async ({
    page,
  }) => {
    const addTransaction = page
      .getByRole("banner")
      .getByRole("button", { name: "Add transaction" });
    for (const { path, heading } of screens) {
      await page.goto(path);
      await expect(
        page.getByRole("main").getByRole("heading", { name: heading, level: 1 }),
      ).toBeVisible();

      await expect(chatButton(page), heading).toBeVisible();
      await expect(chatButton(page), heading).toHaveText("Ask about your finances");
      expect(await background(chatButton(page)), heading).toBe(await background(addTransaction));
      const box = (await chatButton(page).boundingBox())!;
      const viewport = page.viewportSize()!;
      expect(viewport.width - (box.x + box.width), heading).toBeLessThanOrEqual(48);
      expect(viewport.height - (box.y + box.height), heading).toBeLessThanOrEqual(48);
    }
  });

  test("leaves a screen's last content above it, once scrolled to the end", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 480 });
    await page.goto("/#/categories");
    await expect(
      page.getByRole("main").getByRole("heading", { name: "Categories", level: 1 }),
    ).toBeVisible();
    await expect(chatButton(page)).toBeVisible();

    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);

    const contentEnd = await page
      .getByRole("main")
      .evaluate((main) =>
        Math.max(
          ...Array.from(
            main.querySelectorAll("*"),
            (element) => element.getBoundingClientRect().bottom,
          ),
        ),
      );
    const button = (await chatButton(page).boundingBox())!;
    expect(contentEnd).toBeLessThanOrEqual(button.y);
  });
});
