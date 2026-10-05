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
