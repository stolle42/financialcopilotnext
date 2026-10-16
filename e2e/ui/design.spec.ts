import type { Locator, Page } from "@playwright/test";
import { chat, chatButton } from "../support/ai";
import { addAccount, addTransaction, putBudgets, reconcileAccount } from "../support/app";
import { importWithProfile, saveMyBankProfile } from "../support/import";
import { euros, expect, setToday, test } from "../support/test";

// contracts/ui.md, look; FR-112 – FR-116; R-27. Colours are compared as the browser resolves the
// values of ui.md.

const CANVAS = "rgb(238, 241, 247)";
const CARD = "rgb(249, 250, 252)";
const INK = "rgb(43, 51, 70)";
const PRIMARY = "rgb(90, 112, 173)";
const TRANSPARENT = "rgba(0, 0, 0, 0)";
// The corners of ui.md: a card's, a notification's, and a control's or menu's.
const CARD_CORNERS = "22px";
const NOTIFICATION_CORNERS = "18px";
const CONTROL_CORNERS = "14px";

const main = (page: Page) => page.getByRole("main");
const banner = (page: Page) => page.getByRole("banner");
const sidebar = (page: Page) => page.getByRole("navigation", { name: "Screens" });

/** Every screen with a heading of its own (contracts/ui.md, shell and navigation). */
const SCREENS = [
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

async function open(page: Page, path: string, heading: string) {
  await page.goto(path);
  await expect(main(page).getByRole("heading", { name: heading, level: 1 })).toBeVisible();
}

/** A computed style of the element that `locator` finds. */
function style(locator: Locator, property: string): Promise<string> {
  return locator.evaluate(
    (element, name) => getComputedStyle(element).getPropertyValue(name),
    property,
  );
}

/** The first family of the element's font stack, without quotes. */
async function face(locator: Locator): Promise<string> {
  const [first = ""] = (await style(locator, "font-family")).split(",");
  return first.replaceAll('"', "").trim();
}

/**
 * The contrast of the element's text with what lies behind it, as WCAG 2.2 computes it: each
 * colour as the browser resolves it, and a translucent background laid over the ones behind it,
 * down to white.
 */
function contrast(locator: Locator): Promise<number> {
  return locator.evaluate((element) => {
    type Rgba = [number, number, number, number];
    // A canvas turns any colour the browser can resolve into sRGB values.
    const context = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("The browser offers no 2D canvas");
    const rgba = (colour: string): Rgba => {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = colour;
      context.fillRect(0, 0, 1, 1);
      const [r = 0, g = 0, b = 0, a = 0] = context.getImageData(0, 0, 1, 1).data;
      return [r, g, b, a / 255];
    };
    const over = ([r, g, b, a]: Rgba, [R, G, B]: Rgba): Rgba => [
      r * a + R * (1 - a),
      g * a + G * (1 - a),
      b * a + B * (1 - a),
      1,
    ];
    const layers: Rgba[] = [];
    for (let node: Element | null = element; node; node = node.parentElement) {
      const layer = rgba(getComputedStyle(node).backgroundColor);
      if (layer[3] > 0) layers.push(layer);
      if (layer[3] === 1) break;
    }
    const background = layers.reduceRight<Rgba>(
      (behind, layer) => over(layer, behind),
      [255, 255, 255, 1],
    );
    const text = over(rgba(getComputedStyle(element).color), background);
    const luminance = ([r, g, b]: Rgba) => {
      const [R = 0, G = 0, B = 0] = [r, g, b].map((channel) => {
        const c = channel / 255;
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * R + 0.7152 * G + 0.0722 * B;
    };
    const [lighter = 0, darker = 0] = [luminance(text), luminance(background)].sort(
      (a, b) => b - a,
    );
    return (lighter + 0.05) / (darker + 0.05);
  });
}

test.describe("palette and type (FR-112, FR-113, FR-116)", () => {
  test("sets every screen on the canvas, with text in ink", async ({ page }) => {
    for (const { path, heading } of SCREENS) {
      await open(page, path, heading);
      expect(await style(page.locator("body"), "background-color"), heading).toBe(CANVAS);
      expect(await style(page.locator("body"), "color"), heading).toBe(INK);
    }
  });

  test("sets text in Figtree, and headings and the app's name in Fraunces at the sizes of ui.md", async ({
    page,
  }) => {
    for (const { path, heading } of SCREENS) {
      await open(page, path, heading);
      expect(await face(main(page)), heading).toMatch(/^Figtree\b/);
      const title = main(page).getByRole("heading", { level: 1 });
      expect(await face(title), heading).toMatch(/^Fraunces\b/);
      expect(await style(title, "font-size"), heading).toBe("30px");
      for (const section of await main(page).getByRole("heading", { level: 2 }).all()) {
        const name = `${heading}: ${await section.textContent()}`;
        expect(await face(section), name).toMatch(/^Fraunces\b/);
        expect(await style(section, "font-size"), name).toBe("20px");
      }
    }
    const appName = banner(page).getByText("Financial Copilot", { exact: true });
    expect(await face(appName)).toMatch(/^Fraunces\b/);
    expect(await style(appName, "font-size")).toBe("20px");
  });

  test("titles the transaction form and the chat's panel in Fraunces", async ({ page }) => {
    await open(page, "/", "Transactions");
    await banner(page).getByRole("button", { name: "Add transaction" }).click();
    const form = page.getByRole("dialog", { name: "Add transaction" });
    const formTitle = form.getByRole("heading", { name: "Add transaction" });
    expect(await face(formTitle)).toMatch(/^Fraunces\b/);
    expect(await style(formTitle, "font-size")).toBe("20px");
    await form.getByRole("button", { name: "Cancel" }).click();
    await expect(form).toHaveCount(0);

    await chatButton(page).click();
    const chatTitle = chat(page).getByRole("heading", { name: "Ask about your finances" });
    expect(await face(chatTitle)).toMatch(/^Fraunces\b/);
    expect(await style(chatTitle, "font-size")).toBe("20px");
  });

  test("bundles both fonts, which load from the app's own origin and swap in once loaded", async ({
    page,
    baseURL,
  }) => {
    await open(page, "/", "Transactions");
    // The faces the page has loaded, with how each shows text while it loads.
    const loaded = () =>
      page.evaluate(() => {
        const faces: { family: string; display: string }[] = [];
        document.fonts.forEach((font) => {
          if (font.status === "loaded") {
            faces.push({ family: font.family.replaceAll('"', ""), display: font.display });
          }
        });
        return faces;
      });
    await expect
      .poll(async () => (await loaded()).map((font) => font.family))
      .toEqual(
        expect.arrayContaining([
          expect.stringMatching(/^Figtree\b/),
          expect.stringMatching(/^Fraunces\b/),
        ]),
      );
    for (const font of await loaded()) expect(font.display, font.family).toBe("swap");

    const files = await page.evaluate(() =>
      performance
        .getEntriesByType("resource")
        .map((entry) => entry.name)
        .filter((name) => new URL(name).pathname.endsWith(".woff2")),
    );
    expect(files.length).toBeGreaterThanOrEqual(2);
    for (const file of files) expect(new URL(file).origin, file).toBe(new URL(baseURL!).origin);
  });

  test("keeps text at 4.5:1 against its background at least", async ({ page }) => {
    await setToday(page, "2026-09-03");
    await page.goto("/");
    await addAccount(page, "Credit card", "-50.00");
    await addTransaction(page, {
      kind: "Income",
      amount: "500.00",
      category: "Salary",
      description: "Payroll",
    });

    await open(page, "/", "Transactions");
    const row = main(page).getByRole("list", { name: "Transactions" }).getByRole("listitem");
    const texts: [string, Locator][] = [
      ["text on a card", row.getByText("Payroll")],
      ["secondary text on a card", row.getByText("Sep 3, 2026")],
      ["a positive amount", row.getByText(`+${euros(50000)}`)],
      ["secondary text on the canvas", banner(page).getByText(/^Version /)],
      ["the primary action's label", banner(page).getByRole("button", { name: "Add transaction" })],
      ["a sidebar entry", sidebar(page).getByRole("link", { name: "Budgets" })],
      ["the current sidebar entry", sidebar(page).getByRole("link", { name: "Transactions" })],
    ];
    for (const [name, text] of texts) {
      expect(await contrast(text), name).toBeGreaterThanOrEqual(4.5);
    }

    await open(page, "/#/accounts", "Accounts");
    const negativeBalance = main(page).getByRole("cell", { name: euros(-5000) });
    expect(await contrast(negativeBalance), "danger text").toBeGreaterThanOrEqual(4.5);

    await open(page, "/#/budgets", "Budgets");
    const hint = main(page).getByText(/^A limit applies to every month/);
    expect(await contrast(hint), "secondary text on the canvas").toBeGreaterThanOrEqual(4.5);
  });
});

test.describe("cards (FR-114)", () => {
  /** Checks that the element is a card of ui.md: card colour, 22px corners, raised by a shadow. */
  async function expectCard(locator: Locator, name: string) {
    expect(await style(locator, "background-color"), name).toBe(CARD);
    expect(await style(locator, "border-top-left-radius"), name).toBe(CARD_CORNERS);
    expect(await style(locator, "box-shadow"), name).not.toBe("none");
  }

  test("puts Transactions' empty state, and then its list, on a card", async ({ page }) => {
    await open(page, "/", "Transactions");
    await expectCard(
      main(page)
        .getByText(/^No transactions yet/)
        .locator(".."),
      "empty state",
    );

    await addTransaction(page, { amount: "4.50", category: "Eating out" });
    const list = main(page).getByRole("list", { name: "Transactions" });
    await expectCard(list.locator(".."), "transaction list");
  });

  test("puts the lists of Categories and Budgets, and the table of Accounts, on cards", async ({
    page,
  }) => {
    await open(page, "/#/categories", "Categories");
    await expectCard(main(page).getByRole("tabpanel").getByRole("list"), "categories");
    await open(page, "/#/accounts", "Accounts");
    await expectCard(main(page).getByRole("table").locator(".."), "accounts");
    await open(page, "/#/budgets", "Budgets");
    await expectCard(main(page).getByRole("list"), "budgets");
  });

  test("puts each section of Backup, Insights and Settings on a card, and the period on the canvas", async ({
    page,
  }) => {
    const screens = [
      {
        path: "/#/backup",
        heading: "Backup",
        sections: ["Save a backup", "Restore from a backup"],
      },
      {
        path: "/#/insights",
        heading: "Insights",
        sections: ["Spending over time", "Expenses by category", "Income by category", "Budgets"],
      },
      { path: "/#/settings", heading: "Settings", sections: ["AI features"] },
    ];
    for (const { path, heading, sections } of screens) {
      await open(page, path, heading);
      for (const section of sections) {
        await expectCard(main(page).getByRole("region", { name: section }), section);
      }
    }
    const period = main(page).getByRole("region", { name: "Period" });
    await open(page, "/#/insights", "Insights");
    expect(await style(period, "background-color"), "a toolbar").toBe(TRANSPARENT);
  });

  test("puts the sections of Import and the profile editor's fields and preview on cards", async ({
    page,
  }) => {
    await open(page, "/#/import", "Import");
    for (const section of ["Import a file", "Mapping profiles"]) {
      await expectCard(main(page).getByRole("region", { name: section }), section);
    }
    await open(page, "/#/import/profiles/new", "New profile");
    await expectCard(main(page).locator('[data-slot="field-group"]').first(), "profile fields");
    await expectCard(main(page).getByRole("region", { name: "Preview" }), "preview");
  });

  test("puts review's batch, each of its groups and its plain rows on cards", async ({ page }) => {
    await saveMyBankProfile(page);
    await importWithProfile(page, { account: "Cash", file: "mybank-2026-08.csv" });
    await expect(
      main(page).getByRole("heading", { name: "Review import", level: 1 }),
    ).toBeVisible();

    await expectCard(main(page).getByRole("region", { name: "Batch" }), "batch");
    const rows = main(page).getByRole("region", { name: "Rows to review" }).locator(":scope > *");
    await expect(rows.first()).toBeVisible();
    for (const group of await rows.all()) {
      await expectCard(group, (await group.getAttribute("aria-label")) ?? "rows");
    }
  });

  test("shows the sidebar as a card of pills, whose current entry is on the canvas", async ({
    page,
  }) => {
    await open(page, "/#/categories", "Categories");
    await expectCard(sidebar(page), "sidebar");
    const current = sidebar(page).getByRole("link", { name: "Categories" });
    await expect(current).toHaveAttribute("aria-current", "page");
    expect(await style(current, "background-color")).toBe(CANVAS);
    expect(await style(current, "border-top-left-radius")).toBe(CONTROL_CORNERS);
    for (const name of ["Transactions", "Accounts", "Budgets", "Backup", "Insights", "Settings"]) {
      const entry = sidebar(page).getByRole("link", { name });
      expect(await style(entry, "background-color"), name).toBe(TRANSPARENT);
      expect(await style(entry, "border-top-left-radius"), name).toBe(CONTROL_CORNERS);
    }
  });

  test("sets the header on the canvas, with no line below it", async ({ page }) => {
    await open(page, "/", "Transactions");
    expect(await style(banner(page), "background-color")).toBe(TRANSPARENT);
    expect(await style(banner(page), "border-bottom-width")).toBe("0px");
  });

  test("raises the transaction form, a select's options, a confirmation, the chat's panel and a notification in the card colour", async ({
    page,
  }) => {
    await open(page, "/", "Transactions");
    await banner(page).getByRole("button", { name: "Add transaction" }).click();
    const form = page.getByRole("dialog", { name: "Add transaction" });
    await expectCard(form, "transaction form");

    await form.getByLabel("Category", { exact: true }).click();
    const options = page.locator('[data-slot="select-content"]');
    await expect(options).toBeVisible();
    expect(await style(options, "background-color"), "options").toBe(CARD);
    expect(await style(options, "border-top-left-radius"), "options").toBe(CONTROL_CORNERS);
    expect(await style(options, "box-shadow"), "options").not.toBe("none");
    await page.keyboard.press("Escape");
    await expect(options).toHaveCount(0);
    await form.getByRole("button", { name: "Cancel" }).click();
    await expect(form).toHaveCount(0);

    await open(page, "/#/categories", "Categories");
    await main(page).getByRole("button", { name: "Delete Eating out" }).click();
    const confirmation = page.getByRole("alertdialog");
    await expectCard(confirmation, "confirmation");
    await confirmation.getByRole("button", { name: "Cancel" }).click();
    await expect(confirmation).toHaveCount(0);

    await chatButton(page).click();
    await expect(chat(page)).toBeVisible();
    expect(await style(chat(page), "background-color"), "chat").toBe(CARD);
    expect(await style(chat(page), "box-shadow"), "chat").not.toBe("none");
    await page.keyboard.press("Escape");
    await expect(chat(page)).toHaveCount(0);

    await reconcileAccount(page, "Cash", "10.00");
    const notification = page.locator('[data-slot="toast"]');
    await expect(notification).toBeVisible();
    expect(await style(notification, "background-color"), "notification").toBe(CARD);
    expect(await style(notification, "border-top-left-radius"), "notification").toBe(
      NOTIFICATION_CORNERS,
    );
    expect(await style(notification, "box-shadow"), "notification").not.toBe("none");
  });
});

test.describe("controls (FR-115)", () => {
  test("fills Add transaction in the primary colour, raised and rounded, and Import CSV in the card colour", async ({
    page,
  }) => {
    await open(page, "/", "Transactions");
    const add = banner(page).getByRole("button", { name: "Add transaction" });
    expect(await style(add, "background-color")).toBe(PRIMARY);
    expect(await style(add, "border-top-left-radius")).toBe(CONTROL_CORNERS);
    expect(await style(add, "box-shadow")).not.toBe("none");
    const importCsv = main(page).getByRole("link", { name: "Import CSV" });
    expect(await style(importCsv, "background-color")).toBe(CARD);
    expect(await style(importCsv, "border-top-left-radius")).toBe(CONTROL_CORNERS);
  });

  test("rounds a date field and a select, filled in the card colour", async ({ page }) => {
    await page.goto("/");
    await addTransaction(page, { amount: "4.50", category: "Eating out" });
    const filters = main(page).getByRole("region", { name: "Filters" });
    for (const name of ["From", "Account"]) {
      const field = filters.getByLabel(name, { exact: true });
      expect(await style(field, "background-color"), name).toBe(CARD);
      expect(await style(field, "border-top-left-radius"), name).toBe(CONTROL_CORNERS);
    }
  });

  test("fills the pressed period preset in the primary colour", async ({ page }) => {
    await open(page, "/#/insights", "Insights");
    const pressed = main(page)
      .getByRole("region", { name: "Period" })
      .getByRole("button", { name: "This month", exact: true });
    await expect(pressed).toHaveAttribute("aria-pressed", "true");
    expect(await style(pressed, "background-color")).toBe(PRIMARY);
    expect(await style(pressed, "color")).toBe(CARD);
    expect(await style(pressed, "border-top-left-radius")).toBe(CONTROL_CORNERS);
  });

  test("shows the side tabs of Categories as a segmented control (FR-116)", async ({ page }) => {
    await open(page, "/#/categories", "Categories");
    const tabs = main(page).getByRole("tablist");
    expect(await style(tabs, "background-color")).toBe(CARD);
    expect(await style(tabs, "border-top-left-radius")).toBe(CONTROL_CORNERS);
    expect(await style(tabs, "box-shadow"), "the outline").not.toBe("none");
    const current = tabs.getByRole("tab", { selected: true });
    expect(await style(current, "background-color")).toBe(CANVAS);
    const other = tabs.getByRole("tab", { selected: false });
    expect(await style(other, "background-color")).toBe(TRANSPARENT);
    expect(await contrast(other), "the other tab's label").toBeGreaterThanOrEqual(4.5);
  });

  test("draws a budget bar 12px tall and fully rounded, on the canvas colour", async ({ page }) => {
    await setToday(page, "2026-09-03");
    await page.goto("/");
    await addTransaction(page, { amount: "150.50", category: "Groceries" });
    await putBudgets(page, { Groceries: 40000 });
    await open(page, "/#/insights", "Insights");
    const track = main(page)
      .getByRole("region", { name: "Budgets" })
      .getByRole("progressbar")
      .locator('[data-slot="progress-track"]');
    expect(await style(track, "height")).toBe("12px");
    expect(Number.parseFloat(await style(track, "border-top-left-radius"))).toBeGreaterThanOrEqual(
      6,
    );
    expect(await style(track, "background-color")).toBe(CANVAS);
  });
});
