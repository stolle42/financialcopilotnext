import { describe, expect, test } from "vitest";
import { checkInvariants } from "./invariants";
import { seedState } from "./seed";

function counter(): () => string {
  let next = 0;
  return () => `id-${++next}`;
}

// The seed table of data-model.md, row by row: [side, name, colour, role].
const seedCategories = [
  ["expense", "Groceries", "#40c057", null],
  ["expense", "Eating out", "#fd7e14", null],
  ["expense", "Housing", "#4c6ef5", null],
  ["expense", "Utilities", "#15aabf", null],
  ["expense", "Transport", "#228be6", null],
  ["expense", "Health", "#fa5252", null],
  ["expense", "Shopping", "#e64980", null],
  ["expense", "Leisure", "#be4bdb", null],
  ["expense", "Travel", "#12b886", null],
  ["expense", "Uncategorised", "#adb5bd", "uncategorised"],
  ["expense", "Unaccounted", "#495057", "unaccounted"],
  ["income", "Salary", "#37b24d", null],
  ["income", "Interest", "#fab005", null],
  ["income", "Gifts", "#7950f2", null],
  ["income", "Uncategorised", "#adb5bd", "uncategorised"],
  ["income", "Unaccounted", "#495057", "unaccounted"],
] as const;

describe("seedState", () => {
  test("creates the account Cash with an opening balance of 0 (FR-006)", () => {
    const state = seedState(counter());
    expect(state.accounts).toEqual([
      { id: expect.any(String), name: "Cash", type: "cash", openingBalanceCents: 0 },
    ]);
  });

  test("makes Cash the manual-entry default (FR-006)", () => {
    const state = seedState(counter());
    expect(state.settings).toEqual({ manualEntryAccountId: state.accounts[0]?.id });
  });

  test("creates the predefined categories of both sides (FR-031)", () => {
    const state = seedState(counter());
    expect(state.categories.map((c) => [c.side, c.name, c.color, c.role])).toEqual(seedCategories);
  });

  test("starts with no transactions, budgets, profiles or pending batch", () => {
    const state = seedState(counter());
    expect(state.transactions).toEqual([]);
    expect(state.budgets).toEqual([]);
    expect(state.profiles).toEqual([]);
    expect(state.pendingBatch).toBeNull();
  });

  test("gives every record its own new id and satisfies every invariant", () => {
    const state = seedState(counter());
    const ids = [...state.accounts, ...state.categories].map((r) => r.id);
    expect(new Set(ids).size).toBe(17);
    expect(checkInvariants(state)).toBeNull();
  });
});
