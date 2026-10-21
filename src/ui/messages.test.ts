import { describe, expect, test } from "vitest";
import { formatAmount } from "./format";
import { messageFor, messages, notifications, type MessageCode } from "./messages";
// A namespace import, so the tests load before the catalogue words a new message.
import * as catalogue from "./messages";

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

  test("words a backup whose settings hold an empty model, naming the model (FR-130)", () => {
    for (const details of [
      { record: "settings", field: "model" },
      { rule: "settings-model-invalid", model: "" },
    ]) {
      const message = messageFor({ code: "backup-damaged", details });
      expect(message).toMatch(/model/i);
      expect(message).toMatch(/unchanged/i);
      expect(message).not.toContain("settings-model-invalid");
    }
  });

  test("words a backup whose pending row holds a protected category as the AI's suggestion (FR-093)", () => {
    const message = messageFor({
      code: "backup-damaged",
      details: { rule: "pending-row-suggestion-invalid", rowNumber: 2 },
    });
    expect(message).toMatch(/suggest/i);
    expect(message).not.toContain("pending-row-suggestion-invalid");
  });

  test.each([
    "conversation-question-missing",
    "conversation-turn-invalid",
    "conversation-source-invalid",
  ])(
    "words a backup whose finance chat conversation breaks the rule %s, without its code (FR-104)",
    (rule) => {
      const message = messageFor({ code: "backup-damaged", details: { rule, turn: 2 } });
      expect(message).toMatch(/conversation/i);
      expect(message).toMatch(/unchanged/i);
      expect(message).not.toContain(rule);
    },
  );

  test.each([
    ["turn", "question"],
    ["source", "from"],
  ])("words a damaged %s of the finance chat's conversation (FR-104)", (record, field) => {
    const message = messageFor({ code: "backup-damaged", details: { record, field } });
    expect(message).toMatch(/conversation/i);
    expect(message).not.toMatch(/a record/);
  });

  test("words a backup whose conversation is missing or not a list", () => {
    const message = messageFor({
      code: "backup-damaged",
      details: { record: "data", field: "conversation" },
    });
    expect(message).toMatch(/conversation/i);
  });

  test("warns, when AI features are turned on, what now leaves the app and to whom (FR-095, FR-091)", () => {
    expect(catalogue.sharingWarning).toMatch(/Suggest categories/);
    expect(catalogue.sharingWarning).toMatch(/payee/i);
    expect(catalogue.sharingWarning).toMatch(/purpose/i);
    expect(catalogue.sharingWarning).toMatch(/category names/i);
    expect(catalogue.sharingWarning).toContain("100");
    expect(catalogue.sharingWarning).toContain("OpenAI");
    expect(catalogue.aiFeaturesDescription).toContain("OpenAI");
  });

  test("says in the warning what the finance chat sends, which suggestions do not (FR-095, FR-102)", () => {
    const warning = catalogue.sharingWarning;
    expect(warning).toMatch(/finance chat/);
    expect(warning).toMatch(/no amounts, dates or account names/i);
    for (const part of ["question", "12 months", "dates", "descriptions", "amounts", "budgets"]) {
      expect(warning).toContain(part);
    }
    expect(warning).toMatch(/balance/);
    expect(catalogue.aiFeaturesDescription).toMatch(/Suggest categories/);
    expect(catalogue.aiFeaturesDescription).toMatch(/finance chat/);
  });

  test("names the finance chat in the Settings line without a screen, since every screen offers it (FR-100)", () => {
    expect(catalogue.aiFeaturesDescription).toMatch(/finance chat/);
    expect(catalogue.aiFeaturesDescription).not.toMatch(/Insights/);
  });

  test("words the finance chat: its name, examples, the fixed answer out of scope, its suggested questions, and AI features needed (FR-100 – FR-103, FR-111)", () => {
    const chat = catalogue.financeChat;
    expect(chat.title).toBe("Ask about your finances");
    expect(chat.examples).toEqual(
      expect.arrayContaining([
        "How can I reduce my spending?",
        "Which of my subscriptions have become more expensive?",
      ]),
    );
    for (const topic of [/your own finances/, /money and finance/, /how this app works/]) {
      expect(chat.outOfScope).toMatch(topic);
    }
    expect(chat.suggestions).toBe("Suggested questions");
    expect(chat.needsAiFeatures).toMatch(/AI features/);
    expect(chat.needsAiFeatures).toMatch(/Settings/);
    expect(chat.thinking).toBe("Thinking…");
  });

  test("words the finance chat's Stop, its mark, its sources and clearing the conversation (FR-069, FR-104, FR-108, FR-110)", () => {
    const chat = catalogue.financeChat;
    expect(chat.stop).toBe("Stop");
    expect(chat.stopped).toBe("Stopped");
    expect(chat.sources).toBe("Sources");
    expect(chat.clear).toBe("Clear conversation");
    expect(chat.clearWarning).toMatch(/questions and answers/i);
    expect(chat.clearWarning).toMatch(/deleted/i);
  });

  test("names OpenAI as the one recipient, and neither n8n, Anthropic nor Claude (R-24)", () => {
    const texts = [
      catalogue.sharingWarning,
      catalogue.aiFeaturesDescription,
      catalogue.aiFeaturesNeeded,
      ...(Object.keys(messages) as MessageCode[]).map((code) => messageFor({ code })),
      messageFor({
        code: "backup-damaged",
        details: { rule: "pending-row-suggestion-invalid", rowNumber: 2 },
      }),
    ];
    for (const text of texts) {
      expect(text).not.toMatch(/n8n|Anthropic|Claude/);
    }
  });

  test("words the outcome of suggestions with the rows filled of the rows sent, naming no provider (FR-094)", () => {
    expect(notifications.categoriesSuggested(14, 20)).toBe(
      "The AI suggested categories for 14 of 20 rows.",
    );
    expect(notifications.categoriesSuggested(1, 3)).toBe(
      "The AI suggested a category for 1 of 3 rows.",
    );
    expect(notifications.categoriesSuggested(1, 1)).toBe(
      "The AI suggested a category for 1 of 1 row.",
    );
    expect(notifications.categoriesSuggested(0, 3)).toBe(
      "The AI found no category for the 3 rows sent.",
    );
  });

  test("says beside an unavailable switch that AI features need the app run locally (FR-106)", () => {
    expect(catalogue.aiFeaturesLocalOnly).toMatch(/AI features/);
    expect(catalogue.aiFeaturesLocalOnly).toMatch(/locally/);
  });

  test("says that suggestions need AI features, and where to turn them on (FR-090)", () => {
    expect(catalogue.aiFeaturesNeeded).toMatch(/AI features/);
    expect(catalogue.aiFeaturesNeeded).toMatch(/Settings/);
  });

  test("words ai-features-off for any AI feature, saying that nothing was sent (FR-061)", () => {
    const message = messageFor({ code: "ai-features-off" });
    expect(message).toMatch(/AI features/);
    expect(message).toMatch(/Settings/);
    expect(message).toMatch(/nothing was sent/i);
    expect(message).not.toMatch(/suggestion/i);
  });

  test("words each AI failure with what to do, and that nothing changed (FR-094, contracts/ai.md)", () => {
    const codes = ["ai-unreachable", "ai-timeout", "ai-failed", "ai-answer-invalid"] as const;
    for (const code of codes) {
      expect(messageFor({ code })).toMatch(/nothing changed/i);
      expect(messageFor({ code })).toMatch(/try again/i);
    }
    expect(messageFor({ code: "ai-unreachable" })).toContain(".env");
    expect(messageFor({ code: "ai-unreachable" })).toMatch(/OpenAI key/);
    expect(messageFor({ code: "ai-failed" })).toMatch(/OpenAI/);
    expect(messageFor({ code: "ai-failed" })).toMatch(/key/);
    expect(messageFor({ code: "suggestions-outdated" })).toMatch(/no suggestion was used/i);
  });

  test("adds to the Backup note that installing the app helps the browser keep the data (FR-075)", () => {
    expect(catalogue.installHint).toMatch(/install/i);
    expect(catalogue.installHint).toMatch(/keep/i);
    expect(catalogue.installHint).toMatch(/data/i);
  });

  test("words the update notice with both versions as the header shows them, asking for a backup first (FR-124)", () => {
    expect(catalogue.updateNotice("1.6", "1.5")).toBe(
      "Version 1.6 is available (you have 1.5). Make a backup first.",
    );
  });

  test("says what to do when an update could not start, and that the data is unchanged (FR-124)", () => {
    const message = messageFor({ code: "update-failed" });
    expect(message).toMatch(/close the app/i);
    expect(message).toMatch(/open it again/i);
    expect(message).toMatch(/try again/i);
    expect(message).toMatch(/data is unchanged/i);
  });

  test("words the restore notification with the file's name", () => {
    expect(notifications.restored("financial-copilot-backup-2026-09-03.json")).toContain(
      "financial-copilot-backup-2026-09-03.json",
    );
  });
});
