import { expect, test } from "../support/test";

// contracts/ui.md, shell and navigation. The network guard also fails these tests on any
// Content-Security-Policy violation (R-19).

test("opens on Transactions with the app's name and the sidebar", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("banner")).toContainText("Financial Copilot");
  await expect(page.getByRole("navigation", { name: "Screens" })).toBeVisible();
  await expect(page.getByRole("main").getByRole("heading", { name: "Transactions" })).toBeVisible();
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
