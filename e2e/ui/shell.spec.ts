import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import type { Settings } from "../../src/domain/types";
import { dataSharingWarning } from "../../src/ui/messages";
import { storedRecords } from "../support/app";
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

test.describe("data sharing (FR-095, FR-061)", () => {
  const sharingSwitch = (page: Page) =>
    page.getByRole("banner").getByRole("switch", { name: "Data sharing" });
  const warning = (page: Page) => page.getByRole("alert").filter({ hasText: dataSharingWarning });
  const storedSettings = async (page: Page) => (await storedRecords<Settings>(page, "settings"))[0];

  test("starts off, without a warning", async ({ page }) => {
    await page.goto("/");
    await expect(sharingSwitch(page)).not.toBeChecked();
    await expect(warning(page)).toHaveCount(0);
  });

  test("turned on, warns on every screen what goes to n8n and Anthropic, and stays on after a reload", async ({
    page,
  }) => {
    await page.goto("/");
    await sharingSwitch(page).click();

    await expect(sharingSwitch(page)).toBeChecked();
    await expect(warning(page)).toBeVisible();
    await expect(warning(page)).toContainText("Anthropic");
    for (const route of [
      "/#/categories",
      "/#/accounts",
      "/#/budgets",
      "/#/backup",
      "/#/insights",
    ]) {
      await page.goto(route);
      await expect(warning(page)).toBeVisible();
    }
    await page.goto("/#/import");
    await expect(warning(page)).toBeVisible();

    await page.reload();
    await expect(sharingSwitch(page)).toBeChecked();
    await expect(warning(page)).toBeVisible();
    expect(await storedSettings(page)).toMatchObject({ dataSharing: true });
  });

  test("Turn off in the warning turns data sharing off again", async ({ page }) => {
    await page.goto("/");
    await sharingSwitch(page).click();

    await warning(page).getByRole("button", { name: "Turn off" }).click();

    await expect(warning(page)).toHaveCount(0);
    await expect(sharingSwitch(page)).not.toBeChecked();
    await expect.poll(async () => await storedSettings(page)).not.toHaveProperty("dataSharing");
    await page.reload();
    await expect(sharingSwitch(page)).not.toBeChecked();
  });

  test("the switch turns data sharing off again too", async ({ page }) => {
    await page.goto("/");
    await sharingSwitch(page).click();
    await expect(warning(page)).toBeVisible();

    await sharingSwitch(page).click();

    await expect(warning(page)).toHaveCount(0);
    await expect.poll(async () => await storedSettings(page)).not.toHaveProperty("dataSharing");
  });

  // The network guard fails this test on any request outside the app's origin.
  test("turning it on sends nothing by itself", async ({ page }) => {
    await page.goto("/");
    await sharingSwitch(page).click();
    await page.goto("/#/import");
    await page.reload();
    await expect(warning(page)).toBeVisible();
  });
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
