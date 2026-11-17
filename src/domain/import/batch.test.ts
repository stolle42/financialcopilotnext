import { describe, expect, test } from "vitest";
import { protectedCategory } from "../categories";
import { seedState } from "../seed";
import { applyValid, changesOf, idCounter, testContext } from "../testing";
import type { MappingProfile, State } from "../types";
import { canStartImport, createBatch } from "./batch";

// FR-020 – FR-029; contracts/csv-import.md, pipeline; data-model.md, pending row.

const myBank: MappingProfile = {
  id: "mybank",
  name: "MyBank",
  hasHeaderRow: true,
  dateColumn: "Date",
  descriptionColumn: "Purpose",
  counterpartyColumn: "Payee",
  amount: { mode: "signed", column: "Amount", invertSign: false },
  dateFormat: "DD.MM.YYYY",
  decimalSeparator: ",",
  encoding: "Windows-1252",
};

const records = [
  ["Date", "Payee", "Purpose", "Amount"],
  ["01.08.2026", "Employer GmbH", "Salary August", "2.450,00"],
  ["01.08.2026", "Shop", "Groceries", "-45,20"],
  ["12.08.2026", "Parking", "Ticket", "-2,00"],
  ["12.08.2026", "Parking", "Ticket", "-2,00"],
  ["32.08.2026", "Kiosk", "Newspaper", "-2,80"],
  ["13.08.2026", "", "Zero fee", "0,00"],
];

function seeded(): State {
  return seedState(idCounter());
}

function input(state: State, fields: Partial<Parameters<typeof createBatch>[1]> = {}) {
  return {
    accountId: state.accounts[0]!.id,
    profile: myBank,
    fileName: "mybank-2026-08.csv",
    createdAt: "2026-09-03T10:00:00.000Z",
    records,
    ...fields,
  };
}

const withBatch = (state: State) =>
  applyValid(state, changesOf(createBatch(state, input(state), testContext())));

describe("canStartImport (FR-022)", () => {
  test("allows an import when no batch is pending", () => {
    expect(canStartImport(seeded())).toBeNull();
  });

  test("refuses while a batch is pending", () => {
    expect(canStartImport(withBatch(seeded()))).toEqual({ code: "import-batch-pending" });
  });
});

describe("createBatch", () => {
  test("holds every parsed row under review in its side's Uncategorised, and every unparsable row", () => {
    const state = seeded();
    const next = withBatch(state);
    const uncategorised = (side: "expense" | "income") => ({
      type: "category",
      categoryId: protectedCategory(state.categories, side, "uncategorised").id,
    });

    expect(next.pendingBatch).toEqual({
      id: "new-1",
      accountId: state.accounts[0]!.id,
      fileName: "mybank-2026-08.csv",
      createdAt: "2026-09-03T10:00:00.000Z",
      rows: [
        expect.objectContaining({
          rowNumber: 2,
          amountCents: 245000,
          duplicate: false,
          included: true,
          assignment: uncategorised("income"),
        }),
        expect.objectContaining({ rowNumber: 3, assignment: uncategorised("expense") }),
        expect.objectContaining({ rowNumber: 4, duplicate: false, included: true }),
        // The second of an identical same-day pair is flagged and left out by default.
        expect.objectContaining({ rowNumber: 5, duplicate: true, included: false }),
        expect.objectContaining({ rowNumber: 6, status: "unparsable" }),
        // A zero amount is proposed as an expense (FR-023).
        expect.objectContaining({ rowNumber: 7, assignment: uncategorised("expense") }),
      ],
    });
  });

  test("changes no balance, figure or ledger record (scenario 1, FR-022)", () => {
    const state = seeded();
    const changes = changesOf(createBatch(state, input(state), testContext()));
    expect(Object.keys(changes)).toEqual(["pendingBatch"]);
  });

  test("flags rows that are already in the ledger", () => {
    const state = applyValid(seeded(), {
      transactions: {
        put: [
          {
            id: "t1",
            seq: 1,
            date: "2026-08-01",
            amountCents: 4520,
            accountId: seeded().accounts[0]!.id,
            description: "Different text",
            kind: "expense",
            categoryId: protectedCategory(seeded().categories, "expense", "uncategorised").id,
          },
        ],
      },
    });
    const rows = withBatch(state).pendingBatch!.rows;
    expect(rows[1]).toMatchObject({ rowNumber: 3, duplicate: true, included: false });
  });

  test("refuses while a batch is pending", () => {
    const state = withBatch(seeded());
    expect(createBatch(state, input(state), testContext())).toEqual({
      code: "import-batch-pending",
    });
  });

  test("refuses without an account, or with one that does not exist (FR-020)", () => {
    const state = seeded();
    expect(createBatch(state, input(state, { accountId: null }), testContext())).toEqual({
      code: "import-account-missing",
    });
    expect(createBatch(state, input(state, { accountId: "gone" }), testContext())).toEqual({
      code: "import-account-missing",
    });
  });

  test("refuses the layout refusals of the file, creating no batch", () => {
    const state = seeded();
    const renamed = [["Date", "Payee", "Purpose", "Value"], ...records.slice(1)];
    expect(createBatch(state, input(state, { records: renamed }), testContext())).toEqual({
      code: "import-missing-columns",
      details: { columns: ["Amount"] },
    });
    expect(
      createBatch(state, input(state, { records: records.slice(0, 1) }), testContext()),
    ).toEqual({ code: "import-no-transactions" });
  });

  test("keeps no reference to the profile, so changing the profile cannot change the batch (FR-021)", () => {
    expect(JSON.stringify(withBatch(seeded()).pendingBatch)).not.toContain('mybank"');
  });
});

// FR-142, FR-156, FR-158; data-model.md, state transitions, steps 1, 2 and 4: `createBatch` flags
// duplicates first, then pairs the rows not flagged with the other side of a transfer, and starts
// a paired row as its suggested transfer. The marks and the new transfer assignment's fields are
// not typed yet, so the rows are read through toMatchObject and toHaveProperty.
describe("createBatch: suggested transfers (FR-142)", () => {
  const cash = () => seeded().accounts[0]!;
  const checking = { id: "checking", name: "Checking", type: "checking", openingBalanceCents: 0 };

  function ledger(): State {
    const state = seeded();
    const groceries = state.categories.find((c) => c.side === "expense" && c.name === "Groceries")!;
    const salary = state.categories.find((c) => c.side === "income" && c.name === "Salary")!;
    return applyValid(state, {
      accounts: { put: [{ ...checking, type: "checking" as const }] },
      transactions: {
        put: [
          // The other side of row 2, a day before it.
          {
            id: "withdrawal",
            seq: 1,
            date: "2026-08-02",
            amountCents: 50000,
            accountId: checking.id,
            description: "Cash from the machine",
            kind: "expense",
            categoryId: groceries.id,
          },
          // Row 4 is a duplicate of the income on Cash, and would also pair with this expense.
          {
            id: "refund-in-cash",
            seq: 2,
            date: "2026-08-10",
            amountCents: 3000,
            accountId: cash().id,
            description: "Already booked",
            kind: "income",
            categoryId: salary.id,
          },
          {
            id: "refund-out-of-checking",
            seq: 3,
            date: "2026-08-10",
            amountCents: 3000,
            accountId: checking.id,
            description: "Would pair",
            kind: "expense",
            categoryId: groceries.id,
          },
        ],
      },
    });
  }

  const file = [
    ["Date", "Payee", "Purpose", "Amount"],
    ["03.08.2026", "Bank", "Cash in", "500,00"],
    ["05.08.2026", "Shop", "Groceries", "-45,20"],
    ["10.08.2026", "Bank", "Cash in", "30,00"],
  ];

  function batchOf(state: State) {
    const next = applyValid(
      state,
      changesOf(createBatch(state, input(state, { records: file }), testContext())),
    );
    return next.pendingBatch!.rows;
  }

  test("starts a row with its other side in the ledger as a suggested transfer, without usual", () => {
    const rows = batchOf(ledger());

    expect(rows[0]).toMatchObject({
      rowNumber: 2,
      duplicate: false,
      included: true,
      assignment: {
        type: "transfer",
        counterAccountId: checking.id,
        pairedTransactionId: "withdrawal",
      },
    });
    expect(rows[0]).toHaveProperty("assignment", {
      type: "transfer",
      counterAccountId: checking.id,
      pairedTransactionId: "withdrawal",
    });
  });

  test("leaves a row without other side in its side's Uncategorised", () => {
    const state = ledger();
    const rows = batchOf(state);
    expect(rows[1]).toHaveProperty("assignment", {
      type: "category",
      categoryId: protectedCategory(state.categories, "expense", "uncategorised").id,
    });
  });

  test("flags duplicates first: a flagged row that would pair gets no suggested transfer", () => {
    const state = ledger();
    const rows = batchOf(state);
    expect(rows[2]).toMatchObject({ rowNumber: 4, duplicate: true, included: false });
    expect(rows[2]).toHaveProperty("assignment", {
      type: "category",
      categoryId: protectedCategory(state.categories, "income", "uncategorised").id,
    });
  });

  test("starts no row with keptInReview, seen or groupSeen", () => {
    for (const row of batchOf(ledger())) {
      expect(row).not.toHaveProperty("keptInReview");
      expect(row).not.toHaveProperty("seen");
      expect(row).not.toHaveProperty("groupSeen");
    }
  });

  test("pairs a transaction with one row only, the earlier row of equal rows", () => {
    const twice = [
      ["Date", "Payee", "Purpose", "Amount"],
      ["03.08.2026", "Bank", "Cash in", "500,00"],
      ["03.08.2026", "Bank", "Cash in again", "500,00"],
    ];
    const state = ledger();
    const rows = applyValid(
      state,
      changesOf(createBatch(state, input(state, { records: twice }), testContext())),
    ).pendingBatch!.rows;

    // The second row is flagged as a duplicate of the first (FR-024), so only one row pairs.
    expect(rows[0]).toHaveProperty("assignment.pairedTransactionId", "withdrawal");
    expect(rows[1]).toHaveProperty("duplicate", true);
    expect(rows[1]).not.toHaveProperty("assignment.pairedTransactionId");
  });

  test("changes only the pending batch, and not the transaction it pairs with", () => {
    const state = ledger();
    const changes = changesOf(createBatch(state, input(state, { records: file }), testContext()));
    expect(Object.keys(changes)).toEqual(["pendingBatch"]);
  });
});

// FR-146, FR-147, FR-158; data-model.md, state transitions, steps 3 and 4: after pairing,
// `createBatch` finds each row's usual choice and starts the row with it, marked `usual`. The
// vendors of the ledger and the marks are fields of v1.8 the types do not carry yet, so they are
// written through casts and read with toHaveProperty.
describe("createBatch: usual choices (FR-146, FR-158)", () => {
  const checking = { id: "checking", name: "Checking", type: "checking" as const };
  const savings = { id: "savings", name: "Savings", type: "savings" as const };

  const category = (state: State, side: "expense" | "income", name: string) =>
    state.categories.find((c) => c.side === side && c.name === name)!;

  /** Earlier transactions of Cash and the other accounts, which `build` makes from the state. */
  function ledgerWith(build: (state: State) => object[]): State {
    const state = seeded();
    const withAccounts = applyValid(state, {
      accounts: {
        put: [
          { ...checking, openingBalanceCents: 0 },
          { ...savings, openingBalanceCents: 0 },
        ],
      },
    });
    return applyValid(withAccounts, {
      transactions: {
        put: build(withAccounts).map((t, index) => ({
          id: `earlier-${index + 1}`,
          seq: index + 1,
          date: "2026-07-10",
          amountCents: 1500,
          description: "Earlier",
          ...t,
        })) as never,
      },
    });
  }

  const cashId = (state: State) => state.accounts[0]!.id;

  const expenses = (state: State, vendor: string, categoryId: string, count: number) =>
    Array.from({ length: count }, () => ({
      accountId: cashId(state),
      kind: "expense",
      categoryId,
      vendor,
    }));
  const incomes = (state: State, vendor: string, categoryId: string, count: number) =>
    Array.from({ length: count }, () => ({
      accountId: cashId(state),
      kind: "income",
      categoryId,
      vendor,
    }));

  function rowsOf(state: State, records: string[][]) {
    const next = applyValid(
      state,
      changesOf(
        createBatch(
          state,
          input(state, { records: [["Date", "Payee", "Purpose", "Amount"], ...records] }),
          testContext(),
        ),
      ),
    );
    return next.pendingBatch!.rows;
  }

  test("a usual category starts as that category, marked usual", () => {
    const state = ledgerWith((s) => expenses(s, "REWE", category(s, "expense", "Groceries").id, 3));
    const [row] = rowsOf(state, [["01.08.2026", "REWE", "Weekly shop", "-20,00"]]);
    expect(row).toHaveProperty("assignment", {
      type: "category",
      categoryId: category(state, "expense", "Groceries").id,
      usual: true,
    });
  });

  test("a usual category of money in is an income category", () => {
    const state = ledgerWith((s) => incomes(s, "REWE", category(s, "income", "Gifts").id, 2));
    const [row] = rowsOf(state, [["01.08.2026", "rewe", "Voucher", "20,00"]]);
    expect(row).toHaveProperty("assignment", {
      type: "category",
      categoryId: category(state, "income", "Gifts").id,
      usual: true,
    });
  });

  test("a usual transfer starts as a transfer with that counter-account, marked usual", () => {
    const state = ledgerWith((s) =>
      Array.from({ length: 3 }, () => ({
        accountId: cashId(s),
        kind: "transfer",
        destinationAccountId: checking.id,
        vendor: "Geldautomat",
      })),
    );
    const [row] = rowsOf(state, [["01.08.2026", "Geldautomat", "Withdrawal", "-40,00"]]);
    expect(row).toHaveProperty("assignment", {
      type: "transfer",
      counterAccountId: checking.id,
      usual: true,
    });
  });

  test("a row with both a suggested transfer and a usual category starts with the transfer and keeps the category", () => {
    const state = ledgerWith((s) => [
      // The other side of the row, a day before it.
      {
        accountId: checking.id,
        kind: "expense",
        categoryId: category(s, "expense", "Groceries").id,
        amountCents: 50000,
        date: "2026-08-02",
        vendor: "Somebody",
      },
      ...incomes(s, "Bank", category(s, "income", "Interest").id, 2),
    ]);
    const [row] = rowsOf(state, [["03.08.2026", "Bank", "Cash in", "500,00"]]);
    expect(row).toHaveProperty("assignment", {
      type: "transfer",
      counterAccountId: checking.id,
      pairedTransactionId: "earlier-1",
      usualCategoryId: category(state, "income", "Interest").id,
    });
    expect(row).not.toHaveProperty("assignment.usual");
  });

  test("a row with both a suggested transfer and a usual transfer starts with the suggested one, without usual", () => {
    const state = ledgerWith((s) => [
      {
        accountId: checking.id,
        kind: "expense",
        categoryId: category(s, "expense", "Groceries").id,
        amountCents: 50000,
        date: "2026-08-02",
      },
      ...Array.from({ length: 3 }, () => ({
        accountId: savings.id,
        kind: "transfer",
        destinationAccountId: cashId(s),
        destinationVendor: "Bank",
      })),
    ]);
    const [row] = rowsOf(state, [["03.08.2026", "Bank", "Cash in", "500,00"]]);
    expect(row).toHaveProperty("assignment", {
      type: "transfer",
      counterAccountId: checking.id,
      pairedTransactionId: "earlier-1",
    });
    expect(row).not.toHaveProperty("assignment.usual");
    expect(row).not.toHaveProperty("assignment.usualCategoryId");
  });

  test("any other row starts in its side's Uncategorised, with no mark", () => {
    const state = ledgerWith((s) => [
      ...expenses(s, "Amazon", category(s, "expense", "Housing").id, 1),
      ...expenses(s, "Amazon", category(s, "expense", "Leisure").id, 1),
      ...expenses(s, "Kiosk", protectedCategory(s.categories, "expense", "uncategorised").id, 3),
    ]);
    const rows = rowsOf(state, [
      ["01.08.2026", "Amazon", "Order", "-20,00"],
      ["02.08.2026", "Kiosk", "Paper", "-2,00"],
      ["03.08.2026", "Unknown", "Something", "-3,00"],
      ["04.08.2026", "", "No vendor", "-4,00"],
      ["05.08.2026", "Amazon", "Refund", "9,00"],
    ]);
    for (const row of rows) {
      const side = (row as { amountCents: number }).amountCents > 0 ? "income" : "expense";
      expect(row).toHaveProperty("assignment", {
        type: "category",
        categoryId: protectedCategory(state.categories, side, "uncategorised").id,
      });
    }
  });

  test("a row flagged as a duplicate gets its usual choice too, so including it shows the same start", () => {
    const state = ledgerWith((s) => [
      // The row below matches this one exactly (FR-024).
      {
        accountId: cashId(s),
        kind: "expense",
        categoryId: category(s, "expense", "Groceries").id,
        amountCents: 2000,
        date: "2026-08-01",
        vendor: "REWE",
      },
      ...expenses(s, "REWE", category(s, "expense", "Groceries").id, 2),
    ]);
    const [row] = rowsOf(state, [["01.08.2026", "REWE", "Weekly shop", "-20,00"]]);
    expect(row).toMatchObject({ duplicate: true, included: false });
    expect(row).toHaveProperty("assignment", {
      type: "category",
      categoryId: category(state, "expense", "Groceries").id,
      usual: true,
    });
  });

  test("only the pending batch is written", () => {
    const state = ledgerWith((s) => expenses(s, "REWE", category(s, "expense", "Groceries").id, 3));
    const changes = changesOf(
      createBatch(
        state,
        input(state, {
          records: [
            ["Date", "Payee", "Purpose", "Amount"],
            ["01.08.2026", "REWE", "Weekly shop", "-20,00"],
          ],
        }),
        testContext(),
      ),
    );
    expect(Object.keys(changes)).toEqual(["pendingBatch"]);
  });
});
