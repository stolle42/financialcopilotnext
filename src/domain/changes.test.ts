import { describe, expect, test } from "vitest";
import { applyChanges, isRefusal } from "./changes";
import type { Account, Category, ChatTurn, PendingBatch, State } from "./types";

const cash: Account = { id: "cash", name: "Cash", type: "cash", openingBalanceCents: 0 };
const groceries: Category = {
  id: "groceries",
  side: "expense",
  name: "Groceries",
  color: "#40c057",
  role: null,
};
const batch: PendingBatch = {
  id: "batch",
  accountId: "cash",
  fileName: "bank.csv",
  createdAt: "2026-09-03T10:00:00.000Z",
  rows: [],
};

const turn: ChatTurn = {
  question: "Groceries?",
  answer: "€40.00.",
  sources: [
    {
      name: "Groceries",
      from: "2026-09-01",
      to: "2026-09-30",
      categoryId: "groceries",
      accountId: null,
    },
  ],
};

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

function makeState(): State {
  return deepFreeze({
    accounts: [cash],
    categories: [groceries],
    transactions: [],
    budgets: [{ categoryId: "groceries", limitCents: 40000 }],
    profiles: [],
    pendingBatch: null,
    settings: { manualEntryAccountId: "cash" },
    conversation: [turn],
  });
}

describe("applyChanges", () => {
  test("adds new records after the existing ones", () => {
    const checking: Account = { ...cash, id: "checking", name: "Checking" };
    const next = applyChanges(makeState(), { accounts: { put: [checking] } });
    expect(next.accounts).toEqual([cash, checking]);
  });

  test("replaces a record with the same key in place", () => {
    const renamed = { ...cash, name: "Wallet" };
    const next = applyChanges(makeState(), { accounts: { put: [renamed] } });
    expect(next.accounts).toEqual([renamed]);
  });

  test("deletes records by key, and keys budgets by category id", () => {
    const next = applyChanges(makeState(), {
      categories: { delete: ["groceries"] },
      budgets: { delete: ["groceries"] },
    });
    expect(next.categories).toEqual([]);
    expect(next.budgets).toEqual([]);
  });

  test("puts and deletes the pending batch", () => {
    const withBatch = applyChanges(makeState(), { pendingBatch: { put: [batch] } });
    expect(withBatch.pendingBatch).toEqual(batch);
    expect(
      applyChanges(withBatch, { pendingBatch: { delete: ["batch"] } }).pendingBatch,
    ).toBeNull();
  });

  test("replaces the settings", () => {
    const next = applyChanges(makeState(), { settings: { put: { manualEntryAccountId: "x" } } });
    expect(next.settings).toEqual({ manualEntryAccountId: "x" });
  });

  test("replaces the whole conversation, and empties it with an empty list (R-26)", () => {
    const next: ChatTurn = { question: "And eating out?", answer: "Nothing.", sources: [] };

    expect(applyChanges(makeState(), { conversation: { put: [turn, next] } }).conversation).toEqual(
      [turn, next],
    );
    expect(applyChanges(makeState(), { conversation: { put: [] } }).conversation).toEqual([]);
  });

  test("deleting a category leaves the conversation as it is (FR-110)", () => {
    const state = makeState();
    const next = applyChanges(state, { categories: { delete: ["groceries"] } });
    expect(next.conversation).toBe(state.conversation);
  });

  test("leaves its input untouched, and keeps every store it does not change", () => {
    const state = makeState();
    const next = applyChanges(state, { accounts: { put: [{ ...cash, name: "Wallet" }] } });
    expect(state.accounts).toEqual([cash]);
    expect(next.categories).toBe(state.categories);
    expect(next.settings).toBe(state.settings);
    expect(next.conversation).toBe(state.conversation);
  });
});

describe("isRefusal", () => {
  test("tells a refusal from changes", () => {
    expect(isRefusal({ code: "account-name-taken" })).toBe(true);
    expect(isRefusal({ accounts: { put: [cash] } })).toBe(false);
    expect(isRefusal({})).toBe(false);
  });
});
