import { describe, expect, test } from "vitest";
import {
  accountBalance,
  createAccount,
  signedEffect,
  sortAccounts,
  updateAccount,
} from "./accounts";
import { seedState } from "./seed";
import { applyValid, changesOf, idCounter, testContext } from "./testing";
import type { Account, State, Transaction } from "./types";

const cashOf = (state: State) => state.accounts[0]!;
const groceriesOf = (state: State) => state.categories.find((c) => c.name === "Groceries")!;

/** User Story 1 up to scenario 2: Cash, and "Checking" with 1,250.00. */
function withChecking(): { state: State; checking: Account } {
  const seeded = seedState(idCounter());
  const input = { name: "Checking", type: "checking" as const, openingBalanceCents: 125000 };
  const state = applyValid(seeded, changesOf(createAccount(seeded, input, testContext())));
  return { state, checking: state.accounts.find((a) => a.name === "Checking")! };
}

function expenseOn(state: State, accountId: string, id = "t1"): Transaction {
  return {
    id,
    seq: 1,
    date: "2026-09-03",
    amountCents: 4000,
    accountId,
    description: "Weekly shop",
    kind: "expense",
    categoryId: groceriesOf(state).id,
  };
}

function withTransactions(state: State, transactions: Transaction[]): State {
  return applyValid(state, { transactions: { put: transactions } });
}

describe("signedEffect", () => {
  const base = { id: "t", seq: 1, date: "2026-09-03", amountCents: 4000, description: "" };

  test("takes an expense from its account and adds an income to it", () => {
    const expense: Transaction = { ...base, accountId: "a", kind: "expense", categoryId: "c" };
    const income: Transaction = { ...base, accountId: "a", kind: "income", categoryId: "c" };
    expect(signedEffect(expense, "a")).toBe(-4000);
    expect(signedEffect(income, "a")).toBe(4000);
    expect(signedEffect(expense, "b")).toBe(0);
  });

  test("moves a transfer from its account to its destination", () => {
    const transfer: Transaction = {
      ...base,
      accountId: "a",
      kind: "transfer",
      destinationAccountId: "b",
    };
    expect(signedEffect(transfer, "a")).toBe(-4000);
    expect(signedEffect(transfer, "b")).toBe(4000);
    expect(signedEffect(transfer, "c")).toBe(0);
  });
});

describe("accountBalance (FR-002)", () => {
  test("is 0.00 for Cash on a fresh install (scenario 1)", () => {
    const state = seedState(idCounter());
    expect(accountBalance(state, cashOf(state).id)).toBe(0);
  });

  test("is the opening balance of a new account (scenario 2)", () => {
    const { state, checking } = withChecking();
    expect(accountBalance(state, checking.id)).toBe(125000);
  });

  test("follows an expense and a transfer (scenarios 3 and 4)", () => {
    const { state, checking } = withChecking();
    const cash = cashOf(state);
    const next = withTransactions(state, [
      expenseOn(state, checking.id),
      {
        id: "t2",
        seq: 2,
        date: "2026-09-03",
        amountCents: 10000,
        accountId: checking.id,
        description: "",
        kind: "transfer",
        destinationAccountId: cash.id,
      },
    ]);
    expect(accountBalance(next, checking.id)).toBe(111000);
    expect(accountBalance(next, cash.id)).toBe(10000);
  });

  test("changes on both accounts when a transaction moves between them (edge cases)", () => {
    const { state, checking } = withChecking();
    const cash = cashOf(state);
    const expense = expenseOn(state, checking.id);
    const moved = withTransactions(withTransactions(state, [expense]), [
      { ...expense, accountId: cash.id },
    ]);
    expect(accountBalance(moved, checking.id)).toBe(125000);
    expect(accountBalance(moved, cash.id)).toBe(-4000);
  });
});

describe("createAccount (FR-001)", () => {
  test("adds an account with a new id and a trimmed name; a negative opening balance is fine", () => {
    const state = seedState(idCounter());
    const input = { name: "  Card ", type: "credit-card" as const, openingBalanceCents: -5000 };
    const next = applyValid(state, changesOf(createAccount(state, input, testContext())));
    expect(next.accounts.at(-1)).toEqual({
      id: "new-1",
      name: "Card",
      type: "credit-card",
      openingBalanceCents: -5000,
    });
  });

  test("refuses an empty name", () => {
    const state = seedState(idCounter());
    const input = { name: "  ", type: "cash" as const, openingBalanceCents: 0 };
    expect(createAccount(state, input, testContext())).toEqual({ code: "account-name-empty" });
  });

  test("refuses a name that differs from another only in case and spaces", () => {
    const state = seedState(idCounter());
    const input = { name: " cash", type: "cash" as const, openingBalanceCents: 0 };
    expect(createAccount(state, input, testContext())).toEqual({ code: "account-name-taken" });
  });
});

describe("updateAccount (FR-001)", () => {
  const input = { name: "Checking", type: "checking" as const, openingBalanceCents: 125000 };

  test("changes the opening balance, and so the balance, without a transaction (scenario 10)", () => {
    const { state, checking } = withChecking();
    const changes = changesOf(
      updateAccount(state, checking.id, { ...input, openingBalanceCents: 130000 }),
    );
    const next = applyValid(state, changes);
    expect(accountBalance(next, checking.id)).toBe(130000);
    expect(next.transactions).toEqual([]);
  });

  test("lets an account keep its own name, in another case", () => {
    const { state, checking } = withChecking();
    const changes = changesOf(updateAccount(state, checking.id, { ...input, name: "CHECKING" }));
    const renamed = applyValid(state, changes).accounts.find((a) => a.id === checking.id);
    expect(renamed?.name).toBe("CHECKING");
  });

  test("refuses another account's name, and an empty one", () => {
    const { state, checking } = withChecking();
    expect(updateAccount(state, checking.id, { ...input, name: "Cash" })).toEqual({
      code: "account-name-taken",
    });
    expect(updateAccount(state, checking.id, { ...input, name: "" })).toEqual({
      code: "account-name-empty",
    });
  });
});

describe("sortAccounts", () => {
  test("orders accounts by name, ignoring case (list order)", () => {
    const accounts = ["checking", "Cash", "bank"].map((name): Account => ({
      id: name,
      name,
      type: "other",
      openingBalanceCents: 0,
    }));
    expect(sortAccounts(accounts).map((a) => a.name)).toEqual(["bank", "Cash", "checking"]);
  });
});
