// Helpers for domain tests only; production code never imports this file.
import { applyChanges, isRefusal, type Changes, type Context } from "./changes";
import { checkInvariants } from "./invariants";
import { seedState } from "./seed";
import type { Category, Refusal, Side, State } from "./types";

/** Ids `id-1`, `id-2`, … so tests can name the records they create. */
export function idCounter(prefix = "id"): () => string {
  let next = 0;
  return () => `${prefix}-${++next}`;
}

export function testContext(today = "2026-09-03"): Context {
  return { today, newId: idCounter("new") };
}

/** The changes of a decision that a test expects to succeed. */
export function changesOf(decision: Changes | Refusal): Changes {
  if (isRefusal(decision)) throw new Error(`Refused: ${JSON.stringify(decision)}`);
  return decision;
}

/** Applies `changes` and throws if the result breaks an invariant (data-model.md). */
export function applyValid(state: State, changes: Changes): State {
  const next = applyChanges(state, changes);
  const broken = checkInvariants(next);
  if (broken) throw new Error(`Invariant broken: ${JSON.stringify(broken)}`);
  return next;
}

/**
 * A valid state with every entity type and every variant of each: accounts of several types, a
 * renamed and a new category, each kind of transaction including a reconciliation entry, budgets,
 * profiles with and without a header row, a pending batch with review progress, a category Claude
 * suggested and an unparsable row, a manual-entry account other than Cash, AI features on, and a
 * conversation of the finance chat with every kind of turn and source. Backup tests round-trip it
 * (SC-014).
 */
export function everyEntityState(): State {
  const seeded = seedState(idCounter("seed"));
  const cash = seeded.accounts[0]!.id;
  const category = (side: Side, name: string): Category => {
    const found = seeded.categories.find((c) => c.side === side && c.name === name);
    if (!found) throw new Error(`No ${side} category ${name}`);
    return found;
  };
  const byRole = (side: Side, role: Category["role"]) =>
    seeded.categories.find((c) => c.side === side && c.role === role)!.id;
  const groceries = category("expense", "Groceries").id;
  const salary = category("income", "Salary").id;
  const fields = { accountId: "giro", description: "" };

  return applyValid(seeded, {
    accounts: {
      put: [
        { id: "giro", name: "Giro", type: "checking", openingBalanceCents: 125000 },
        { id: "card", name: "Credit card", type: "credit-card", openingBalanceCents: -25000 },
      ],
    },
    categories: {
      put: [
        { ...category("expense", "Eating out"), name: "Restaurants", color: "#e8590c" },
        { id: "pets", side: "expense", name: "Pets", color: "#82c91e", role: null },
      ],
    },
    transactions: {
      put: [
        {
          ...fields,
          id: "t1",
          seq: 1,
          date: "2026-08-01",
          amountCents: 4520,
          description: "Bäckerei Krüger, 2 × Brot €",
          kind: "expense",
          categoryId: groceries,
        },
        {
          ...fields,
          id: "t2",
          seq: 2,
          date: "2026-08-25",
          amountCents: 210000,
          kind: "income",
          categoryId: salary,
        },
        {
          ...fields,
          id: "t3",
          seq: 3,
          date: "2026-08-28",
          amountCents: 20000,
          kind: "transfer",
          destinationAccountId: cash,
        },
        {
          ...fields,
          id: "t4",
          seq: 5,
          date: "2024-02-29",
          amountCents: 0,
          kind: "expense",
          categoryId: "pets",
        },
        {
          ...fields,
          id: "t5",
          seq: 9,
          date: "2026-09-03",
          amountCents: 1500,
          accountId: cash,
          kind: "expense",
          categoryId: byRole("expense", "unaccounted"),
        },
      ],
    },
    budgets: {
      put: [
        { categoryId: groceries, limitCents: 40000 },
        { categoryId: "pets", limitCents: 2500 },
      ],
    },
    profiles: {
      put: [
        {
          id: "mybank",
          name: "MyBank",
          hasHeaderRow: true,
          dateColumn: "Date",
          descriptionColumn: "Purpose",
          counterpartyColumn: "Payee",
          amount: { mode: "signed", column: "Amount", invertSign: true },
          dateFormat: "DD.MM.YYYY",
          decimalSeparator: ",",
          encoding: "Windows-1252",
        },
        {
          id: "cardbank",
          name: "Card bank",
          hasHeaderRow: false,
          dateColumn: 0,
          descriptionColumn: 3,
          counterpartyColumn: null,
          amount: { mode: "debit-credit", debitColumn: 1, creditColumn: 2 },
          dateFormat: "MM/DD/YYYY",
          decimalSeparator: ".",
          encoding: "UTF-8",
        },
      ],
    },
    pendingBatch: {
      put: [
        {
          id: "batch",
          accountId: "giro",
          fileName: "mybank-2026-09.csv",
          createdAt: "2026-09-03T10:00:00.000Z",
          rows: [
            {
              rowNumber: 2,
              status: "parsed",
              date: "2026-09-01",
              amountCents: -4520,
              description: "Groceries",
              counterparty: "Shop",
              duplicate: false,
              included: true,
              assignment: { type: "category", categoryId: groceries, suggested: true },
            },
            {
              rowNumber: 3,
              status: "parsed",
              date: "2026-09-02",
              amountCents: 1999,
              description: "",
              counterparty: null,
              duplicate: false,
              included: true,
              assignment: { type: "category", categoryId: byRole("income", "uncategorised") },
            },
            {
              rowNumber: 4,
              status: "parsed",
              date: "2026-09-02",
              amountCents: -25000,
              description: "Card statement",
              counterparty: "Credit Card",
              duplicate: false,
              included: true,
              assignment: { type: "transfer", counterAccountId: "card" },
            },
            {
              rowNumber: 5,
              status: "parsed",
              date: "2026-08-01",
              amountCents: -4520,
              description: "Groceries",
              counterparty: "Shop",
              duplicate: true,
              included: false,
              assignment: { type: "category", categoryId: byRole("expense", "uncategorised") },
            },
            {
              rowNumber: 6,
              status: "parsed",
              date: "2026-08-25",
              amountCents: 210000,
              description: "Salary",
              counterparty: "Employer",
              duplicate: true,
              included: true,
              assignment: { type: "category", categoryId: salary },
            },
            {
              rowNumber: 7,
              status: "unparsable",
              cells: ["32.08.2026", "Shop", "Groceries", "-1,00"],
              failure: {
                code: "date-unreadable",
                details: { cell: "32.08.2026", format: "DD.MM.YYYY" },
              },
            },
          ],
        },
      ],
    },
    settings: { put: { manualEntryAccountId: "giro", aiFeatures: true } },
    conversation: {
      put: [
        {
          question: "How much did I spend on groceries in August?",
          answer: "€45.20, at Bäckerei Krüger.\nThat is all.",
          sources: [
            {
              name: "Groceries, August 2026",
              from: "2026-08-01",
              to: "2026-08-31",
              categoryId: groceries,
              accountId: "giro",
            },
            {
              name: "Everything, 2026",
              from: "2026-01-01",
              to: "2026-09-03",
              categoryId: null,
              accountId: null,
            },
            {
              name: "A category deleted since",
              from: "2026-08-01",
              to: "2026-08-31",
              categoryId: "deleted-category",
              accountId: null,
            },
          ],
        },
        { question: "And on pets?", answer: "Nothing so", stopped: true, sources: [] },
        { question: "Where does my money go?", answer: "", stopped: true, sources: [] },
        { question: "What is the capital of France?", answer: "", outOfScope: true, sources: [] },
      ],
    },
  });
}
