import { describe, expect, test } from "vitest";
import { APP_GUIDE } from "./appGuide";

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
  ])("describes the screen %s of the sidebar", (screen) => {
    expect(APP_GUIDE).toContain(screen);
  });

  test.each(["Import", "review", "mapping profile"])("describes %s", (part) => {
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
  ])("names the action %s as the app labels it", (label) => {
    expect(APP_GUIDE).toContain(label);
  });

  test("holds no line Data:, which starts the user's data in the instructions", () => {
    expect(APP_GUIDE).not.toMatch(/^Data:/m);
  });
});
