import { describe, expect, test } from "vitest";
import {
  accountBalance,
  createAccount,
  reconcile,
  signedEffect,
  sortAccounts,
  updateAccount,
} from "./accounts";
import { seedState } from "./seed";
import { applyValid, changesOf, idCounter, testContext } from "./testing";
import type { Account, AccountType, Side, State, Transaction } from "./types";

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

describe("reconcile (FR-005)", () => {
  const unaccounted = (state: State, side: Side) =>
    state.categories.find((c) => c.side === side && c.role === "unaccounted")!;

  /** Cash at a computed 100.00: an income, an expense, and a transfer in from Checking. */
  function cashAt100(): { state: State; cash: Account; checking: Account } {
    const { state, checking } = withChecking();
    const cash = cashOf(state);
    const salary = state.categories.find((c) => c.side === "income" && c.name === "Salary")!;
    const next = withTransactions(state, [
      {
        id: "t1",
        seq: 1,
        date: "2026-09-01",
        amountCents: 15000,
        accountId: cash.id,
        description: "",
        kind: "income",
        categoryId: salary.id,
      },
      { ...expenseOn(state, cash.id, "t2"), seq: 2, amountCents: 7000 },
      {
        id: "t3",
        seq: 3,
        date: "2026-09-02",
        amountCents: 2000,
        accountId: checking.id,
        description: "",
        kind: "transfer",
        destinationAccountId: cash.id,
      },
    ]);
    expect(accountBalance(next, cash.id)).toBe(10000);
    return { state: next, cash, checking };
  }

  /** The seed state with one more account of `type`, holding `openingBalanceCents`. */
  function withAccount(type: AccountType, openingBalanceCents: number) {
    const seeded = seedState(idCounter());
    const input = { name: "Other", type, openingBalanceCents };
    const state = applyValid(seeded, changesOf(createAccount(seeded, input, testContext())));
    return { state, account: state.accounts.find((a) => a.name === "Other")! };
  }

  test("books a shortfall as an expense in expense Unaccounted, dated today (scenario 1)", () => {
    const { state, cash } = cashAt100();

    const changes = changesOf(reconcile(state, cash.id, 8500, testContext("2026-09-20")));

    expect(changes.transactions?.put).toEqual([
      {
        id: "new-1",
        seq: 4,
        date: "2026-09-20",
        amountCents: 1500,
        accountId: cash.id,
        description: "",
        kind: "expense",
        categoryId: unaccounted(state, "expense").id,
      },
    ]);
    expect(accountBalance(applyValid(state, changes), cash.id)).toBe(8500);
  });

  test("books a surplus as an income in income Unaccounted, dated today (scenario 2)", () => {
    const { state, cash } = cashAt100();

    const changes = changesOf(reconcile(state, cash.id, 12000, testContext("2026-09-20")));

    expect(changes.transactions?.put).toEqual([
      {
        id: "new-1",
        seq: 4,
        date: "2026-09-20",
        amountCents: 2000,
        accountId: cash.id,
        description: "",
        kind: "income",
        categoryId: unaccounted(state, "income").id,
      },
    ]);
    expect(accountBalance(applyValid(state, changes), cash.id)).toBe(12000);
  });

  test("refuses a stated balance equal to the computed one, booking nothing (scenario 3)", () => {
    const { state, cash } = cashAt100();
    expect(reconcile(state, cash.id, 10000, testContext())).toEqual({
      code: "reconcile-already-matches",
    });
  });

  test("leaves an account honest, so reconciling to the same amount again matches", () => {
    const { state, cash } = cashAt100();
    const next = applyValid(state, changesOf(reconcile(state, cash.id, 8500, testContext())));

    expect(reconcile(next, cash.id, 8500, testContext())).toEqual({
      code: "reconcile-already-matches",
    });
  });

  test.each<AccountType>(["checking", "savings", "credit-card", "cash", "other"])(
    "works on an account of type %s (scenario 4, FR-004)",
    (type) => {
      const { state, account } = withAccount(type, 5000);

      const next = applyValid(state, changesOf(reconcile(state, account.id, 4000, testContext())));

      expect(accountBalance(next, account.id)).toBe(4000);
    },
  );

  test.each<[number, number, Side, number, string]>([
    [-50000, -65000, "expense", 15000, "a debt that grew"],
    [-50000, -40000, "income", 10000, "a debt that shrank"],
    [2000, -3000, "expense", 5000, "a balance that turned negative"],
    [-1000, 0, "income", 1000, "a negative balance back to zero"],
  ])("from %i to %i books a %s of %i: %s", (computed, stated, kind, amountCents) => {
    const { state, account } = withAccount("credit-card", computed);

    const changes = changesOf(reconcile(state, account.id, stated, testContext()));

    expect(changes.transactions?.put).toEqual([
      expect.objectContaining({
        kind,
        amountCents,
        accountId: account.id,
        categoryId: unaccounted(state, kind).id,
      }),
    ]);
    expect(accountBalance(applyValid(state, changes), account.id)).toBe(stated);
  });

  test("refuses a negative stated balance equal to the computed one", () => {
    const { state, account } = withAccount("credit-card", -1000);
    expect(reconcile(state, account.id, -1000, testContext())).toEqual({
      code: "reconcile-already-matches",
    });
  });

  test("books one transaction and leaves the manual-entry account as it is (FR-006)", () => {
    const { state, checking } = cashAt100();
    expect(state.settings.manualEntryAccountId).not.toBe(checking.id);

    const changes = changesOf(reconcile(state, checking.id, 100000, testContext()));

    expect(Object.keys(changes)).toEqual(["transactions"]);
    expect(changes.transactions?.delete).toBeUndefined();
    expect(applyValid(state, changes).settings).toEqual(state.settings);
  });

  test("finds Unaccounted by its role, so a renamed one still takes the difference", () => {
    const { state, cash } = cashAt100();
    const renamed = applyValid(state, {
      categories: { put: [{ ...unaccounted(state, "expense"), name: "Unexplained" }] },
    });

    const changes = changesOf(reconcile(renamed, cash.id, 9000, testContext()));

    expect(changes.transactions?.put).toEqual([
      expect.objectContaining({ categoryId: unaccounted(state, "expense").id }),
    ]);
  });

  test("gives the entry the seq after the highest one, not after the count", () => {
    const { state, cash } = cashAt100();
    const gapped = withTransactions(state, [{ ...expenseOn(state, cash.id, "t9"), seq: 9 }]);

    const changes = changesOf(reconcile(gapped, cash.id, 0, testContext()));

    expect(changes.transactions?.put).toEqual([expect.objectContaining({ seq: 10 })]);
  });
});
