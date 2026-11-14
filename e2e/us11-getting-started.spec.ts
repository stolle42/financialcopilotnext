import type { Page } from "@playwright/test";
import type { Account, PendingBatch } from "../src/domain/types";
// Namespace imports, so the spec loads before FAQ and the chat's new lines exist.
import * as faqModule from "../src/ai/faq";
import * as catalogue from "../src/ui/messages";
import {
  chat,
  chatButton,
  questionField,
  askInChat,
  keyDialog,
  keyField,
  standInChat,
  standInKeyCheck,
  suggestions,
  TEST_KEY,
  turnOnAiFeatures,
} from "./support/ai";
import { fixture, screenIntro, storedRecords } from "./support/app";
import {
  expectEditorSettings,
  openEditorFor,
  previewDataRows,
  saveMyBankProfile,
  importWithProfile,
  startImport,
} from "./support/import";
import { expect, test } from "./support/test";

// The journey of User Story 11, scenarios 1–18: getting started without help (FR-132 – FR-141,
// SC-023; quickstart.md, US11). Stand-ins answer the key check and the chat in OpenAI's place, and
// the network guard fails a test on any other request outside the app's origin.

const main = (page: Page) => page.getByRole("main");
const importForm = (page: Page) => page.getByRole("region", { name: "Import a file" });
const sidebar = (page: Page) => page.getByRole("navigation", { name: "Screens" });

interface Topic {
  topic: string;
  questions: readonly { question: string; answer: string }[];
}
const FAQ = () => (faqModule as Record<string, unknown>).FAQ as readonly Topic[];
const faqAsText = () => ((faqModule as Record<string, unknown>).faqAsText as () => string)();

/** The chat's words while AI features are off, as the catalogue will hold them. */
const said = () =>
  catalogue.financeChat as unknown as {
    about: readonly string[];
    forExample: string;
    examples: readonly string[];
    charges: string;
    turnOn: string;
    faqLink: string;
  };

const IMPORT_QUESTION =
  "Entering every bank transaction by hand is a lot of work. How can I make it easier?";

/** Saves the format the open editor proposes under `name`, which imports the file. */
async function saveProposed(page: Page, name: string) {
  await main(page).getByLabel("Name", { exact: true }).fill(name);
  await main(page).getByRole("button", { name: "Save", exact: true }).click();
  await expect(page).toHaveURL(/#\/import\/review$/);
}

/** Discards the import waiting for review. */
async function discardImport(page: Page) {
  await page
    .getByRole("region", { name: "Finish review" })
    .getByRole("button", { name: "Discard" })
    .click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Discard import" }).click();
  await expect(page).toHaveURL(/#\/import$/);
}

test("1. every screen but Categories and Insights says under its heading, in one or two sentences, what it is for (FR-137)", async ({
  page,
}) => {
  const screens: [path: string, heading: string][] = [
    ["/", "Transactions"],
    ["/#/import", "Import"],
    ["/#/import/profiles/new", "New bank CSV format"],
    ["/#/accounts", "Accounts"],
    ["/#/budgets", "Budgets"],
    ["/#/backup", "Backup"],
    ["/#/settings", "Settings"],
    ["/#/faq", "Help"],
  ];
  for (const [path, heading] of screens) {
    await page.goto(path);
    await expect(main(page).getByRole("heading", { name: heading, level: 1 })).toBeVisible();
    await expect(screenIntro(page), heading).toBeVisible();
    const sentences = (await screenIntro(page).innerText())
      .split(/(?<=[.!?])\s+/)
      .filter((sentence) => sentence.trim() !== "");
    expect(sentences.length, heading).toBeGreaterThanOrEqual(1);
    expect(sentences.length, heading).toBeLessThanOrEqual(2);
  }
  await page.goto("/#/import/review");
  await expect(main(page).getByRole("button", { name: "Go to Import" })).toBeVisible();
  await expect(screenIntro(page)).toBeVisible();

  // Their headings say enough.
  const quiet: [path: string, heading: string][] = [
    ["/#/categories", "Categories"],
    ["/#/insights", "Insights"],
  ];
  for (const [path, heading] of quiet) {
    await page.goto(path);
    await expect(main(page).getByRole("heading", { name: heading, level: 1 })).toBeVisible();
    await expect(screenIntro(page), heading).toHaveCount(0);
  }
});

test("2. Import's Account select offers New account…, which creates Giro and chooses it (FR-132)", async ({
  page,
}) => {
  await page.goto("/#/import");
  await importForm(page).getByLabel("Account", { exact: true }).click();
  await expect(page.getByRole("option")).toHaveText(["Cash", "New account…"]);
  await page.getByRole("option", { name: "New account…" }).click();
  const dialog = page.getByRole("dialog", { name: "New account" });
  await dialog.getByLabel("Name").fill("Giro");
  await dialog.getByRole("button", { name: "Create account" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(importForm(page).getByLabel("Account", { exact: true })).toHaveText("Giro");

  await page.goto("/#/accounts");
  await expect(main(page).getByRole("cell", { name: "Giro", exact: true })).toBeVisible();
});

test("3 and 4. the editor proposes every setting of mybank-2026-10.csv, and a name is all Save needs (FR-133, FR-021)", async ({
  page,
}) => {
  await openEditorFor(page, "mybank-2026-10.csv");
  await expectEditorSettings(page, {
    hasHeaderRow: true,
    encoding: "UTF-8",
    dateFormat: "DD.MM.YYYY (03.09.2026)",
    decimalSeparator: "Comma (1.250,00)",
    amountMode: "One signed column",
    columns: {
      "Date column": "Date",
      "Amount column": "Amount",
      "Description column": "Purpose",
      "Counterparty column": "Payee",
    },
  });
  const { rows, unreadable } = previewDataRows(page);
  await expect(rows).not.toHaveCount(0);
  await expect(unreadable).toHaveCount(0);

  await saveProposed(page, "MyBank");
  const [batch] = await storedRecords<PendingBatch>(page, "pendingBatch");
  expect(batch?.fileName).toBe("mybank-2026-10.csv");
});

test("5. Soll and Haben are proposed as debit and credit columns (FR-133)", async ({ page }) => {
  await openEditorFor(page, "soll-haben.csv");
  await expectEditorSettings(page, {
    hasHeaderRow: true,
    encoding: "Windows-1252",
    dateFormat: "DD.MM.YYYY (03.09.2026)",
    decimalSeparator: "Comma (1.250,00)",
    amountMode: "Separate debit and credit columns",
    columns: {
      "Date column": "Buchungstag",
      "Debit column": "Soll",
      "Credit column": "Haben",
      "Description column": "Verwendungszweck",
    },
  });
  await expect(previewDataRows(page).unreadable).toHaveCount(0);
});

test("6. a file without column names gets no header row, the date and amount by position, and no description (FR-133)", async ({
  page,
}) => {
  await openEditorFor(page, "no-header.csv");
  await expectEditorSettings(page, {
    hasHeaderRow: false,
    encoding: "UTF-8",
    dateFormat: "DD.MM.YYYY (03.09.2026)",
    decimalSeparator: "Comma (1.250,00)",
    amountMode: "One signed column",
    columns: {
      "Date column": "Column 1 (01.10.2026)",
      "Amount column": "Column 3 (-4,50)",
      "Description column": "Choose a column",
    },
  });
});

test("7. a file of positive amounts only says that Invert the sign makes them expenses (FR-134)", async ({
  page,
}) => {
  await openEditorFor(page, "cash-notebook.csv");
  const signHint = (catalogue as unknown as { proposal: { signHint: string } }).proposal.signHint;
  await expect(main(page)).toContainText(signHint);
  await expect(previewDataRows(page).rows.filter({ hasText: "-€" })).toHaveCount(0);
});

test("8. a sample file picked in Edit changes none of the format's settings (FR-133)", async ({
  page,
}) => {
  await saveMyBankProfile(page);
  await page.goto("/#/import");
  await page
    .getByRole("region", { name: "Bank CSV formats" })
    .getByRole("button", { name: "Edit", exact: true })
    .click();
  await page.getByLabel("Sample file").setInputFiles(fixture("mybank-2026-10.csv"));
  await expect(page.getByRole("region", { name: "Preview" })).toContainText("Row 2");
  await expectEditorSettings(page, {
    hasHeaderRow: true,
    encoding: "Windows-1252",
    dateFormat: "DD.MM.YYYY (03.09.2026)",
    decimalSeparator: "Comma (1.250,00)",
    amountMode: "One signed column",
    columns: { "Date column": "Date", "Amount column": "Amount" },
  });
});

test("9, 10 and 17. with AI features off the chat says what it answers and needs, links to FAQ, and turns them on in place (FR-135, FR-061)", async ({
  page,
}) => {
  const keyCheck = await standInKeyCheck(page, 200);
  const standIn = await standInChat(page);
  await page.goto("/#/insights");
  await chatButton(page).click();
  for (const line of said().about) await expect(chat(page)).toContainText(line);
  await expect(chat(page)).toContainText(said().forExample);
  for (const example of said().examples) {
    await expect(chat(page).getByText(example, { exact: true })).toBeVisible();
    await expect(chat(page).getByRole("button", { name: example })).toHaveCount(0);
  }
  await expect(chat(page)).toContainText(said().charges);
  await expect(chat(page).getByRole("link", { name: said().faqLink })).toHaveAttribute(
    "href",
    "#/faq",
  );
  await expect(questionField(page)).toHaveCount(0);

  await chat(page).getByRole("button", { name: said().turnOn }).click();
  await keyField(page).fill(TEST_KEY);
  await keyDialog(page).getByRole("button", { name: "Turn on", exact: true }).click();
  await expect(keyDialog(page)).toBeHidden();
  await expect(questionField(page)).toBeFocused();
  await expect(suggestions(page).getByRole("button")).toHaveText([...said().examples]);
  expect(keyCheck.requests).toHaveLength(1);
  expect(standIn.requests).toHaveLength(0);

  await askInChat(page, "How do I set a budget?");
  await expect(chat(page)).toContainText("An answer.");
  expect(standIn.requests).toHaveLength(1);
  await expect(page).toHaveURL(/#\/insights$/);

  await page.goto("/#/settings");
  await expect(main(page).getByRole("switch", { name: "AI features" })).toBeChecked();
});

test("11 and 17. a question to the chat carries the guide's line on the key and every FAQ question and answer (FR-136, FR-141)", async ({
  page,
}) => {
  const standIn = await standInChat(page);
  await turnOnAiFeatures(page);
  await page.goto("/#/insights");
  await chatButton(page).click();
  await askInChat(page, "How do I turn AI features on?");
  await expect(chat(page)).toContainText("An answer.");

  const { instructions } = standIn.requests.at(-1)!.request;
  expect(instructions).toMatch(/own OpenAI API key/);
  expect(instructions).toMatch(/wherever the app runs/);
  expect(instructions).toContain(faqAsText());
  for (const topic of FAQ()) {
    for (const entry of topic.questions) expect(instructions).toContain(entry.question);
  }
});

test("12. the terms a new user may not know are explained where they appear (FR-138)", async ({
  page,
}) => {
  await page.goto("/#/categories");
  await expect(main(page).getByRole("listitem").filter({ hasText: "Uncategorised" })).toContainText(
    "Holds what is not sorted into a category yet.",
  );
  await expect(main(page).getByRole("listitem").filter({ hasText: "Unaccounted" })).toContainText(
    "Holds the differences that Reconcile books.",
  );

  await page.goto("/#/accounts");
  await expect(screenIntro(page)).toContainText("Reconcile");
  await main(page).getByRole("button", { name: "New account" }).click();
  await expect(page.getByRole("dialog", { name: "New account" })).toContainText(
    "What the account held before its first transaction in the app.",
  );
  await page.getByRole("dialog", { name: "New account" }).getByLabel("Name").fill("Giro");
  await page
    .getByRole("dialog", { name: "New account" })
    .getByRole("button", { name: "Create account" })
    .click();
  await expect(page.getByRole("dialog", { name: "New account" })).toHaveCount(0);

  await page.goto("/");
  await page.getByRole("banner").getByRole("button", { name: "Add transaction" }).click();
  const form = page.getByRole("dialog", { name: "Add transaction" });
  await form.getByRole("button", { name: "Transfer" }).click();
  await expect(form).toContainText(
    "Money moved between two of your own accounts. It counts as neither spending nor income.",
  );
});

test("13. Import calls a mapping profile a bank CSV format and says what one is (FR-138)", async ({
  page,
}) => {
  await page.goto("/#/import");
  await expect(
    page.getByRole("region", { name: "Bank CSV formats" }).getByRole("heading"),
  ).toHaveText("Bank CSV formats");
  await expect(importForm(page)).toContainText(
    "A bank CSV format tells the app how one bank's files are laid out.",
  );
  await importForm(page).getByLabel("Bank CSV format", { exact: true }).click();
  await expect(page.getByRole("option", { name: "Create new bank CSV format" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(main(page)).not.toContainText(/profile/i);
});

test("14 and 15. FAQ comes last in the sidebar, its answers hidden, and the answer on importing links to Import, also while an import waits (FR-139, FR-140)", async ({
  page,
}) => {
  await page.goto("/");
  await expect(sidebar(page).getByRole("link").last()).toHaveText("Help");
  await sidebar(page).getByRole("link", { name: "Help" }).click();
  await expect(main(page).getByRole("heading", { level: 2 })).toHaveText(
    FAQ().map((topic) => topic.topic),
  );
  await expect(main(page).locator("details[open]")).toHaveCount(0);

  const entry = main(page)
    .locator("details")
    .filter({ has: page.locator("summary", { hasText: IMPORT_QUESTION }) });
  await entry.locator("summary").click();
  await expect(entry.locator("ol > li")).not.toHaveCount(0);
  await entry.getByRole("link", { name: "Import" }).first().click();
  await expect(page).toHaveURL(/#\/import$/);
  await expect(main(page).getByRole("heading", { name: "Import", level: 1 })).toBeVisible();

  await saveMyBankProfile(page);
  await importWithProfile(page, { account: "Cash", file: "mybank-2026-08.csv" });
  await page.goto("/#/faq");
  await entry.locator("summary").click();
  await entry.getByRole("link", { name: "Import" }).first().click();
  await expect(page).toHaveURL(/#\/import$/);
  await expect(main(page).getByRole("heading", { name: "Import", level: 1 })).toBeVisible();
});

test.describe("16. without a network connection", () => {
  test.use({ serviceWorkers: "allow" });

  test("FAQ shows every question and answer (FR-139, FR-123)", async ({ page, context }) => {
    await page.goto("/");
    await page.waitForFunction(async () => {
      await navigator.serviceWorker.ready;
      return !!navigator.serviceWorker.controller;
    });
    await context.setOffline(true);
    await page.goto("/#/faq");
    await page.reload();
    const questions = FAQ().flatMap((topic) => topic.questions.map((entry) => entry.question));
    await expect(main(page).locator("summary")).toHaveText(questions);
    for (const summary of await main(page).locator("summary").all()) await summary.click();
    await expect(main(page).locator("details[open]")).toHaveCount(questions.length);
  });
});

test("18. a file with account details above its column names is read, and the bank's next file imports with the saved format (FR-021, FR-133)", async ({
  page,
}) => {
  await openEditorFor(page, "banks/ing.csv");
  await expectEditorSettings(page, {
    hasHeaderRow: true,
    encoding: "Windows-1252",
    dateFormat: "DD.MM.YYYY (03.09.2026)",
    decimalSeparator: "Comma (1.250,00)",
    amountMode: "One signed column",
    columns: {
      "Date column": "Buchung",
      "Amount column": "Betrag",
      "Description column": "Verwendungszweck",
      "Counterparty column": "Auftraggeber/Empfänger",
    },
  });
  const { rows, unreadable } = previewDataRows(page);
  await expect(rows).not.toHaveCount(0);
  await expect(unreadable).toHaveCount(0);
  await saveProposed(page, "ING");
  await discardImport(page);

  await startImport(page, { account: "Cash", file: "banks/ing-longer.csv", profile: "ING" });
  await expect(page).toHaveURL(/#\/import\/review$/);
  const [batch] = await storedRecords<PendingBatch>(page, "pendingBatch");
  expect(batch!.rows.map((row) => row.status)).toEqual(Array(6).fill("parsed"));
  expect((await storedRecords<Account>(page, "accounts")).map((a) => a.name)).toEqual(["Cash"]);
});
