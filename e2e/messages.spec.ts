import type { Locator, Page } from "@playwright/test";
import type { Transaction } from "../src/domain/types";
import { messageFor, type MessageCode } from "../src/ui/messages";
import {
  addAccount,
  fixture,
  openReconcile,
  openTransactionForm,
  storedRecords,
} from "./support/app";
import { backupText, chooseBackupFile, storedData } from "./support/backup";
import {
  askInChat,
  chat,
  LOCAL_ONLY,
  onHostedCopy,
  openChat,
  standInCategoriser,
  standInChat,
  suggestCategories,
  turnOnAiFeatures,
} from "./support/ai";
import { importWithProfile, mapMyBank, saveMyBankProfile, startImport } from "./support/import";
import { expect, setToday, test } from "./support/test";

// SC-012: every refusal or failure the spec calls out surfaces a plain-language message that states
// the reason (FR-067). Each is triggered once, and its wording from src/ui/messages.ts must appear
// where contracts/ui.md, shared patterns, places it: a field error under its field, a form error
// above the submit button, or an alert at the top of the region where the action was taken, with a
// next step where there is one. The detailed behaviour behind each refusal has its own specs.

test.beforeEach(async ({ page }) => {
  await setToday(page, "2026-09-03");
});

const main = (page: Page) => page.getByRole("main");

/** The error shown in the same field as the control labelled `label` inside `scope` (FR-068). */
function fieldError(scope: Locator, label: string) {
  return scope
    .locator('[data-slot="field"]')
    .filter({ has: scope.page().getByLabel(label, { exact: true }) })
    .getByRole("alert");
}

/** The text of `message` as the user reads it, which never shows the refusal's code (FR-067). */
async function expectWording(shown: Locator, code: MessageCode, details?: Record<string, string>) {
  const wording = messageFor({ code, ...(details && { details }) });
  await expect(shown).toContainText(wording);
  await expect(shown).not.toContainText(code);
}

test.describe("a field error, under its field", () => {
  test("account-name-taken: an account with this name exists", async ({ page }) => {
    await page.goto("/#/accounts");
    await page.getByRole("button", { name: "New account" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Name").fill(" cash");
    await dialog.getByRole("button", { name: "Create account" }).click();

    await expectWording(fieldError(dialog, "Name"), "account-name-taken");
  });

  test("category-name-taken: the side already has a category with this name", async ({ page }) => {
    await page.goto("/#/categories");
    await main(page).getByRole("button", { name: "New category" }).click();
    const dialog = page.getByRole("dialog", { name: "New category" });
    await dialog.getByLabel("Name").fill("groceries");
    await dialog.getByRole("button", { name: "Create category" }).click();

    await expectWording(fieldError(dialog, "Name"), "category-name-taken", { side: "expense" });
  });

  test("profile-name-taken: a profile with this name exists", async ({ page }) => {
    await saveMyBankProfile(page);
    await page.goto("/#/import/profiles/new");
    await page.getByLabel("Sample file").setInputFiles(fixture("mybank-2026-08.csv"));
    await mapMyBank(page, { name: " mybank" });
    await main(page).getByRole("button", { name: "Save profile" }).click();

    await expectWording(fieldError(main(page), "Name"), "profile-name-taken");
  });

  test("amount-invalid: manual entry needs an amount of zero or more", async ({ page }) => {
    await page.goto("/");
    const form = await openTransactionForm(page);
    await form.getByLabel("Amount").fill("12,34.5");
    await form.getByRole("button", { name: "Save" }).click();

    await expectWording(fieldError(form, "Amount"), "amount-invalid");
  });

  test("date-invalid: manual entry needs a real date", async ({ page }) => {
    await page.goto("/");
    const form = await openTransactionForm(page);
    await form.getByLabel("Date").fill("");
    await form.getByRole("button", { name: "Save" }).click();

    await expectWording(fieldError(form, "Date"), "date-invalid");
  });

  test("transfer-destination-missing: a transfer needs the account it goes to", async ({
    page,
  }) => {
    await addAccount(page, "Checking");
    const form = await openTransactionForm(page);
    await form.getByRole("button", { name: "Transfer" }).click();
    await form.getByLabel("Amount").fill("10.00");
    await form.getByRole("button", { name: "Save" }).click();

    await expectWording(fieldError(form, "Destination"), "transfer-destination-missing");
  });
});

test.describe("an error in a form or dialog, above its button", () => {
  test("transfer-needs-second-account: leads on to Accounts", async ({ page }) => {
    await page.goto("/");
    const form = await openTransactionForm(page);
    await form.getByRole("button", { name: "Transfer" }).click();

    await expectWording(form.getByRole("alert"), "transfer-needs-second-account");
    await expect(form.getByRole("link", { name: "Go to Accounts" })).toBeVisible();
  });

  test("reconcile-already-matches: nothing was booked", async ({ page }) => {
    const dialog = await openReconcile(page, "Cash");
    await dialog.getByRole("button", { name: "Reconcile", exact: true }).click();

    await expectWording(dialog.getByRole("alert"), "reconcile-already-matches");
    expect(await storedRecords(page, "transactions")).toEqual([]);
  });
});

test.describe("an alert at the top of the region, with its next step", () => {
  test("category-protected: Delete explains instead of asking, for both protected categories", async ({
    page,
  }) => {
    await page.goto("/#/categories");
    const rows = main(page).getByRole("tabpanel").getByRole("listitem");
    for (const [name, role] of [
      ["Uncategorised", "uncategorised"],
      ["Unaccounted", "unaccounted"],
    ] as const) {
      await rows
        .filter({ has: page.getByText(name, { exact: true }) })
        .getByRole("button", { name: "Delete" })
        .click();

      await expectWording(main(page).getByRole("alert"), "category-protected", { role });
      await expect(page.getByRole("alertdialog")).toHaveCount(0);
    }
  });

  test("import-no-transactions: the file held no transactions", async ({ page }) => {
    await saveMyBankProfile(page);
    await startImport(page, { account: "Cash", file: "header-only.csv" });

    const form = page.getByRole("region", { name: "Import a file" });
    await expectWording(form.getByRole("alert"), "import-no-transactions");
  });

  test("import-batch-pending: offers to open the batch that waits", async ({ page }) => {
    await saveMyBankProfile(page);
    await importWithProfile(page, { account: "Cash", file: "mybank-2026-08.csv" });
    await page.goto("/#/import");
    const form = page.getByRole("region", { name: "Import a file" });
    await form.getByLabel("Bank file").setInputFiles(fixture("mybank-2026-09.csv"));

    await expectWording(form.getByRole("alert"), "import-batch-pending");
    await expect(form.getByRole("button", { name: "Open pending batch" })).toBeVisible();
  });
});

test("ai-unreachable: the AI could not be asked, in review's alert (FR-094)", async ({
  page,
  baseURL,
}) => {
  test.skip(onHostedCopy(baseURL), LOCAL_ONLY);
  await standInCategoriser(page, () => "unreachable");
  await saveMyBankProfile(page);
  await importWithProfile(page, { account: "Cash", file: "mybank-2026-08.csv" });
  await turnOnAiFeatures(page);

  await suggestCategories(page);

  await expectWording(main(page).getByRole("alert"), "ai-unreachable");
});

test("ai-unreachable: the AI could not be asked, in the finance chat's alert (FR-104)", async ({
  page,
  baseURL,
}) => {
  test.skip(onHostedCopy(baseURL), LOCAL_ONLY);
  await standInChat(page, () => "unreachable");
  await turnOnAiFeatures(page);
  await openChat(page);

  await askInChat(page, "Where does my money go?");

  await expectWording(chat(page).getByRole("alert"), "ai-unreachable");
});

test("unparsable import rows: each is listed with the reason it failed", async ({ page }) => {
  await saveMyBankProfile(page);
  await importWithProfile(page, { account: "Cash", file: "mybank-2026-08.csv" });

  await page
    .getByRole("region", { name: "Batch" })
    .getByRole("button", { name: "2 unparsable" })
    .click();
  const drawer = page.getByRole("dialog", { name: "Unparsable rows" });

  await expectWording(
    drawer.getByRole("listitem").filter({ hasText: "Row 14" }),
    "date-unreadable",
    { cell: "32.08.2026", format: "DD.MM.YYYY" },
  );
  await expectWording(drawer.getByRole("listitem").filter({ hasText: "Row 15" }), "amount-missing");
});

test.describe("an invalid backup file: an alert on the Backup screen, and nothing replaced", () => {
  /** Chooses `text` as the backup and checks the alert, with no confirmation and the data intact. */
  async function expectRefusal(
    page: Page,
    text: string,
    code: MessageCode,
    details?: Record<string, string>,
  ) {
    await page.goto("/");
    const before = await storedData(page);

    await chooseBackupFile(page, text);

    await expectWording(main(page).getByRole("alert"), code, details);
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    expect(await storedData(page)).toEqual(before);
  }

  /** A backup of the app's own data with one transaction, which a test may damage. */
  async function backupWith(page: Page, damage: (transaction: Partial<Transaction>) => void) {
    await page.goto("/");
    const data = await storedData(page);
    const groceries = data.categories.find((c) => c.side === "expense" && c.name === "Groceries")!;
    const transaction: Partial<Transaction> = {
      id: "t1",
      seq: 1,
      date: "2026-08-15",
      amountCents: 1234,
      accountId: data.accounts[0]!.id,
      description: "",
      kind: "expense",
      categoryId: groceries.id,
    };
    damage(transaction);
    return backupText({ ...data, transactions: [transaction as Transaction] });
  }

  test("backup-not-a-backup: the file is something else", async ({ page }) => {
    await expectRefusal(page, "Date;Amount\n01.08.2026;-45,20", "backup-not-a-backup");
  });

  test("backup-newer-version: made by a newer version of the app", async ({ page }) => {
    const text = JSON.stringify({ app: "financial-copilot", formatVersion: 2, data: {} });
    await expectRefusal(page, text, "backup-newer-version");
  });

  test("backup-damaged: names what is missing", async ({ page }) => {
    const text = await backupWith(page, (transaction) => delete transaction.date);
    await expectRefusal(page, text, "backup-damaged", { record: "transaction", field: "date" });
  });

  test("backup-damaged: names the rule the data breaks", async ({ page }) => {
    const text = await backupWith(page, (transaction) => {
      transaction.accountId = "not-in-the-backup";
    });
    await expectRefusal(page, text, "backup-damaged", { rule: "transaction-account-missing" });
  });
});
