import { describe, expect, test } from "vitest";
import { protectedCategory } from "./categories";
import { seedState } from "./seed";
import { idCounter } from "./testing";
import { changeAccount, changeKind, newDraft, type Draft } from "./transactions";
import type { State } from "./types";

function seeded(): State {
  return seedState(idCounter());
}

describe("newDraft (FR-014)", () => {
  test("opens with kind expense, today, 0.00, Cash, expense Uncategorised and no description (scenario 8)", () => {
    const state = seeded();
    expect(newDraft(state, "2026-09-03")).toEqual({
      id: null,
      kind: "expense",
      amountCents: 0,
      accountId: state.accounts[0]!.id,
      categoryId: protectedCategory(state.categories, "expense", "uncategorised").id,
      date: "2026-09-03",
      description: "",
    });
  });

  test("uses the account of the last manual entry (FR-006, scenario 9)", () => {
    const state: State = { ...seeded(), settings: { manualEntryAccountId: "checking" } };
    expect(newDraft(state, "2026-09-03").accountId).toBe("checking");
  });
});

describe("changeKind (FR-015)", () => {
  const state = seeded();
  const uncategorised = (side: "expense" | "income") =>
    protectedCategory(state.categories, side, "uncategorised").id;
  const groceries = state.categories.find((c) => c.name === "Groceries")!.id;
  const expense: Draft = {
    ...newDraft(state, "2026-09-03"),
    kind: "expense",
    categoryId: groceries,
  };

  test("moves between expense and income to the new side's Uncategorised", () => {
    const income = changeKind(expense, "income", state.categories);
    expect(income).toMatchObject({ kind: "income", categoryId: uncategorised("income") });
    expect(changeKind(income, "expense", state.categories)).toMatchObject({
      kind: "expense",
      categoryId: uncategorised("expense"),
    });
  });

  test("removes the category and asks for a destination when changing to transfer", () => {
    const transfer = changeKind(expense, "transfer", state.categories);
    expect(transfer).toMatchObject({ kind: "transfer", destinationAccountId: null });
    expect(transfer).not.toHaveProperty("categoryId");
  });

  test("removes the destination and sets Uncategorised when changing from transfer", () => {
    const transfer: Draft = {
      ...changeKind(expense, "transfer", state.categories),
      kind: "transfer",
      destinationAccountId: "checking",
    };
    for (const side of ["expense", "income"] as const) {
      const changed = changeKind(transfer, side, state.categories);
      expect(changed).toMatchObject({ kind: side, categoryId: uncategorised(side) });
      expect(changed).not.toHaveProperty("destinationAccountId");
    }
  });

  test("keeps the draft when the kind stays the same", () => {
    expect(changeKind(expense, "expense", state.categories)).toBe(expense);
  });

  test("keeps amount, account, date and description", () => {
    const filled: Draft = { ...expense, amountCents: 4000, description: "Weekly shop" };
    expect(changeKind(filled, "transfer", state.categories)).toMatchObject({
      amountCents: 4000,
      accountId: filled.accountId,
      date: "2026-09-03",
      description: "Weekly shop",
    });
  });
});

describe("changeAccount", () => {
  const state = seeded();
  const transfer: Draft = {
    ...changeKind(newDraft(state, "2026-09-03"), "transfer", state.categories),
    kind: "transfer",
    accountId: "cash",
    destinationAccountId: "checking",
  };

  test("clears a destination that equals the new account (transaction form)", () => {
    expect(changeAccount(transfer, "checking")).toMatchObject({
      accountId: "checking",
      destinationAccountId: null,
    });
  });

  test("keeps any other destination", () => {
    expect(changeAccount(transfer, "savings")).toMatchObject({
      accountId: "savings",
      destinationAccountId: "checking",
    });
  });

  test("only changes the account of an expense or income", () => {
    const expense = newDraft(state, "2026-09-03");
    expect(changeAccount(expense, "checking")).toEqual({ ...expense, accountId: "checking" });
  });
});
