import { describe, expect, test } from "vitest";
import { formatAmount } from "./format";
import {
  dataSharingNeeded,
  dataSharingWarning,
  messageFor,
  messages,
  notifications,
  type MessageCode,
} from "./messages";

describe("messages", () => {
  test.each(Object.keys(messages) as MessageCode[])(
    "words %s in plain language (FR-067)",
    (code) => {
      const message = messageFor({ code });
      expect(message.trim()).not.toBe("");
      expect(message).not.toContain(code);
    },
  );

  test("covers the start-up and storage failures", () => {
    expect(Object.keys(messages)).toEqual(
      expect.arrayContaining([
        "save-failed",
        "storage-unavailable",
        "open-in-another-tab",
        "unexpected-error",
      ]),
    );
  });

  test("names the details of a refusal, such as every column a file lacks", () => {
    expect(
      messageFor({ code: "import-missing-columns", details: { columns: ["Amount", "Payee"] } }),
    ).toContain('"Amount" and "Payee"');
    expect(
      messageFor({
        code: "profile-columns-incomplete",
        details: { roles: ["date", "amount", "description"] },
      }),
    ).toContain("date, amount and description");
    expect(
      messageFor({
        code: "date-unreadable",
        details: { cell: "32.08.2026", format: "DD.MM.YYYY" },
      }),
    ).toBe('"32.08.2026" is not a date in the format DD.MM.YYYY.');
  });

  test("words the import notifications with the count, in singular and plural", () => {
    expect(notifications.importConfirmed(1, "Cash")).toBe("Added 1 transaction to Cash.");
    expect(notifications.importConfirmed(13, "Cash")).toBe("Added 13 transactions to Cash.");
    expect(notifications.importDiscarded("bank.csv")).toContain("bank.csv");
  });

  test("says a budget limit must be above 0.00 (FR-040)", () => {
    expect(Object.keys(messages)).toContain("budget-limit-invalid");
    expect(messageFor({ code: "budget-limit-invalid" })).toContain("above 0.00");
  });

  test("says an account already holds the stated amount and nothing was booked (FR-005)", () => {
    expect(Object.keys(messages)).toContain("reconcile-already-matches");
    const message = messageFor({ code: "reconcile-already-matches" });
    expect(message).toMatch(/already/i);
    expect(message).toMatch(/nothing was booked/i);
  });

  test("words a reconciliation with its kind, amount and category (contracts/ui.md, accounts)", () => {
    expect(notifications.reconciled("expense", 1500, "Unaccounted")).toBe(
      `Booked an expense of ${formatAmount(1500)} to Unaccounted.`,
    );
    expect(notifications.reconciled("income", 2000, "Unexplained")).toBe(
      `Booked an income of ${formatAmount(2000)} to Unexplained.`,
    );
  });

  test("words the category refusals, naming the side whose name is taken (FR-032)", () => {
    expect(Object.keys(messages)).toEqual(
      expect.arrayContaining(["category-name-empty", "category-name-taken", "category-protected"]),
    );
    expect(messageFor({ code: "category-name-empty" })).toMatch(/name/i);
    expect(messageFor({ code: "category-name-taken", details: { side: "expense" } })).toMatch(
      /expense/i,
    );
    expect(messageFor({ code: "category-name-taken", details: { side: "income" } })).toMatch(
      /income/i,
    );
  });

  test("says why each protected category cannot be deleted, and that renaming still works (FR-033)", () => {
    const uncategorised = messageFor({
      code: "category-protected",
      details: { role: "uncategorised" },
    });
    const unaccounted = messageFor({
      code: "category-protected",
      details: { role: "unaccounted" },
    });
    expect(uncategorised).not.toBe(unaccounted);
    for (const message of [uncategorised, unaccounted]) {
      expect(message).toMatch(/renam/i);
      expect(message).toMatch(/colour/i);
    }
  });

  test("says why a backup is refused, and that the current data is unchanged (FR-072)", () => {
    expect(Object.keys(messages)).toEqual(
      expect.arrayContaining(["backup-not-a-backup", "backup-newer-version", "backup-damaged"]),
    );
    for (const code of ["backup-not-a-backup", "backup-newer-version", "backup-damaged"] as const) {
      expect(messageFor({ code })).toMatch(/unchanged/i);
    }
    expect(messageFor({ code: "backup-not-a-backup" })).toMatch(/not a Financial Copilot backup/i);
    expect(messageFor({ code: "backup-newer-version" })).toMatch(/newer version/i);
  });

  test("words a damaged backup from the record and field at fault, or the broken rule", () => {
    const noDate = messageFor({
      code: "backup-damaged",
      details: { record: "transaction", field: "date" },
    });
    expect(noDate).toMatch(/transaction/i);
    expect(noDate).toMatch(/date/i);

    const noBudgets = messageFor({
      code: "backup-damaged",
      details: { record: "data", field: "budgets" },
    });
    expect(noBudgets).toMatch(/budgets/i);

    const brokenRule = messageFor({
      code: "backup-damaged",
      details: { rule: "transaction-account-missing", transactionId: "t1" },
    });
    expect(brokenRule).toMatch(/account/i);
    expect(brokenRule).not.toContain("transaction-account-missing");

    expect(messageFor({ code: "backup-damaged" })).toMatch(/incomplete|damaged/i);
  });

  test("words a backup whose pending row holds a protected category as Claude's suggestion (FR-093)", () => {
    const message = messageFor({
      code: "backup-damaged",
      details: { rule: "pending-row-suggestion-invalid", rowNumber: 2 },
    });
    expect(message).toMatch(/suggest/i);
    expect(message).not.toContain("pending-row-suggestion-invalid");
  });

  test("warns, while data sharing is on, what Suggest categories sends and to whom (FR-095, FR-091)", () => {
    expect(dataSharingWarning).toMatch(/data sharing is on/i);
    expect(dataSharingWarning).toMatch(/Suggest categories/);
    expect(dataSharingWarning).toMatch(/payee/i);
    expect(dataSharingWarning).toMatch(/purpose/i);
    expect(dataSharingWarning).toMatch(/category names/i);
    expect(dataSharingWarning).toContain("100");
    expect(dataSharingWarning).toContain("n8n");
    expect(dataSharingWarning).toContain("Anthropic");
  });

  test("words the outcome of suggestions with the rows filled of the rows sent (FR-094)", () => {
    expect(notifications.categoriesSuggested(14, 20)).toBe(
      "Claude suggested categories for 14 of 20 rows.",
    );
    expect(notifications.categoriesSuggested(1, 3)).toBe(
      "Claude suggested a category for 1 of 3 rows.",
    );
    expect(notifications.categoriesSuggested(1, 1)).toBe(
      "Claude suggested a category for 1 of 1 row.",
    );
    expect(notifications.categoriesSuggested(0, 3)).toBe(
      "Claude found no category for the 3 rows sent.",
    );
  });

  test("says that suggestions need data sharing, and where to turn it on (FR-090)", () => {
    expect(dataSharingNeeded).toMatch(/data sharing/i);
    expect(dataSharingNeeded).toMatch(/header/i);
  });

  test("words each categoriser failure with what to do, and that no row changed (FR-094)", () => {
    const codes = [
      "categoriser-unreachable",
      "categoriser-timeout",
      "categoriser-failed",
      "categoriser-answer-invalid",
    ] as const;
    for (const code of codes) {
      expect(messageFor({ code })).toMatch(/no row changed/i);
    }
    expect(messageFor({ code: "categoriser-unreachable" })).toMatch(/published/i);
    expect(messageFor({ code: "categoriser-failed" })).toMatch(/credential/i);
    expect(messageFor({ code: "suggestions-outdated" })).toMatch(/no suggestion was used/i);
  });

  test("words the restore notification with the file's name", () => {
    expect(notifications.restored("financial-copilot-backup-2026-09-03.json")).toContain(
      "financial-copilot-backup-2026-09-03.json",
    );
  });
});
