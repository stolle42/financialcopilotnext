import { describe, expect, test } from "vitest";
import { APP_GUIDE } from "./appGuide";
// A namespace import, so the tests load before faq.ts exists.
import * as faqModule from "./faq";

// contracts/ai.md, finance chat: the guide to the app that the chat answers questions about the
// app from, and requests to change something with how to do it (FR-103, FR-109, R-25).

describe("APP_GUIDE", () => {
  test.each([
    "Transactions",
    "Categories",
    "Accounts",
    "Budgets",
    "Backup",
    "Insights",
    "Settings",
    "Help",
  ])("describes the screen %s of the sidebar", (screen) => {
    expect(APP_GUIDE).toContain(screen);
  });

  test.each(["Import", "review", "bank CSV format"])("describes %s", (part) => {
    expect(APP_GUIDE).toContain(part);
  });

  test.each([
    "Add transaction",
    "Import a CSV",
    "Suggest categories",
    "Reconcile",
    "Save backup",
    "Restore from backup",
    "AI features",
    "Ask about your finances",
    "Clear conversation",
    "Turn on AI features",
    "New account…",
    "Create new bank CSV format",
  ])("names the action %s as the app labels it", (label) => {
    expect(APP_GUIDE).toContain(label);
  });

  test("lists Help last in the sidebar (FR-084, FR-136, FR-139)", () => {
    expect(APP_GUIDE).toContain("Backup, Insights, Settings and Help");
  });

  test("says AI features need the user's own OpenAI API key, entered from Settings or the chat, and work wherever the app runs (FR-136)", () => {
    expect(APP_GUIDE).toMatch(/own OpenAI API key/);
    expect(APP_GUIDE).toMatch(/Turn on AI features[^.]*Settings[^.]*chat/);
    expect(APP_GUIDE).toMatch(/wherever the app runs/);
    expect(APP_GUIDE).not.toMatch(/only (when the app runs )?on (the user's|your) own computer/);
  });

  test("says the app proposes a bank CSV format from a bank's first file (FR-133)", () => {
    expect(APP_GUIDE).toMatch(/propos/);
    expect(APP_GUIDE).not.toMatch(/profile/i);
  });

  // FR-142 – FR-153 (v1.8): what review does by itself, in the guide's part on review.
  test("says review suggests transfers, and that turning Transfer off keeps the two apart (FR-142, FR-143)", () => {
    expect(APP_GUIDE).toMatch(/suggested transfers?/i);
    expect(APP_GUIDE).toMatch(/Transfer[^.]*\boff\b[^.]*(separate|apart|stay)/i);
  });

  test('names the mark "From earlier" and the choice "Set aside rows under" (FR-147, FR-152)', () => {
    expect(APP_GUIDE).toContain("From earlier");
    expect(APP_GUIDE).toContain("Set aside rows under");
  });

  test("says typing finds a category and Tab moves to the next row (FR-148, FR-150)", () => {
    expect(APP_GUIDE).toMatch(/typing[^.]*(finds|find|narrows)[^.]*categor/i);
    expect(APP_GUIDE).toMatch(/\bTab\b[^.]*next row/i);
  });

  test("ends with the line FAQ and FAQ as plain text (FR-141)", () => {
    const faqAsText = (faqModule as Record<string, unknown>).faqAsText as () => string;
    expect(APP_GUIDE.endsWith(["", "FAQ", faqAsText()].join("\n"))).toBe(true);
  });

  test("holds no line Data:, which starts the user's data in the instructions", () => {
    expect(APP_GUIDE).not.toMatch(/^Data:/m);
  });
});
