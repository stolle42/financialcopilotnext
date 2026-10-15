import { describe, expect, test } from "vitest";
import { checkInvariants } from "./invariants";
import type {
  Category,
  MappingProfile,
  ParsedRow,
  PendingBatch,
  State,
  Transaction,
} from "./types";

function category(id: string, side: Category["side"], role: Category["role"] = null): Category {
  return { id, side, name: id, color: "#40c057", role };
}

const headerProfile: MappingProfile = {
  id: "bank",
  name: "MyBank",
  hasHeaderRow: true,
  dateColumn: "Date",
  descriptionColumn: "Text",
  counterpartyColumn: "Payee",
  amount: { mode: "signed", column: "Amount", invertSign: false },
  dateFormat: "DD.MM.YYYY",
  decimalSeparator: ",",
  encoding: "UTF-8",
};

const positionProfile: MappingProfile = {
  id: "card",
  name: "Card",
  hasHeaderRow: false,
  dateColumn: 0,
  descriptionColumn: 1,
  counterpartyColumn: null,
  amount: { mode: "debit-credit", debitColumn: 2, creditColumn: 3 },
  dateFormat: "YYYY-MM-DD",
  decimalSeparator: ".",
  encoding: "Windows-1252",
};

const expenseRow: ParsedRow = {
  rowNumber: 2,
  status: "parsed",
  date: "2026-09-03",
  amountCents: -4000,
  description: "Weekly shop",
  counterparty: "Shop",
  duplicate: false,
  included: true,
  assignment: { type: "category", categoryId: "expense-uncategorised" },
};

const transferRow: ParsedRow = {
  ...expenseRow,
  rowNumber: 3,
  amountCents: 10000,
  assignment: { type: "transfer", counterAccountId: "cash" },
};

const batch: PendingBatch = {
  id: "batch",
  accountId: "checking",
  fileName: "bank.csv",
  createdAt: "2026-09-03T10:00:00.000Z",
  rows: [
    expenseRow,
    transferRow,
    { rowNumber: 4, status: "unparsable", cells: ["x"], failure: { code: "date-unreadable" } },
  ],
};

/** A valid state that touches every entity type. */
function validState(): State {
  return {
    accounts: [
      { id: "cash", name: "Cash", type: "cash", openingBalanceCents: 0 },
      { id: "checking", name: "Checking", type: "checking", openingBalanceCents: -5000 },
    ],
    categories: [
      category("expense-uncategorised", "expense", "uncategorised"),
      category("expense-unaccounted", "expense", "unaccounted"),
      category("groceries", "expense"),
      category("income-uncategorised", "income", "uncategorised"),
      category("income-unaccounted", "income", "unaccounted"),
      category("salary", "income"),
    ],
    transactions: [
      {
        id: "t1",
        seq: 1,
        date: "2026-09-03",
        amountCents: 4000,
        accountId: "cash",
        description: "",
        kind: "expense",
        categoryId: "groceries",
      },
      {
        id: "t2",
        seq: 2,
        date: "2026-09-04",
        amountCents: 10000,
        accountId: "checking",
        description: "",
        kind: "transfer",
        destinationAccountId: "cash",
      },
      {
        id: "t3",
        seq: 3,
        date: "2026-09-05",
        amountCents: 0,
        accountId: "checking",
        description: "Salary",
        kind: "income",
        categoryId: "salary",
      },
    ],
    budgets: [{ categoryId: "groceries", limitCents: 40000 }],
    profiles: [headerProfile, positionProfile],
    pendingBatch: batch,
    settings: { manualEntryAccountId: "cash" },
  };
}

function withTransaction(index: number, change: Record<string, unknown>): State {
  const state = validState();
  const transactions = [...state.transactions];
  transactions[index] = { ...transactions[index], ...change } as Transaction;
  return { ...state, transactions };
}

function withRow(row: Record<string, unknown>): State {
  const state = validState();
  return { ...state, pendingBatch: { ...batch, rows: [{ ...expenseRow, ...row } as ParsedRow] } };
}

function withProfile(change: Record<string, unknown>): State {
  return { ...validState(), profiles: [{ ...headerProfile, ...change } as MappingProfile] };
}

function renameCategory(id: string, name: string, extra: Partial<Category> = {}): State {
  const state = validState();
  return {
    ...state,
    categories: state.categories.map((c) => (c.id === id ? { ...c, name, ...extra } : c)),
  };
}

describe("checkInvariants", () => {
  test("passes a valid state", () => {
    expect(checkInvariants(validState())).toBeNull();
  });

  test("passes a row holding a category of its side as Claude's suggestion (FR-093)", () => {
    const suggested = { type: "category", categoryId: "groceries", suggested: true };
    expect(checkInvariants(withRow({ assignment: suggested }))).toBeNull();
  });

  test("names the row whose suggestion is a protected category", () => {
    const suggested = { type: "category", categoryId: "expense-uncategorised", suggested: true };
    expect(checkInvariants(withRow({ assignment: suggested }))).toEqual({
      code: "pending-row-suggestion-invalid",
      details: { rowNumber: 2 },
    });
  });

  test("names the record that breaks a rule", () => {
    expect(checkInvariants(withTransaction(0, { accountId: "gone" }))).toEqual({
      code: "transaction-account-missing",
      details: { transactionId: "t1", accountId: "gone" },
    });
  });

  // One or more failing states for each invariant of data-model.md.
  test.each<[string, () => State, string]>([
    // 1. Unique ids and seq values.
    [
      "1: two accounts with one id",
      () => ({ ...validState(), accounts: [...validState().accounts, validState().accounts[0]!] }),
      "id-duplicate",
    ],
    [
      "1: two budgets for one category",
      () => ({ ...validState(), budgets: [...validState().budgets, ...validState().budgets] }),
      "id-duplicate",
    ],
    ["1: a repeated seq", () => withTransaction(1, { seq: 1 }), "transaction-seq-duplicate"],
    ["1: a seq of zero", () => withTransaction(0, { seq: 0 }), "transaction-seq-invalid"],
    // 2. Account names.
    [
      "2: an empty account name",
      () => ({
        ...validState(),
        accounts: [{ ...validState().accounts[0]!, name: "  " }, validState().accounts[1]!],
      }),
      "account-name-missing",
    ],
    [
      "2: account names equal by name key",
      () => ({
        ...validState(),
        accounts: [validState().accounts[0]!, { ...validState().accounts[1]!, name: " cash" }],
      }),
      "account-name-duplicate",
    ],
    // 3. Categories.
    [
      "3: a side without its unaccounted category",
      () => ({
        ...validState(),
        categories: validState().categories.filter((c) => c.id !== "income-unaccounted"),
      }),
      "category-role-count",
    ],
    [
      "3: a side with two uncategorised categories",
      () => renameCategory("groceries", "groceries", { role: "uncategorised" }),
      "category-role-count",
    ],
    ["3: an empty category name", () => renameCategory("groceries", ""), "category-name-missing"],
    [
      "3: two names on one side equal by name key",
      () => renameCategory("groceries", "EXPENSE-UNCATEGORISED"),
      "category-name-duplicate",
    ],
    [
      "3: a colour that is not #rrggbb",
      () => renameCategory("groceries", "groceries", { color: "green" }),
      "category-color-invalid",
    ],
    // 4. Transactions.
    [
      "4: a date that does not exist",
      () => withTransaction(0, { date: "2026-02-30" }),
      "transaction-date-invalid",
    ],
    [
      "4: a negative amount",
      () => withTransaction(0, { amountCents: -1 }),
      "transaction-amount-invalid",
    ],
    [
      "4: a fractional amount",
      () => withTransaction(0, { amountCents: 0.5 }),
      "transaction-amount-invalid",
    ],
    [
      "4: a missing account",
      () => withTransaction(0, { accountId: "gone" }),
      "transaction-account-missing",
    ],
    [
      "4: an expense in an income category",
      () => withTransaction(0, { categoryId: "salary" }),
      "transaction-category-invalid",
    ],
    [
      "4: a missing category",
      () => withTransaction(2, { categoryId: "gone" }),
      "transaction-category-invalid",
    ],
    [
      "4: an expense that also has a destination",
      () => withTransaction(0, { destinationAccountId: "checking" }),
      "transaction-fields-mixed",
    ],
    [
      "4: a transfer that also has a category",
      () => withTransaction(1, { categoryId: "groceries" }),
      "transaction-fields-mixed",
    ],
    [
      "4: a transfer to a missing account",
      () => withTransaction(1, { destinationAccountId: "gone" }),
      "transaction-destination-invalid",
    ],
    [
      "4: a transfer to its own account",
      () => withTransaction(1, { destinationAccountId: "checking" }),
      "transaction-destination-invalid",
    ],
    // 5. Budgets.
    [
      "5: a budget on a protected category",
      () => ({
        ...validState(),
        budgets: [{ categoryId: "expense-uncategorised", limitCents: 100 }],
      }),
      "budget-category-invalid",
    ],
    [
      "5: a budget on an income category",
      () => ({ ...validState(), budgets: [{ categoryId: "salary", limitCents: 100 }] }),
      "budget-category-invalid",
    ],
    [
      "5: a limit of zero",
      () => ({ ...validState(), budgets: [{ categoryId: "groceries", limitCents: 0 }] }),
      "budget-limit-out-of-range",
    ],
    // 6. Mapping profiles.
    ["6: an empty profile name", () => withProfile({ name: " " }), "profile-name-missing"],
    [
      "6: profile names equal by name key",
      () => ({
        ...validState(),
        profiles: [headerProfile, { ...positionProfile, name: "mybank" }],
      }),
      "profile-name-duplicate",
    ],
    [
      "6: a position in a profile with a header row",
      () => withProfile({ descriptionColumn: 2 }),
      "profile-column-mismatch",
    ],
    [
      "6: header text in a profile without a header row",
      () => ({
        ...validState(),
        profiles: [
          {
            ...positionProfile,
            amount: { mode: "debit-credit", debitColumn: "Debit", creditColumn: 3 },
          } as unknown as MappingProfile,
        ],
      }),
      "profile-column-mismatch",
    ],
    [
      "6: an unsupported date format",
      () => withProfile({ dateFormat: "YYYY/MM/DD" }),
      "profile-setting-unsupported",
    ],
    [
      "6: an unsupported encoding",
      () => withProfile({ encoding: "UTF-32" }),
      "profile-setting-unsupported",
    ],
    // 7. The pending batch.
    [
      "7: a batch on a missing account",
      () => ({ ...validState(), pendingBatch: { ...batch, accountId: "gone" } }),
      "pending-batch-account-missing",
    ],
    [
      "7: two rows with one row number",
      () => ({ ...validState(), pendingBatch: { ...batch, rows: [expenseRow, expenseRow] } }),
      "pending-row-number-duplicate",
    ],
    [
      "7: a row date that does not exist",
      () => withRow({ date: "2026-13-01" }),
      "pending-row-date-invalid",
    ],
    [
      "7: a fractional row amount",
      () => withRow({ amountCents: 1.5 }),
      "pending-row-amount-invalid",
    ],
    [
      "7: a money-out row in an income category",
      () => withRow({ assignment: { type: "category", categoryId: "salary" } }),
      "pending-row-category-invalid",
    ],
    [
      "7: a row in Unaccounted",
      () => withRow({ assignment: { type: "category", categoryId: "expense-unaccounted" } }),
      "pending-row-category-invalid",
    ],
    [
      "7: a row in Uncategorised marked as Claude's suggestion",
      () =>
        withRow({
          assignment: { type: "category", categoryId: "expense-uncategorised", suggested: true },
        }),
      "pending-row-suggestion-invalid",
    ],
    [
      "7: a row in Unaccounted marked as Claude's suggestion",
      () =>
        withRow({
          assignment: { type: "category", categoryId: "expense-unaccounted", suggested: true },
        }),
      "pending-row-category-invalid",
    ],
    [
      "7: a transfer to the batch account itself",
      () => withRow({ assignment: { type: "transfer", counterAccountId: "checking" } }),
      "pending-row-transfer-invalid",
    ],
    [
      "7: an unknown failure code",
      () => ({
        ...validState(),
        pendingBatch: {
          ...batch,
          rows: [
            { rowNumber: 2, status: "unparsable", cells: [], failure: { code: "nope" } } as never,
          ],
        },
      }),
      "pending-row-failure-unknown",
    ],
    // 8. Settings.
    [
      "8: a default account that does not exist",
      () => ({ ...validState(), settings: { manualEntryAccountId: "gone" } }),
      "settings-account-missing",
    ],
  ])("refuses %s", (_, makeState, code) => {
    expect(checkInvariants(makeState())?.code).toBe(code);
  });
});
