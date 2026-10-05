import { describe, expect, test } from "vitest";
import { formatAmount } from "./format";
import { messageFor, messages, notifications, type MessageCode } from "./messages";

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
});
