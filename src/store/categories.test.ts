import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { PendingBatch, Side, State, Transaction } from "@/domain/types";
import { loadState, openDatabase } from "@/persistence/db";
import { createCategory, deleteCategory, recolourCategory, renameCategory } from "./categories";
import { createStore } from "./store";

// FR-032 – FR-034, R-06: a deletion writes every store it touches in one storage transaction.

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function setUp() {
  const db = await openDatabase();
  return { db, store: createStore(db, await loadState(db)) };
}

async function reopened() {
  return loadState(await openDatabase());
}

const categoryId = (state: State, side: Side, name: string) =>
  state.categories.find((c) => c.side === side && c.name === name)!.id;

const uncategorisedId = (state: State) =>
  state.categories.find((c) => c.side === "expense" && c.role === "uncategorised")!.id;

/** Three expenses in "Eating out", its budget, and a pending row assigned to it. */
async function withEatingOut() {
  const { db, store } = await setUp();
  const state = store.getState();
  const cash = state.accounts[0]!.id;
  const eatingOut = categoryId(state, "expense", "Eating out");
  const transactions = [1, 2, 3].map((seq): Transaction => ({
    id: `t${seq}`,
    seq,
    date: "2026-09-03",
    amountCents: 1000 * seq,
    accountId: cash,
    description: "",
    kind: "expense",
    categoryId: eatingOut,
  }));
  const batch: PendingBatch = {
    id: "batch",
    accountId: cash,
    fileName: "mybank-2026-09.csv",
    createdAt: "2026-09-03T10:00:00.000Z",
    rows: [
      {
        rowNumber: 2,
        status: "parsed",
        date: "2026-09-02",
        amountCents: -1850,
        description: "Lunch",
        counterparty: "Bistro",
        duplicate: false,
        included: true,
        assignment: { type: "category", categoryId: eatingOut },
      },
    ],
  };
  await store.run(() => ({
    transactions: { put: transactions },
    budgets: { put: [{ categoryId: eatingOut, limitCents: 15000 }] },
    pendingBatch: { put: [batch] },
  }));
  return { db, store, eatingOut };
}

/** Makes every put into `storeName` fail as a full disk does, after the transaction's earlier requests. */
function failPutsInto(storeName: string) {
  const put = IDBObjectStore.prototype.put;
  vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function (
    this: IDBObjectStore,
    ...args: Parameters<IDBObjectStore["put"]>
  ) {
    if (this.name === storeName) throw new DOMException("The disk is full", "QuotaExceededError");
    return put.apply(this, args);
  });
}

describe("category actions", () => {
  test("a new category survives reopening the database", async () => {
    const { db, store } = await setUp();

    const result = await createCategory(store, {
      side: "income",
      name: "Refunds",
      color: "#82c91e",
    });

    expect(result).toBeNull();
    db.close();
    expect((await reopened()).categories).toContainEqual(
      expect.objectContaining({ side: "income", name: "Refunds", color: "#82c91e", role: null }),
    );
  });

  test("a rename and a new colour survive reopening the database", async () => {
    const { db, store } = await setUp();
    const eatingOut = categoryId(store.getState(), "expense", "Eating out");

    expect(await renameCategory(store, eatingOut, "Restaurants")).toBeNull();
    expect(await recolourCategory(store, eatingOut, "#e8590c")).toBeNull();

    db.close();
    expect((await reopened()).categories.find((c) => c.id === eatingOut)).toMatchObject({
      name: "Restaurants",
      color: "#e8590c",
    });
  });

  test("a refused name writes nothing", async () => {
    const { db, store } = await setUp();
    const before = await loadState(db);

    const result = await createCategory(store, {
      side: "expense",
      name: "groceries",
      color: "#82c91e",
    });

    expect(result).toEqual({ code: "category-name-taken", details: { side: "expense" } });
    db.close();
    expect(await reopened()).toEqual(before);
  });
});

describe("deleteCategory (FR-034, R-06)", () => {
  test("moves the transactions, removes the budget and reassigns the pending row, durably", async () => {
    const { db, store, eatingOut } = await withEatingOut();
    const uncategorised = uncategorisedId(store.getState());

    const result = await deleteCategory(store, eatingOut);

    expect(result).toBeNull();
    db.close();
    const state = await reopened();
    expect(state.categories.some((c) => c.id === eatingOut)).toBe(false);
    expect(state.transactions.map((t) => t.kind !== "transfer" && t.categoryId)).toEqual([
      uncategorised,
      uncategorised,
      uncategorised,
    ]);
    expect(state.budgets).toEqual([]);
    expect(state.pendingBatch?.rows).toEqual([
      expect.objectContaining({ assignment: { type: "category", categoryId: uncategorised } }),
    ]);
  });

  test("a deletion that fails part-way changes none of the stores", async () => {
    const { db, store, eatingOut } = await withEatingOut();
    const before = store.getState();
    const stored = await loadState(db);
    failPutsInto("pendingBatch");

    const result = await deleteCategory(store, eatingOut);

    expect(result).toEqual({ code: "save-failed", details: { reason: "QuotaExceededError" } });
    expect(store.getState()).toBe(before);
    vi.restoreAllMocks();
    db.close();
    expect(await reopened()).toEqual(stored);
  });

  test("a protected category is refused and nothing is written", async () => {
    const { db, store } = await withEatingOut();
    const before = await loadState(db);
    const uncategorised = uncategorisedId(store.getState());

    const result = await deleteCategory(store, uncategorised);

    expect(result).toEqual({ code: "category-protected", details: { role: "uncategorised" } });
    db.close();
    expect(await reopened()).toEqual(before);
  });
});
