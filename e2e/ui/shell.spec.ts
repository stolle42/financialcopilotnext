import type { Locator, Page } from "@playwright/test";
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

test.describe("the manifest, for installing the app (contracts/app-updates.md; FR-122, R-30)", () => {
  interface Icon {
    src: string;
    sizes: string;
    type?: string;
    purpose?: string;
  }
  interface Manifest {
    name: string;
    short_name: string;
    start_url: string;
    scope: string;
    display: string;
    background_color: string;
    theme_color: string;
    icons: Icon[];
  }

  /** The manifest the page links, and its address. */
  async function linkedManifest(page: Page): Promise<{ url: URL; manifest: Manifest }> {
    await page.goto("/");
    const link = page.locator('link[rel="manifest"]');
    await expect(link).toHaveCount(1);
    const href = (await link.getAttribute("href"))!;
    const url = new URL(href, page.url());
    const response = await page.request.get(url.href);
    expect(response.ok()).toBe(true);
    return { url, manifest: (await response.json()) as Manifest };
  }

  /** "#5a70ad" as the browser resolves a colour, "rgb(90, 112, 173)". */
  function rgb(hex: string): string {
    const [r, g, b] = [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16));
    return `rgb(${r}, ${g}, ${b})`;
  }

  /** The width and height a PNG states in its header, or undefined for any other file. */
  function pngSize(bytes: Buffer): { width: number; height: number } | undefined {
    const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    if (bytes.length < 24 || !bytes.subarray(0, 8).equals(signature)) return undefined;
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }

  test("is linked with a relative address and loads from the app's origin as JSON with exactly the contract's fields", async ({
    page,
    baseURL,
  }) => {
    const { url, manifest } = await linkedManifest(page);
    expect(await page.locator('link[rel="manifest"]').getAttribute("href")).not.toMatch(
      /^(\/|[a-z]+:)/i,
    );
    expect(url.origin).toBe(new URL(baseURL!).origin);
    expect(url.pathname).toMatch(/\/manifest\.webmanifest$/);

    expect(Object.keys(manifest).sort()).toEqual(
      [
        "background_color",
        "display",
        "icons",
        "name",
        "scope",
        "short_name",
        "start_url",
        "theme_color",
      ].sort(),
    );
    expect(manifest).toMatchObject({
      name: "Financial Copilot",
      short_name: "Financial Copilot",
      start_url: "./",
      scope: "./",
      display: "standalone",
    });
  });

  test("names the canvas as background and the primary colour as theme, as the page shows them (R-27)", async ({
    page,
  }) => {
    const { manifest } = await linkedManifest(page);
    const canvas = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const primary = await page
      .getByRole("banner")
      .getByRole("button", { name: "Add transaction" })
      .evaluate((button) => getComputedStyle(button).backgroundColor);
    expect(rgb(manifest.background_color)).toBe(canvas);
    expect(rgb(manifest.theme_color)).toBe(primary);
  });

  test("lists icons of 192 and 512 pixels that load from the app's origin as PNGs of their stated size, one of 512 maskable", async ({
    page,
    baseURL,
  }) => {
    const { url, manifest } = await linkedManifest(page);
    expect(manifest.icons.map((icon) => icon.sizes).sort()).toEqual(
      ["192x192", "512x512", "512x512"].sort(),
    );
    for (const icon of manifest.icons) {
      const iconUrl = new URL(icon.src, url);
      expect(iconUrl.origin, icon.src).toBe(new URL(baseURL!).origin);
      const response = await page.request.get(iconUrl.href);
      expect(response.ok(), icon.src).toBe(true);
      expect(response.headers()["content-type"], icon.src).toMatch(/^image\/png/);
      const [width, height] = icon.sizes.split("x").map(Number);
      expect(pngSize(await response.body()), icon.src).toEqual({ width, height });
    }
    expect(
      manifest.icons.filter((icon) => icon.sizes === "512x512" && icon.purpose === "maskable"),
    ).toHaveLength(1);
  });

  test("holds only relative paths, so the app installs from any address (R-20)", async ({
    page,
  }) => {
    const { manifest } = await linkedManifest(page);
    const paths = [manifest.start_url, manifest.scope, ...manifest.icons.map((icon) => icon.src)];
    for (const path of paths) expect(path, path).not.toMatch(/^(\/|[a-z]+:)/i);
  });
});

test.describe("the service worker's header (contracts/app-updates.md, the build; R-30)", () => {
  /** The build that sw.js names in its first line. */
  async function workerBuild(page: Page) {
    const response = await page.request.get(new URL("sw.js", page.url()).href);
    expect(response.ok()).toBe(true);
    const [header = ""] = (await response.text()).split("\n");
    expect(header).toMatch(/^self\.BUILD = \{.*\};$/);
    return JSON.parse(header.slice("self.BUILD = ".length, -1)) as {
      id: string;
      version: string;
      files: string[];
    };
  }

  test("the page names in app-build the build that sw.js, from the app's origin, starts with", async ({
    page,
  }) => {
    await page.goto("/");
    const id = await page.locator('meta[name="app-build"]').getAttribute("content");
    expect(id).toMatch(/^[0-9a-f]{12}$/);
    expect((await workerBuild(page)).id).toBe(id);
  });

  test("sw.js names the version the header shows (FR-088)", async ({ page }) => {
    await page.goto("/");
    const { version } = await workerBuild(page);
    await expect(page.getByRole("banner")).toContainText(`Version ${version}`);
    expect(version).toMatch(/^\d+\.\d+$/);
  });
});
