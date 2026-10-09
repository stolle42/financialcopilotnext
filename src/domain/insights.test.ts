import { describe, expect, test } from "vitest";
import type { Period } from "./dates";
import { insights, type Breakdown, type SpendingLine, type SpendingPoint } from "./insights";
import { seedState } from "./seed";
import { applyValid, idCounter } from "./testing";
import type { Account, Side, State, Transaction } from "./types";

// R-14, FR-051, FR-052; User Story 3 scenarios 1–6, FR-012 and SC-004.

const SEPTEMBER: Period = { start: "2026-09-01", end: "2026-09-30" };

const giro: Account = { id: "giro", name: "Giro", type: "checking", openingBalanceCents: 0 };

type Entry =
  | { kind: Side; date: string; cents: number; category: string }
  | { kind: "transfer"; date: string; cents: number };

function categoryId(state: State, side: Side, name: string): string {
  const found = state.categories.find((c) => c.side === side && c.name === name);
  if (!found) throw new Error(`No ${side} category ${name}`);
  return found.id;
}

/** The seed state with a second account, Giro, and `entries` as its transactions. */
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
      description: "",
    };
    return entry.kind === "transfer"
      ? { ...fields, kind: "transfer", destinationAccountId: cashId }
      : { ...fields, kind: entry.kind, categoryId: categoryId(seeded, entry.kind, entry.category) };
  });
  return applyValid(seeded, { accounts: { put: [giro] }, transactions: { put: transactions } });
}

/** One more transaction, after those of `state`. */
function withEntry(state: State, entry: Entry): State {
  const [added] = ledger([entry]).transactions;
  const seq = state.transactions.length + 1;
  return applyValid(state, { transactions: { put: [{ ...added!, id: `t-${seq}`, seq }] } });
}

const expense = (date: string, cents: number, category = "Groceries"): Entry => ({
  kind: "expense",
  date,
  cents,
  category,
});
const income = (date: string, cents: number, category = "Salary"): Entry => ({
  kind: "income",
  date,
  cents,
  category,
});
const transfer = (date: string, cents: number): Entry => ({ kind: "transfer", date, cents });

/** Each entry as [category name, amount, marked unknown], in the breakdown's order. */
const entriesOf = (breakdown: Breakdown) =>
  breakdown.entries.map((e) => [e.category.name, e.amountCents, e.unknown]);

const sharesOf = (breakdown: Breakdown) => breakdown.entries.map((e) => e.share);

/** Each point's bucket and total, leaving out its categories. */
const totalsOf = (line: SpendingLine) =>
  line.points.map(({ bucket, totalCents }) => ({ bucket, totalCents }));

/** A point's categories as [name, amount, marked unknown], in their order. */
const categoriesOf = (point: SpendingPoint | undefined) =>
  point!.categories.map((e) => [e.category.name, e.amountCents, e.unknown]);

const lineTotal = (state: State, period: Period) =>
  insights(state, period).spending.points.reduce((sum, p) => sum + p.totalCents, 0);

describe("insights: the period", () => {
  test("counts only transactions dated within it, both ends included (scenario 1)", () => {
    const state = ledger([
      expense("2026-08-31", 1000),
      expense("2026-09-01", 2000),
      expense("2026-09-30", 3000, "Eating out"),
      expense("2026-10-01", 4000),
      income("2026-08-31", 100000),
      income("2026-09-01", 200000),
      income("2026-09-30", 5000, "Gifts"),
      income("2026-10-01", 300000),
    ]);

    const result = insights(state, SEPTEMBER);

    expect(result.expenses.totalCents).toBe(5000);
    expect(entriesOf(result.expenses)).toEqual([
      ["Eating out", 3000, false],
      ["Groceries", 2000, false],
    ]);
    expect(result.income.totalCents).toBe(205000);
    expect(entriesOf(result.income)).toEqual([
      ["Salary", 200000, false],
      ["Gifts", 5000, false],
    ]);
    expect(totalsOf(result.spending)[0]).toEqual({ bucket: "2026-09-01", totalCents: 2000 });
    expect(totalsOf(result.spending).at(-1)).toEqual({ bucket: "2026-09-30", totalCents: 3000 });
    expect(lineTotal(state, SEPTEMBER)).toBe(5000);
  });

  test("with no transactions in it, has empty breakdowns and a line of zeros (scenario 6)", () => {
    const state = ledger([expense("2026-08-15", 1000), income("2026-10-01", 2000)]);

    const result = insights(state, SEPTEMBER);

    expect(result.expenses).toEqual({ totalCents: 0, entries: [] });
    expect(result.income).toEqual({ totalCents: 0, entries: [] });
    expect(result.spending.points).toHaveLength(30);
    expect(result.spending.points.every((p) => p.totalCents === 0)).toBe(true);
  });
});

describe("insights: transfers (FR-012)", () => {
  test("leave every figure out (scenario 2)", () => {
    const state = ledger([
      expense("2026-09-03", 4000),
      income("2026-09-05", 90000),
      transfer("2026-09-04", 25000),
    ]);

    const result = insights(state, SEPTEMBER);

    expect(result.expenses.totalCents).toBe(4000);
    expect(entriesOf(result.expenses)).toEqual([["Groceries", 4000, false]]);
    expect(result.income.totalCents).toBe(90000);
    expect(entriesOf(result.income)).toEqual([["Salary", 90000, false]]);
    expect(lineTotal(state, SEPTEMBER)).toBe(4000);
  });

  test("one more transfer changes no figure (SC-004)", () => {
    const state = ledger([expense("2026-09-03", 4000), income("2026-09-05", 90000)]);
    const before = insights(state, SEPTEMBER);

    const after = insights(withEntry(state, transfer("2026-09-10", 50000)), SEPTEMBER);

    expect(after).toEqual(before);
  });
});

describe("insights: the breakdowns (FR-051, FR-052)", () => {
  test("sum each category, sort by amount and then by name, and give each share", () => {
    const state = ledger([
      expense("2026-09-01", 80000, "Housing"),
      expense("2026-09-02", 3000),
      expense("2026-09-03", 2000),
      expense("2026-09-04", 5000, "Transport"),
      expense("2026-09-05", 100, "Health"),
    ]);

    const result = insights(state, SEPTEMBER);

    expect(result.expenses.totalCents).toBe(90100);
    expect(entriesOf(result.expenses)).toEqual([
      ["Housing", 80000, false],
      ["Groceries", 5000, false],
      ["Transport", 5000, false],
      ["Health", 100, false],
    ]);
    const shares = sharesOf(result.expenses);
    [80000, 5000, 5000, 100].forEach((cents, i) => expect(shares[i]).toBeCloseTo(cents / 90100));
    expect(shares.reduce((sum, share) => sum + share, 0)).toBeCloseTo(1);
  });

  test("keep each side's categories to its own breakdown", () => {
    const state = ledger([
      expense("2026-09-02", 3000, "Uncategorised"),
      income("2026-09-02", 7000, "Uncategorised"),
    ]);

    const result = insights(state, SEPTEMBER);

    expect(result.expenses.entries.map((e) => e.category.side)).toEqual(["expense"]);
    expect(result.income.entries.map((e) => e.category.side)).toEqual(["income"]);
    expect(result.expenses.totalCents).toBe(3000);
    expect(result.income.totalCents).toBe(7000);
  });

  test("show Uncategorised as its own entry, known, on both sides (scenario 5)", () => {
    const state = ledger([
      expense("2026-09-02", 2000),
      expense("2026-09-03", 500, "Uncategorised"),
      income("2026-09-04", 10000),
      income("2026-09-05", 1500, "Uncategorised"),
    ]);

    const result = insights(state, SEPTEMBER);

    expect(entriesOf(result.expenses)).toEqual([
      ["Groceries", 2000, false],
      ["Uncategorised", 500, false],
    ]);
    expect(entriesOf(result.income)).toEqual([
      ["Salary", 10000, false],
      ["Uncategorised", 1500, false],
    ]);
  });

  test("show a shortfall as expense Unaccounted, unknown, at its true share (scenario 3)", () => {
    const state = ledger([expense("2026-09-02", 3000), expense("2026-09-20", 1000, "Unaccounted")]);

    const result = insights(state, SEPTEMBER);

    expect(result.expenses.totalCents).toBe(4000);
    expect(entriesOf(result.expenses)).toEqual([
      ["Groceries", 3000, false],
      ["Unaccounted", 1000, true],
    ]);
    expect(sharesOf(result.expenses)).toEqual([0.75, 0.25]);
    // A shortfall is money that left the account, so it is spending.
    expect(lineTotal(state, SEPTEMBER)).toBe(4000);
  });

  test("show a surplus as income Unaccounted, and nowhere else (scenario 4)", () => {
    const state = ledger([income("2026-09-25", 10000), income("2026-09-30", 2500, "Unaccounted")]);

    const result = insights(state, SEPTEMBER);

    expect(entriesOf(result.income)).toEqual([
      ["Salary", 10000, false],
      ["Unaccounted", 2500, true],
    ]);
    expect(sharesOf(result.income)).toEqual([0.8, 0.2]);
    expect(result.expenses).toEqual({ totalCents: 0, entries: [] });
    expect(lineTotal(state, SEPTEMBER)).toBe(0);
  });

  test("find Unaccounted by its role, so a renamed one is still unknown", () => {
    const state = ledger([expense("2026-09-02", 1000, "Unaccounted")]);
    const unaccounted = state.categories.find(
      (c) => c.side === "expense" && c.role === "unaccounted",
    )!;
    const renamed = applyValid(state, {
      categories: { put: [{ ...unaccounted, name: "Unexplained" }] },
    });

    expect(entriesOf(insights(renamed, SEPTEMBER).expenses)).toEqual([["Unexplained", 1000, true]]);
  });

  test("give a category whose transactions add up to 0.00 no entry", () => {
    const state = ledger([expense("2026-09-02", 0), income("2026-09-03", 0)]);

    const result = insights(state, SEPTEMBER);

    expect(result.expenses).toEqual({ totalCents: 0, entries: [] });
    expect(result.income).toEqual({ totalCents: 0, entries: [] });
  });
});

describe("insights: the spending line (R-14)", () => {
  test("has one point per day up to 92 days, summing each day's expenses only", () => {
    const state = ledger([
      expense("2026-09-03", 1000),
      expense("2026-09-03", 500, "Eating out"),
      expense("2026-09-10", 2000),
      income("2026-09-10", 9999),
    ]);

    const { spending } = insights(state, SEPTEMBER);

    expect(spending.granularity).toBe("day");
    expect(spending.points).toHaveLength(30);
    expect(spending.points.map((p) => p.bucket)).toEqual(
      Array.from({ length: 30 }, (_, i) => `2026-09-${String(i + 1).padStart(2, "0")}`),
    );
    expect(totalsOf(spending)[2]).toEqual({ bucket: "2026-09-03", totalCents: 1500 });
    expect(totalsOf(spending)[9]).toEqual({ bucket: "2026-09-10", totalCents: 2000 });
    expect(spending.points.filter((p) => p.totalCents !== 0)).toHaveLength(2);
  });

  test("is still daily at 92 days, and monthly from 93", () => {
    const state = ledger([expense("2026-07-01", 1000), expense("2026-10-01", 2000)]);

    const quarter = insights(state, { start: "2026-07-01", end: "2026-09-30" }).spending;
    expect(quarter.granularity).toBe("day");
    expect(quarter.points).toHaveLength(92);

    const longer = insights(state, { start: "2026-07-01", end: "2026-10-01" }).spending;
    expect(longer.granularity).toBe("month");
    expect(totalsOf(longer)).toEqual([
      { bucket: "2026-07", totalCents: 1000 },
      { bucket: "2026-08", totalCents: 0 },
      { bucket: "2026-09", totalCents: 0 },
      { bucket: "2026-10", totalCents: 2000 },
    ]);
  });

  test("counts only the period's days in its partial first and last months", () => {
    const state = ledger([
      expense("2026-01-10", 1000),
      expense("2026-01-20", 2000),
      expense("2026-03-05", 3000),
      expense("2026-06-10", 4000),
      expense("2026-06-11", 5000),
    ]);

    const { spending } = insights(state, { start: "2026-01-15", end: "2026-06-10" });

    expect(spending.granularity).toBe("month");
    expect(totalsOf(spending)).toEqual([
      { bucket: "2026-01", totalCents: 2000 },
      { bucket: "2026-02", totalCents: 0 },
      { bucket: "2026-03", totalCents: 3000 },
      { bucket: "2026-04", totalCents: 0 },
      { bucket: "2026-05", totalCents: 0 },
      { bucket: "2026-06", totalCents: 4000 },
    ]);
  });

  test("has twelve monthly points over a year, across a leap day", () => {
    const state = ledger([expense("2024-02-29", 1200), expense("2024-12-31", 3400)]);

    const { spending } = insights(state, { start: "2024-01-01", end: "2024-12-31" });

    expect(spending.granularity).toBe("month");
    expect(spending.points).toHaveLength(12);
    expect(totalsOf(spending)[1]).toEqual({ bucket: "2024-02", totalCents: 1200 });
    expect(totalsOf(spending)[11]).toEqual({ bucket: "2024-12", totalCents: 3400 });
  });
});

describe("insights: each point's categories (FR-087, FR-052)", () => {
  test("are the point's expenses by category, largest first and by name on a tie", () => {
    const state = ledger([
      expense("2026-09-03", 500, "Health"),
      expense("2026-09-03", 1000),
      expense("2026-09-03", 500, "Eating out"),
      expense("2026-09-03", 250),
      income("2026-09-03", 9999),
      transfer("2026-09-03", 7777),
      expense("2026-09-04", 300, "Transport"),
    ]);

    const { points } = insights(state, SEPTEMBER).spending;

    expect(categoriesOf(points[2])).toEqual([
      ["Groceries", 1250, false],
      ["Eating out", 500, false],
      ["Health", 500, false],
    ]);
    expect(categoriesOf(points[3])).toEqual([["Transport", 300, false]]);
  });

  test("mark Unaccounted as unknown", () => {
    const state = ledger([expense("2026-09-03", 1500, "Unaccounted"), expense("2026-09-03", 4000)]);

    const { points } = insights(state, SEPTEMBER).spending;

    expect(categoriesOf(points[2])).toEqual([
      ["Groceries", 4000, false],
      ["Unaccounted", 1500, true],
    ]);
  });

  test("sum a monthly point's month, within the period", () => {
    const state = ledger([
      expense("2026-06-30", 9000),
      expense("2026-07-01", 1000),
      expense("2026-07-20", 500),
      expense("2026-07-21", 700, "Eating out"),
    ]);

    const { granularity, points } = insights(state, {
      start: "2026-07-01",
      end: "2026-10-01",
    }).spending;

    expect(granularity).toBe("month");
    expect(categoriesOf(points[0])).toEqual([
      ["Groceries", 1500, false],
      ["Eating out", 700, false],
    ]);
  });

  test("are none for a point without spending", () => {
    const state = ledger([expense("2026-09-03", 1000), income("2026-09-01", 5000)]);

    const { points } = insights(state, SEPTEMBER).spending;

    expect(categoriesOf(points[0])).toEqual([]);
    expect(categoriesOf(points[1])).toEqual([]);
  });
});
