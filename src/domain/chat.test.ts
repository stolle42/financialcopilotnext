import { describe, expect, test } from "vitest";
import { chatContext } from "./chat";
import { insights } from "./insights";
import { seedState } from "./seed";
import { applyValid, everyEntityState, idCounter } from "./testing";
import type { Account, Side, State, Transaction } from "./types";

// FR-102, R-25; contracts/ai.md, finance chat: the data one question of the finance chat sends.

const TODAY = "2026-10-16";

const giro: Account = { id: "giro", name: "Giro", type: "checking", openingBalanceCents: 100000 };

type Entry =
  | { kind: Side; date: string; cents: number; category: string; description?: string }
  | { kind: "transfer"; date: string; cents: number; description?: string };

function categoryId(state: State, side: Side, name: string): string {
  const found = state.categories.find((c) => c.side === side && c.name === name);
  if (!found) throw new Error(`No ${side} category ${name}`);
  return found.id;
}

/** The seed state with a second account, Giro, and `entries` on it, in this order of entry. */
function ledger(entries: Entry[]): State {
  const seeded = seedState(idCounter());
  const cashId = seeded.accounts[0]!.id;
  const transactions = entries.map((entry, index): Transaction => {
    const fields = {
      id: `t-${index + 1}`,
      seq: index + 1,
      date: entry.date,
      amountCents: entry.cents,
      accountId: giro.id,
      description: entry.description ?? "",
    };
    return entry.kind === "transfer"
      ? { ...fields, kind: "transfer", destinationAccountId: cashId }
      : { ...fields, kind: entry.kind, categoryId: categoryId(seeded, entry.kind, entry.category) };
  });
  return applyValid(seeded, { accounts: { put: [giro] }, transactions: { put: transactions } });
}

const expense = (date: string, cents: number, category = "Groceries", description = ""): Entry => ({
  kind: "expense",
  date,
  cents,
  category,
  description,
});
const income = (date: string, cents: number, category = "Salary", description = ""): Entry => ({
  kind: "income",
  date,
  cents,
  category,
  description,
});

describe("chatContext: the period (FR-102)", () => {
  test("runs from the first day of the month 12 months back to today, one month entry each", () => {
    const context = chatContext(ledger([]), TODAY);

    expect(context.today).toBe(TODAY);
    expect(context.period).toEqual({ from: "2025-10-01", to: TODAY });
    expect(context.months.map((m) => m.month)).toEqual([
      "2025-10",
      "2025-11",
      "2025-12",
      "2026-01",
      "2026-02",
      "2026-03",
      "2026-04",
      "2026-05",
      "2026-06",
      "2026-07",
      "2026-08",
      "2026-09",
      "2026-10",
    ]);
  });

  test("reaches back across the end of a year", () => {
    const context = chatContext(ledger([]), "2026-01-05");

    expect(context.period).toEqual({ from: "2025-01-01", to: "2026-01-05" });
    expect(context.months[0]!.month).toBe("2025-01");
    expect(context.months.at(-1)!.month).toBe("2026-01");
    expect(context.months).toHaveLength(13);
  });

  test("leaves out transfers and what lies before the period or after today", () => {
    const state = ledger([
      expense("2025-09-30", 1000, "Groceries", "Before the period"),
      expense("2025-10-01", 2000, "Groceries", "First day"),
      { kind: "transfer", date: "2026-10-01", cents: 50000, description: "To savings" },
      expense(TODAY, 3000, "Groceries", "Today"),
      expense("2026-10-17", 4000, "Groceries", "Tomorrow"),
    ]);

    const context = chatContext(state, TODAY);

    expect(context.transactions.rows.map((row) => row[1])).toEqual(["First day", "Today"]);
    expect(context.months[0]!.expenses.total).toBe(20);
    expect(context.months.at(-1)!.expenses).toEqual({ total: 30, byCategory: { Groceries: 30 } });
    expect(JSON.stringify(context)).not.toContain("To savings");
  });
});

describe("chatContext: the monthly totals (FR-102, R-14)", () => {
  test("match Insights for each month, in euros, by category", () => {
    const state = ledger([
      expense("2026-08-03", 4520, "Groceries"),
      expense("2026-08-10", 1199, "Leisure"),
      expense("2026-08-21", 2480, "Groceries"),
      income("2026-08-25", 310000, "Salary"),
      expense("2026-09-02", 1299, "Leisure"),
      income("2026-09-25", 310000, "Salary"),
      income("2026-09-30", 1250, "Interest"),
    ]);

    const context = chatContext(state, TODAY);

    for (const [month, end] of [
      ["2026-08", "2026-08-31"],
      ["2026-09", "2026-09-30"],
    ] as const) {
      const { expenses, income: earned } = insights(state, { start: `${month}-01`, end });
      const entry = context.months.find((m) => m.month === month)!;
      expect(entry.expenses.total).toBe(expenses.totalCents / 100);
      expect(entry.income.total).toBe(earned.totalCents / 100);
      expect(entry.expenses.byCategory).toEqual(
        Object.fromEntries(expenses.entries.map((e) => [e.category.name, e.amountCents / 100])),
      );
      expect(entry.income.byCategory).toEqual(
        Object.fromEntries(earned.entries.map((e) => [e.category.name, e.amountCents / 100])),
      );
    }
    expect(context.months.find((m) => m.month === "2026-08")!.expenses).toEqual({
      total: 81.99,
      byCategory: { Groceries: 70, Leisure: 11.99 },
    });
  });

  test("gives a month without money zero totals", () => {
    const context = chatContext(ledger([]), TODAY);

    for (const month of context.months) {
      expect(month.expenses).toEqual({ total: 0, byCategory: {} });
      expect(month.income).toEqual({ total: 0, byCategory: {} });
    }
  });
});

describe("chatContext: the transactions (FR-102)", () => {
  test("lists each expense and income by date, then order of entry, with money out negative, in euros", () => {
    const state = ledger([
      income("2026-09-25", 310000, "Salary", "Salary September"),
      expense("2026-09-12", 1199, "Leisure", "Spotify Premium"),
      expense("2026-09-25", 1234, "Groceries", "REWE"),
      expense("2026-08-12", 1099, "Leisure", "Spotify Premium"),
    ]);

    const { transactions } = chatContext(state, TODAY);

    expect(transactions.columns).toEqual(["date", "description", "amount", "category"]);
    expect(transactions.rows).toEqual([
      ["2026-08-12", "Spotify Premium", -10.99, "Leisure"],
      ["2026-09-12", "Spotify Premium", -11.99, "Leisure"],
      ["2026-09-25", "Salary September", 3100, "Salary"],
      ["2026-09-25", "REWE", -12.34, "Groceries"],
    ]);
  });
});

describe("chatContext: accounts and budgets (FR-102)", () => {
  test("gives each account by name with its type and balance, and each budget with this month's spending", () => {
    let state = ledger([
      expense("2026-09-30", 5000, "Groceries"),
      expense("2026-10-02", 4520, "Groceries"),
      expense("2026-10-05", 1500, "Leisure"),
      { kind: "transfer", date: "2026-10-01", cents: 20000 },
    ]);
    state = applyValid(state, {
      budgets: {
        put: [
          { categoryId: categoryId(state, "expense", "Groceries"), limitCents: 40000 },
          { categoryId: categoryId(state, "expense", "Eating out"), limitCents: 15000 },
        ],
      },
    });

    const context = chatContext(state, TODAY);

    expect(context.accounts).toEqual([
      { name: "Cash", type: "cash", balance: 200 },
      { name: "Giro", type: "checking", balance: 689.8 },
    ]);
    expect(context.budgets).toEqual([
      { category: "Eating out", limit: 150, spent: 0 },
      { category: "Groceries", limit: 400, spent: 45.2 },
    ]);
  });
});

describe("chatContext: data minimisation (FR-102)", () => {
  test("holds no id, colour, mapping profile, pending import or setting", () => {
    const state = everyEntityState();

    const text = JSON.stringify(chatContext(state, "2026-09-03"));

    expect(text).toContain("Bäckerei Krüger");
    for (const id of [
      ...state.accounts.map((a) => a.id),
      ...state.categories.map((c) => c.id),
      ...state.transactions.map((t) => t.id),
      ...state.profiles.map((p) => p.id),
      "batch",
    ]) {
      expect(text).not.toContain(`"${id}"`);
    }
    expect(text).not.toMatch(/#[0-9a-f]{6}/i);
    for (const leak of [
      "MyBank",
      "Card bank",
      "mybank-2026-09.csv",
      "Card statement",
      "aiFeatures",
      "manualEntryAccountId",
      "seq",
      "Cents",
    ]) {
      expect(text).not.toContain(leak);
    }
  });

  test("gives the same context for the same state and day", () => {
    const state = everyEntityState();
    expect(JSON.stringify(chatContext(state, "2026-09-03"))).toBe(
      JSON.stringify(chatContext(state, "2026-09-03")),
    );
  });
});
