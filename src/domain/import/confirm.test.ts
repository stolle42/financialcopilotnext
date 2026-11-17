import { describe, expect, test } from "vitest";
import { accountBalance } from "../accounts";
import { protectedCategory } from "../categories";
import { seedState } from "../seed";
import { applyValid, idCounter, testContext } from "../testing";
import type { Assignment, ParsedRow, PendingRow, Side, State, Transaction } from "../types";
import { confirmBatch, confirmationCounts, discardBatch } from "./confirm";

// FR-027; data-model.md, state transitions (confirmation).

const categoryNamed = (state: State, side: Side, name: string) =>
  state.categories.find((c) => c.side === side && c.name === name)!.id;

/** Cash with one manual entry, a credit card account, and a pending batch on Cash. */
function withBatch(rows: (state: State) => PendingRow[]): State {
  const seeded = seedState(idCounter());
  const cash = seeded.accounts[0]!.id;
  const withLedger = applyValid(seeded, {
    accounts: {
      put: [{ id: "card", name: "Credit card", type: "credit-card", openingBalanceCents: 0 }],
    },
    transactions: {
      put: [
        {
          id: "manual",
          seq: 7,
          date: "2026-07-30",
          amountCents: 500,
          accountId: cash,
          description: "Coffee",
          kind: "expense",
          categoryId: categoryNamed(seeded, "expense", "Eating out"),
        },
      ],
    },
  });
  return applyValid(withLedger, {
    pendingBatch: {
      put: [
        {
          id: "batch",
          accountId: cash,
          fileName: "mybank-2026-08.csv",
          createdAt: "2026-09-03T10:00:00.000Z",
          rows: rows(withLedger),
        },
      ],
    },
  });
}

function row(
  state: State,
  rowNumber: number,
  amountCents: number,
  fields: Partial<ParsedRow> = {},
): ParsedRow {
  const side = amountCents > 0 ? "income" : "expense";
  return {
    rowNumber,
    status: "parsed",
    date: "2026-08-01",
    amountCents,
    description: `Row ${rowNumber}`,
    counterparty: null,
    duplicate: false,
    included: true,
    assignment: {
      type: "category",
      categoryId: protectedCategory(state.categories, side, "uncategorised").id,
    },
    ...fields,
  };
}

const confirmed = (state: State) => applyValid(state, confirmBatch(state, testContext()));
const added = (before: State, after: State): Transaction[] =>
  after.transactions.filter((t) => !before.transactions.includes(t));

describe("confirmBatch (FR-027)", () => {
  test("books the rows under review with their categories, untouched rows in Uncategorised, and updates balances (scenario 9)", () => {
    const state = withBatch((s) => [
      row(s, 2, -4520, {
        description: "Groceries",
        assignment: { type: "category", categoryId: categoryNamed(s, "expense", "Groceries") },
      }),
      row(s, 3, 245000, {
        description: "Salary August",
        assignment: { type: "category", categoryId: categoryNamed(s, "income", "Salary") },
      }),
      row(s, 4, -999, { description: "Monthly plan" }),
    ]);
    const next = confirmed(state);

    expect(added(state, next)).toEqual([
      {
        id: "new-1",
        seq: 8,
        date: "2026-08-01",
        amountCents: 4520,
        accountId: state.pendingBatch!.accountId,
        description: "Groceries",
        kind: "expense",
        categoryId: categoryNamed(state, "expense", "Groceries"),
      },
      expect.objectContaining({ seq: 9, amountCents: 245000, kind: "income" }),
      expect.objectContaining({
        seq: 10,
        amountCents: 999,
        kind: "expense",
        categoryId: protectedCategory(state.categories, "expense", "uncategorised").id,
      }),
    ]);
    expect(accountBalance(next, state.pendingBatch!.accountId)).toBe(-500 - 4520 + 245000 - 999);
    expect(next.pendingBatch).toBeNull();
  });

  test("books a category the AI suggested exactly as a chosen one, without the mark (FR-093)", () => {
    const groceries = (s: State) => categoryNamed(s, "expense", "Groceries");
    const chosen = withBatch((s) => [
      row(s, 2, -4520, { assignment: { type: "category", categoryId: groceries(s) } }),
    ]);
    const suggested = withBatch((s) => [
      row(s, 2, -4520, {
        assignment: { type: "category", categoryId: groceries(s), suggested: true },
      }),
    ]);

    const booked = added(suggested, confirmed(suggested));

    expect(booked).toStrictEqual(added(chosen, confirmed(chosen)));
    expect(booked[0]).not.toHaveProperty("suggested");
  });

  test("books a payment to the credit card as a transfer with no category (scenario 7)", () => {
    const transfer: Assignment = { type: "transfer", counterAccountId: "card" };
    const state = withBatch((s) => [row(s, 2, -25000, { assignment: transfer })]);
    const next = confirmed(state);
    const cash = state.pendingBatch!.accountId;

    expect(added(state, next)).toEqual([
      {
        id: "new-1",
        seq: 8,
        date: "2026-08-01",
        amountCents: 25000,
        accountId: cash,
        description: "Row 2",
        kind: "transfer",
        destinationAccountId: "card",
      },
    ]);
    expect(accountBalance(next, "card")).toBe(25000);
  });

  test("books money in marked as a transfer as coming from the counter-account", () => {
    const transfer: Assignment = { type: "transfer", counterAccountId: "card" };
    const state = withBatch((s) => [row(s, 2, 1000, { assignment: transfer })]);
    expect(added(state, confirmed(state))).toEqual([
      expect.objectContaining({
        kind: "transfer",
        accountId: "card",
        destinationAccountId: state.pendingBatch!.accountId,
        amountCents: 1000,
      }),
    ]);
  });

  test("leaves out excluded duplicates and unparsable rows, but books an included duplicate", () => {
    const state = withBatch((s) => [
      row(s, 2, -100, { duplicate: true, included: false }),
      {
        rowNumber: 3,
        status: "unparsable",
        cells: ["32.08.2026", "", "", "-2,80"],
        failure: { code: "date-unreadable" },
      },
      row(s, 4, -200, { duplicate: true, included: true }),
      row(s, 5, -300),
    ]);
    const changes = confirmBatch(state, testContext());
    expect(changes.transactions?.put?.map((t) => [t.seq, t.amountCents])).toEqual([
      [8, 200],
      [9, 300],
    ]);
  });

  test("books a zero amount as an expense of 0.00 (FR-023)", () => {
    const state = withBatch((s) => [row(s, 2, 0)]);
    expect(added(state, confirmed(state))).toEqual([
      expect.objectContaining({ kind: "expense", amountCents: 0 }),
    ]);
  });

  test("removes the batch and leaves the settings alone (FR-006)", () => {
    const state = withBatch((s) => [row(s, 2, -100)]);
    const changes = confirmBatch(state, testContext());
    expect(changes.pendingBatch).toEqual({ delete: ["batch"] });
    expect(changes.settings).toBeUndefined();
  });

  test("changes nothing when no batch is pending, so a second confirmation is harmless", () => {
    expect(confirmBatch(seedState(idCounter()), testContext())).toEqual({});
  });
});

describe("discardBatch (FR-027)", () => {
  test("removes the batch and books nothing (scenario 10)", () => {
    const state = withBatch((s) => [row(s, 2, -100), row(s, 3, 500)]);
    const next = applyValid(state, discardBatch(state));
    expect(next.pendingBatch).toBeNull();
    expect(next.transactions).toBe(state.transactions);
  });

  test("changes nothing when no batch is pending", () => {
    expect(discardBatch(seedState(idCounter()))).toEqual({});
  });
});

// FR-144, FR-145, FR-157; data-model.md, state transitions (confirmation), suggested transfers.
// The fields v1.8 adds are written through casts, because their types come with the code.

/** The vendor fields of a transaction (FR-145). */
type WithVendors = Transaction & { vendor?: string; destinationVendor?: string };

/** A transfer row that holds the suggestion to pair with the transaction `pairedTransactionId`. */
function pairedRow(
  state: State,
  rowNumber: number,
  amountCents: number,
  counterAccountId: string,
  pairedTransactionId: string,
  fields: Partial<ParsedRow> = {},
): ParsedRow {
  return row(state, rowNumber, amountCents, {
    assignment: { type: "transfer", counterAccountId, pairedTransactionId } as Assignment,
    ...fields,
  });
}

/** `withBatch`, plus transactions already in the ledger, which the rows may pair with. */
function withLedgerAnd(
  extra: (state: State) => Transaction[],
  rows: (state: State) => PendingRow[],
): State {
  const base = withBatch(rows);
  return applyValid(base, { transactions: { put: extra(base) } });
}

const byId = (state: State, id: string): WithVendors =>
  state.transactions.find((t) => t.id === id) as WithVendors;

/** Money out of Cash that the card's side recorded as an income: the payment of the card. */
const cardPaymentLedger = (s: State): Transaction[] => [
  {
    id: "card-in",
    seq: 3,
    date: "2026-07-31",
    amountCents: 50000,
    accountId: "card",
    description: "Payment received",
    kind: "income",
    categoryId: categoryNamed(s, "income", "Salary"),
  },
];

/** An expense on the card, which a row of money in on Cash can pair with. */
const cardExpense = (s: State, amountCents: number, vendor?: string): Transaction[] => [
  {
    id: "card-out",
    seq: 3,
    date: "2026-07-31",
    amountCents,
    accountId: "card",
    description: "To my account",
    kind: "expense",
    categoryId: categoryNamed(s, "expense", "Groceries"),
    ...(vendor ? { vendor } : {}),
  } as WithVendors,
];

describe("confirmBatch: a suggested transfer changes the paired transaction (FR-144)", () => {
  test("an expense on the counter-account becomes a transfer from there into the batch account", () => {
    const state = withLedgerAnd(
      (s) => cardExpense(s, 50000),
      (s) => [pairedRow(s, 2, 50000, "card", "card-out", { description: "From the card" })],
    );
    const next = confirmed(state);

    // The transaction keeps its identity and its own text; the row adds nothing to the ledger.
    expect(byId(next, "card-out")).toEqual({
      id: "card-out",
      seq: 3,
      date: "2026-07-31",
      amountCents: 50000,
      accountId: "card",
      description: "To my account",
      kind: "transfer",
      destinationAccountId: state.pendingBatch!.accountId,
    });
    expect(byId(next, "card-out")).not.toHaveProperty("categoryId");
    expect(next.transactions).toHaveLength(state.transactions.length);
    expect(next.pendingBatch).toBeNull();
  });

  test("an income on the counter-account becomes a transfer from the batch account into it", () => {
    const state = withLedgerAnd(cardPaymentLedger, (s) => [
      pairedRow(s, 2, -50000, "card", "card-in", { description: "Card payment" }),
    ]);
    const next = confirmed(state);

    expect(byId(next, "card-in")).toEqual({
      id: "card-in",
      seq: 3,
      date: "2026-07-31",
      amountCents: 50000,
      description: "Payment received",
      kind: "transfer",
      accountId: state.pendingBatch!.accountId,
      destinationAccountId: "card",
    });
    expect(next.transactions).toHaveLength(state.transactions.length);
  });

  test("a row left out changes nothing, so the transaction it was paired with stays", () => {
    const state = withLedgerAnd(cardPaymentLedger, (s) => [
      pairedRow(s, 2, -50000, "card", "card-in", { included: false }),
    ]);
    const next = confirmed(state);
    expect(next.transactions).toBe(state.transactions);
  });

  test("a pair that no longer fits books an ordinary transfer, and the transaction is untouched", () => {
    const state = withLedgerAnd(cardPaymentLedger, (s) => [
      pairedRow(s, 2, -50100, "card", "card-in"),
    ]);
    const next = confirmed(state);

    expect(byId(next, "card-in")).toBe(byId(state, "card-in"));
    expect(added(state, next)).toEqual([
      expect.objectContaining({
        id: "new-1",
        seq: 8,
        amountCents: 50100,
        kind: "transfer",
        accountId: state.pendingBatch!.accountId,
        destinationAccountId: "card",
      }),
    ]);
  });

  test("a pair whose transaction was deleted books an ordinary transfer", () => {
    const state = withBatch((s) => [pairedRow(s, 2, 50000, "card", "gone")]);
    const next = confirmed(state);
    expect(added(state, next)).toEqual([
      expect.objectContaining({
        kind: "transfer",
        accountId: "card",
        destinationAccountId: state.pendingBatch!.accountId,
        amountCents: 50000,
      }),
    ]);
  });

  test("a transaction that moved to another account no longer fits", () => {
    const state = withLedgerAnd(
      (s) => cardPaymentLedger(s).map((t) => ({ ...t, accountId: s.accounts[0]!.id })),
      (s) => [pairedRow(s, 2, -50000, "card", "card-in")],
    );
    const next = confirmed(state);
    expect(byId(next, "card-in")).toBe(byId(state, "card-in"));
    expect(added(state, next)).toHaveLength(1);
  });

  test("the rows after a pair take the next seq values, as the pair itself keeps its own", () => {
    const state = withLedgerAnd(cardPaymentLedger, (s) => [
      pairedRow(s, 2, -50000, "card", "card-in"),
      row(s, 3, -999),
      row(s, 4, -888),
    ]);
    const next = confirmed(state);
    expect(byId(next, "card-in").seq).toBe(3);
    expect(added(state, next).filter((t) => t.id !== "card-in")).toEqual([
      expect.objectContaining({ seq: 8, amountCents: 999 }),
      expect.objectContaining({ seq: 9, amountCents: 888 }),
    ]);
  });

  test("both balances are right once the batch is confirmed (scenario 2)", () => {
    // The card's side recorded the payment as an income; the bank's file shows it as money out.
    const state = withLedgerAnd(cardPaymentLedger, (s) => [
      pairedRow(s, 2, -50000, "card", "card-in"),
    ]);
    const cash = state.pendingBatch!.accountId;
    expect(accountBalance(state, "card")).toBe(50000);
    expect(accountBalance(state, cash)).toBe(-500);

    const next = confirmed(state);
    // Money left Cash and reached the card once: not twice, and not on the card's side only.
    expect(accountBalance(next, cash)).toBe(-500 - 50000);
    expect(accountBalance(next, "card")).toBe(50000);
  });

  test("the balances stay right when the other side was an expense", () => {
    const state = withLedgerAnd(
      (s) => cardExpense(s, 20000),
      (s) => [pairedRow(s, 2, 20000, "card", "card-out")],
    );
    const cash = state.pendingBatch!.accountId;
    const next = confirmed(state);
    expect(accountBalance(next, "card")).toBe(-20000);
    expect(accountBalance(next, cash)).toBe(-500 + 20000);
  });
});

describe("confirmBatch: vendors of the new transactions (FR-145)", () => {
  test("the counterparty becomes the vendor of an expense and of an income", () => {
    const state = withBatch((s) => [
      row(s, 2, -4520, { counterparty: "Market" }),
      row(s, 3, 245000, { counterparty: "Employer GmbH" }),
    ]);
    expect(added(state, confirmed(state)).map((t) => (t as WithVendors).vendor)).toEqual([
      "Market",
      "Employer GmbH",
    ]);
  });

  test("a row without counterparty gives a transaction with no vendor field at all", () => {
    const state = withBatch((s) => [row(s, 2, -4520)]);
    const [created] = added(state, confirmed(state));
    expect(created).not.toHaveProperty("vendor");
    expect(created).not.toHaveProperty("destinationVendor");
  });

  test("money out as a transfer: the counterparty is the vendor, as the batch account is the source", () => {
    const state = withBatch((s) => [
      row(s, 2, -5000, {
        counterparty: "Card issuer",
        assignment: { type: "transfer", counterAccountId: "card" },
      }),
    ]);
    const [created] = added(state, confirmed(state)) as WithVendors[];
    expect(created).toEqual(
      expect.objectContaining({
        kind: "transfer",
        accountId: state.pendingBatch!.accountId,
        destinationAccountId: "card",
        vendor: "Card issuer",
      }),
    );
    expect(created).not.toHaveProperty("destinationVendor");
  });

  test("money in as a transfer: the counterparty is the destination vendor, as the batch account is the destination", () => {
    const state = withBatch((s) => [
      row(s, 2, 5000, {
        counterparty: "Card issuer",
        assignment: { type: "transfer", counterAccountId: "card" },
      }),
    ]);
    const [created] = added(state, confirmed(state)) as WithVendors[];
    expect(created).toEqual(
      expect.objectContaining({
        kind: "transfer",
        accountId: "card",
        destinationAccountId: state.pendingBatch!.accountId,
        destinationVendor: "Card issuer",
      }),
    );
    expect(created).not.toHaveProperty("vendor");
  });

  test("a transfer without counterparty has neither vendor", () => {
    const state = withBatch((s) => [
      row(s, 2, -5000, { assignment: { type: "transfer", counterAccountId: "card" } }),
    ]);
    const [created] = added(state, confirmed(state));
    expect(created).not.toHaveProperty("vendor");
    expect(created).not.toHaveProperty("destinationVendor");
  });

  test("a paired expense keeps its own vendor on its own side; the counterparty fills the batch account's side", () => {
    const state = withLedgerAnd(
      (s) => cardExpense(s, 50000, "My bank"),
      (s) => [pairedRow(s, 2, 50000, "card", "card-out", { counterparty: "Card issuer" })],
    );
    const paired = byId(confirmed(state), "card-out");
    // The source is the card (its own side), the destination the batch account.
    expect(paired.vendor).toBe("My bank");
    expect(paired.destinationVendor).toBe("Card issuer");
  });

  test("a paired income keeps its own vendor on its own side, now the destination", () => {
    const state = withLedgerAnd(
      (s) => cardPaymentLedger(s).map((t) => ({ ...t, vendor: "My bank" }) as WithVendors),
      (s) => [pairedRow(s, 2, -50000, "card", "card-in", { counterparty: "Card issuer" })],
    );
    const paired = byId(confirmed(state), "card-in");
    // The source is the batch account, the destination the card (its own side).
    expect(paired.vendor).toBe("Card issuer");
    expect(paired.destinationVendor).toBe("My bank");
  });

  test("a paired transaction without vendor and a row without counterparty stay without vendors", () => {
    const state = withLedgerAnd(cardPaymentLedger, (s) => [
      pairedRow(s, 2, -50000, "card", "card-in"),
    ]);
    const paired = byId(confirmed(state), "card-in");
    expect(paired).not.toHaveProperty("vendor");
    expect(paired).not.toHaveProperty("destinationVendor");
  });

  test("a pair that no longer fits books its row as an ordinary transfer, with the counterparty by its side", () => {
    const state = withBatch((s) => [
      pairedRow(s, 2, -5000, "card", "gone", { counterparty: "Card issuer" }),
    ]);
    const [created] = added(state, confirmed(state)) as WithVendors[];
    expect(created!.vendor).toBe("Card issuer");
    expect(created).not.toHaveProperty("destinationVendor");
  });
});

describe("confirmationCounts: what the confirmation states (FR-157)", () => {
  test("counts the rows entering the ledger, none set aside, and the transactions becoming transfers", () => {
    const state = withLedgerAnd(cardPaymentLedger, (s) => [
      pairedRow(s, 2, -50000, "card", "card-in"),
      row(s, 3, -999),
      row(s, 4, -5000, { assignment: { type: "transfer", counterAccountId: "card" } }),
      row(s, 5, -123, { included: false }),
      {
        rowNumber: 6,
        status: "unparsable",
        cells: ["x"],
        failure: { code: "date-missing", details: {} },
      } as unknown as PendingRow,
    ]);
    expect(confirmationCounts(state)).toEqual({ entering: 3, setAside: 0, becomingTransfers: 2 });
  });

  test("counts a pair that no longer fits as a transfer too, as it will be booked as one", () => {
    const state = withBatch((s) => [pairedRow(s, 2, 50000, "card", "gone")]);
    expect(confirmationCounts(state)).toEqual({ entering: 1, setAside: 0, becomingTransfers: 1 });
  });

  test("is all zeros with no batch pending", () => {
    expect(confirmationCounts(seedState(idCounter()))).toEqual({
      entering: 0,
      setAside: 0,
      becomingTransfers: 0,
    });
  });
});
