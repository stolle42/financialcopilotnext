import { describe, expect, test, vi } from "vitest";
import { seedState } from "@/domain/seed";
import { applyValid, idCounter } from "@/domain/testing";
import type { Side, State, Transaction } from "@/domain/types";
import {
  CHECK_ORDER,
  HELD_OUT,
  RIGHT_TO_PASS,
  chatFacts,
  checkModels,
  holdOut,
  scoreSuggestions,
  suggestionsPass,
  type CheckStep,
} from "./modelCheck";

// The pure parts of the model check of FR-131 (R-32): the hold-out of the suggestions, their
// score, the facts printed beside the chat's answers, and the order in which models are checked.
// scripts/check-models.ts asks OpenAI with them; it runs only by hand, never in npm test or CI.

const seeded = seedState(idCounter("seed"));
const cash = seeded.accounts[0]!.id;
const categoryId = (side: Side, name: string) =>
  seeded.categories.find((c) => c.side === side && c.name === name)!.id;

/** A transaction of any kind without its `id` and `seq`. */
type NewTransaction = Transaction extends infer T
  ? T extends Transaction
    ? Omit<T, "id" | "seq">
    : never
  : never;

/** The state with `transactions` added, in the order given, as `seq` 1, 2, … */
function withTransactions(transactions: NewTransaction[]): State {
  return applyValid(seeded, {
    accounts: {
      put: [{ id: "savings", name: "Savings", type: "savings", openingBalanceCents: 0 }],
    },
    transactions: {
      put: transactions.map(
        (transaction, index) =>
          ({ ...transaction, id: `t-${index + 1}`, seq: index + 1 }) as Transaction,
      ),
    },
  });
}

/** An expense or income on `date` with a description of its own, in the category named. */
const categorised = (date: string, description: string, side: Side, name: string) => ({
  date,
  description,
  amountCents: 1000,
  accountId: cash,
  kind: side,
  categoryId: categoryId(side, name),
});

/** The day `offset` days after 2026-01-01, so each transaction has a date of its own. */
const day = (offset: number) => new Date(Date.UTC(2026, 0, 1 + offset)).toISOString().slice(0, 10);

describe("the check's settings (R-32)", () => {
  test("checks gpt-5.4-mini first, then gpt-5.6-luna, then gpt-6.1-sol", () => {
    expect(CHECK_ORDER).toEqual(["gpt-5.4-mini", "gpt-5.6-luna", "gpt-6.1-sol"]);
  });

  test("holds out 100 transactions and needs 90 of them right", () => {
    expect(HELD_OUT).toBe(100);
    expect(RIGHT_TO_PASS).toBe(90);
  });
});

describe("holdOut: the suggestions' request (R-32, as R-29)", () => {
  // 130 categorised expenses and incomes on days of their own, then the newest of them, an
  // uncategorised one and a transfer, which are never held out.
  const state = withTransactions([
    ...Array.from({ length: 130 }, (_, index) =>
      index % 5 === 0
        ? categorised(day(index), `Employer ${index}`, "income", "Salary")
        : categorised(day(index), `Shop ${index}`, "expense", "Groceries"),
    ),
    categorised(day(200), "Unknown payee", "expense", "Uncategorised"),
    {
      date: day(201),
      description: "To savings",
      amountCents: 5000,
      accountId: cash,
      kind: "transfer",
      destinationAccountId: "savings",
    },
  ]);

  test("holds out the newest 100 categorised expenses and incomes, newest first", () => {
    const { request, expected } = holdOut(state);

    const newest = Array.from({ length: 100 }, (_, n) => 129 - n);
    expect(request.rows.map((row) => row.description)).toEqual(
      newest.map((index) => (index % 5 === 0 ? `Employer ${index}` : `Shop ${index}`)),
    );
    expect(request.rows.map((row) => row.side)).toEqual(
      newest.map((index) => (index % 5 === 0 ? "income" : "expense")),
    );
    expect(expected.map((entry) => entry.rowNumber)).toEqual(request.rows.map((r) => r.rowNumber));
    expect(expected.map((entry) => entry.category)).toEqual(
      newest.map((index) => (index % 5 === 0 ? "Salary" : "Groceries")),
    );
  });

  test("numbers the rows from 1, as a batch does", () => {
    const { request } = holdOut(state);
    expect(request.rows.map((row) => row.rowNumber)).toEqual(
      Array.from({ length: 100 }, (_, n) => n + 1),
    );
  });

  test("hides the held-out categories: the rows name none, and no example holds a held-out row", () => {
    const { request } = holdOut(state);

    for (const row of request.rows) {
      expect(Object.keys(row).sort()).toEqual(["counterparty", "description", "rowNumber", "side"]);
      expect(row.counterparty).toBeNull();
    }
    const heldOut = new Set(request.rows.map((row) => row.description));
    expect(request.examples.length).toBeGreaterThan(0);
    expect(request.examples.filter((example) => heldOut.has(example.description))).toEqual([]);
  });

  test("builds the examples from the rest as suggestionRequest does, newest first", () => {
    const { request } = holdOut(state);

    const rest = Array.from({ length: 30 }, (_, n) => 29 - n);
    expect(request.examples).toEqual(
      rest.map((index) =>
        index % 5 === 0
          ? { side: "income", description: `Employer ${index}`, category: "Salary" }
          : { side: "expense", description: `Shop ${index}`, category: "Groceries" },
      ),
    );
  });

  test("offers the ordinary categories of each side, as review does", () => {
    const { request } = holdOut(state);
    expect(request.categories.expense).toContain("Groceries");
    expect(request.categories.expense).not.toContain("Uncategorised");
    expect(request.categories.income).toEqual(["Gifts", "Interest", "Salary"]);
  });
});

describe("scoreSuggestions (R-32)", () => {
  const expected = [
    { rowNumber: 1, category: "Groceries" },
    { rowNumber: 2, category: "Eating out" },
    { rowNumber: 3, category: "Salary" },
  ];

  test("counts a suggestion right when it names the held-out category by name key (R-08)", () => {
    expect(
      scoreSuggestions(expected, [
        { rowNumber: 1, category: " groceries " },
        { rowNumber: 2, category: "EATING OUT" },
        { rowNumber: 3, category: "Salary" },
      ]),
    ).toBe(3);
  });

  test("counts another category, null and a row left out as wrong", () => {
    expect(
      scoreSuggestions(expected, [
        { rowNumber: 1, category: "Shopping" },
        { rowNumber: 2, category: null },
      ]),
    ).toBe(0);
  });

  test("counts a row once, and a row that was not sent never", () => {
    expect(
      scoreSuggestions(expected, [
        { rowNumber: 1, category: "Groceries" },
        { rowNumber: 1, category: "Groceries" },
        { rowNumber: 9, category: "Groceries" },
      ]),
    ).toBe(1);
  });

  test("passes a model with 90 right, and fails it with 89", () => {
    expect(suggestionsPass(90)).toBe(true);
    expect(suggestionsPass(100)).toBe(true);
    expect(suggestionsPass(89)).toBe(false);
  });
});

describe("chatFacts: what the app works out, printed beside each answer (R-32)", () => {
  const today = "2026-10-21";
  const expense = (date: string, description: string, cents: number, name: string) => ({
    ...categorised(date, description, "expense", name),
    amountCents: cents,
  });
  const state: State = {
    ...withTransactions([
      expense("2026-08-03", "Spotify Premium", 1099, "Leisure"),
      expense("2026-09-03", "Spotify Premium", 1099, "Leisure"),
      expense("2026-10-03", "Spotify Premium", 1199, "Leisure"),
      expense("2026-08-10", "Gym", 3000, "Health"),
      expense("2026-09-10", "Gym", 3000, "Health"),
      expense("2026-10-10", "Gym", 3000, "Health"),
      expense("2026-10-12", "REWE", 45000, "Groceries"),
      expense("2026-10-14", "Pizza", 2000, "Eating out"),
    ]),
    budgets: [
      { categoryId: categoryId("expense", "Groceries"), limitCents: 40000 },
      { categoryId: categoryId("expense", "Eating out"), limitCents: 10000 },
    ],
  };

  test("names each budget of today's month with its spending against its limit, over or within", () => {
    expect(chatFacts(state, today).budgets).toEqual([
      { category: "Eating out", spentCents: 2000, limitCents: 10000, overLimit: false },
      { category: "Groceries", spentCents: 45000, limitCents: 40000, overLimit: true },
    ]);
  });

  test("names each change in price of a repeated payment, with the old and new amount and its month", () => {
    expect(chatFacts(state, today).priceChanges).toEqual([
      { description: "Spotify Premium", fromCents: 1099, toCents: 1199, month: "2026-10" },
    ]);
  });

  test("names no price change for a payment that kept its amount, or was made once", () => {
    const changes = chatFacts(state, today).priceChanges.map((change) => change.description);
    expect(changes).not.toContain("Gym");
    expect(changes).not.toContain("Pizza");
  });

  test("gives each month's totals by category, as the chat's data does", () => {
    const october = chatFacts(state, today).months.find((month) => month.month === "2026-10");
    expect(october?.expenses.byCategory).toMatchObject({
      Groceries: 450,
      Leisure: 11.99,
      Health: 30,
      "Eating out": 20,
    });
  });
});

describe("checkModels: one model after another, each ending at its first failure (R-32)", () => {
  const step = (name: string, passedFor: (model: string) => boolean) => {
    const run = vi.fn((model: string) => Promise.resolve({ name, passed: passedFor(model) }));
    return { name, run } satisfies CheckStep;
  };

  test("checks every model in the order given, each through every step while they pass", async () => {
    const steps = [step("suggestions", () => true), step("chat", () => true)];

    const results = await checkModels(CHECK_ORDER, steps);

    expect(results.map((result) => result.model)).toEqual([...CHECK_ORDER]);
    expect(results.every((result) => result.passed)).toBe(true);
    expect(steps[0]!.run.mock.calls.map(([model]) => model)).toEqual([...CHECK_ORDER]);
    expect(steps[1]!.run.mock.calls.map(([model]) => model)).toEqual([...CHECK_ORDER]);
  });

  test("ends a model's check at its first failure, and goes on with the next model", async () => {
    const steps = [
      step("suggestions", () => true),
      step("What is the capital of France?", (model) => model !== "gpt-5.6-luna"),
      step("How can I reduce my spending?", () => true),
    ];

    const results = await checkModels(CHECK_ORDER, steps);

    expect(results.map((result) => [result.model, result.passed])).toEqual([
      ["gpt-5.4-mini", true],
      ["gpt-5.6-luna", false],
      ["gpt-6.1-sol", true],
    ]);
    expect(results[1]!.steps.map((s) => s.name)).toEqual([
      "suggestions",
      "What is the capital of France?",
    ]);
    expect(steps[2]!.run.mock.calls.map(([model]) => model)).toEqual([
      "gpt-5.4-mini",
      "gpt-6.1-sol",
    ]);
  });

  test("counts a step that throws as that model's failure", async () => {
    const broken: CheckStep = {
      name: "suggestions",
      run: (model) =>
        model === "gpt-5.4-mini"
          ? Promise.reject(new Error("timed out"))
          : Promise.resolve({ name: "suggestions", passed: true }),
    };
    const after = step("chat", () => true);

    const results = await checkModels(CHECK_ORDER, [broken, after]);

    expect(results[0]).toMatchObject({ model: "gpt-5.4-mini", passed: false });
    expect(after.run.mock.calls.map(([model]) => model)).toEqual(["gpt-5.6-luna", "gpt-6.1-sol"]);
  });
});
