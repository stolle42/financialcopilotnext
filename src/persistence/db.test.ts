import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, test } from "vitest";
import { applyChanges, type Changes } from "@/domain/changes";
import { checkInvariants } from "@/domain/invariants";
import type { Category, PendingBatch, State } from "@/domain/types";
import { loadState, openDatabase, writeChanges } from "./db";

beforeEach(() => {
  // A fresh, empty browser storage for every test.
  globalThis.indexedDB = new IDBFactory();
});

/** Storage returns records in key order, memory in creation order; compare without the order. */
function byKey(state: State): State {
  const sorted = <Item>(items: readonly Item[], key: (item: Item) => string) =>
    [...items].sort((a, b) => key(a).localeCompare(key(b)));
  return {
    ...state,
    accounts: sorted(state.accounts, (a) => a.id),
    categories: sorted(state.categories, (c) => c.id),
    transactions: sorted(state.transactions, (t) => t.id),
    budgets: sorted(state.budgets, (b) => b.categoryId),
    profiles: sorted(state.profiles, (p) => p.id),
  };
}

describe("openDatabase", () => {
  test("seeds the first-launch data on the first open", async () => {
    const db = await openDatabase();
    const state = await loadState(db);
    expect(state.accounts.map((a) => a.name)).toEqual(["Cash"]);
    expect(state.categories).toHaveLength(16);
    expect(state.settings.manualEntryAccountId).toBe(state.accounts[0]?.id);
    expect(checkInvariants(state)).toBeNull();
  });

  test("does not seed again on a later open", async () => {
    const first = await openDatabase();
    const seeded = await loadState(first);
    first.close();
    const second = await openDatabase();
    expect(await loadState(second)).toEqual(seeded);
  });
});

describe("writeChanges", () => {
  test("stores changes in every store, so loading returns them", async () => {
    const db = await openDatabase();
    const before = await loadState(db);
    const cashId = before.accounts[0]!.id;
    const groceries = before.categories.find((c) => c.name === "Groceries")!;
    const batch: PendingBatch = {
      id: "batch",
      accountId: cashId,
      fileName: "bank.csv",
      createdAt: "2026-09-03T10:00:00.000Z",
      rows: [],
    };
    const changes: Changes = {
      accounts: {
        put: [{ id: "checking", name: "Checking", type: "checking", openingBalanceCents: 125000 }],
      },
      categories: { put: [{ ...groceries, name: "Food" }] },
      transactions: {
        put: [
          {
            id: "t1",
            seq: 1,
            date: "2026-09-03",
            amountCents: 4000,
            accountId: "checking",
            description: "Weekly shop",
            kind: "expense",
            categoryId: groceries.id,
          },
        ],
      },
      budgets: { put: [{ categoryId: groceries.id, limitCents: 40000 }] },
      profiles: {
        put: [
          {
            id: "bank",
            name: "MyBank",
            hasHeaderRow: true,
            dateColumn: "Date",
            descriptionColumn: "Text",
            counterpartyColumn: null,
            amount: { mode: "signed", column: "Amount", invertSign: false },
            dateFormat: "DD.MM.YYYY",
            decimalSeparator: ",",
            encoding: "UTF-8",
          },
        ],
      },
      pendingBatch: { put: [batch] },
      settings: { put: { manualEntryAccountId: "checking" } },
    };

    await writeChanges(db, changes);

    expect(byKey(await loadState(db))).toEqual(byKey(applyChanges(before, changes)));
  });

  test("deletes records, including the pending batch", async () => {
    const db = await openDatabase();
    const before = await loadState(db);
    const batch: PendingBatch = {
      id: "batch",
      accountId: before.accounts[0]!.id,
      fileName: "bank.csv",
      createdAt: "2026-09-03T10:00:00.000Z",
      rows: [],
    };
    await writeChanges(db, { pendingBatch: { put: [batch] } });

    await writeChanges(db, { pendingBatch: { delete: ["batch"] } });

    expect((await loadState(db)).pendingBatch).toBeNull();
  });

  test("resolves to null once the changes are stored", async () => {
    const db = await openDatabase();
    expect(
      await writeChanges(db, { settings: { put: (await loadState(db)).settings } }),
    ).toBeNull();
  });

  test("changes no store when one record fails, and rejects with the original error", async () => {
    const db = await openDatabase();
    const before = await loadState(db);
    const withoutId = { side: "expense", name: "Broken", color: "#000000", role: null };

    const write = writeChanges(db, {
      accounts: {
        put: [{ id: "checking", name: "Checking", type: "checking", openingBalanceCents: 0 }],
      },
      categories: { put: [withoutId as unknown as Category] },
    });

    await expect(write).rejects.toMatchObject({ name: "DataError" });
    expect(await loadState(db)).toEqual(before);
  });
});

describe("writeChanges with requireNoPendingBatch (FR-022)", () => {
  function batchOn(state: State, id: string): PendingBatch {
    return {
      id,
      accountId: state.accounts[0]!.id,
      fileName: `${id}.csv`,
      createdAt: "2026-09-03T10:00:00.000Z",
      rows: [],
    };
  }

  test("stores a batch when none exists", async () => {
    const db = await openDatabase();
    const state = await loadState(db);

    const result = await writeChanges(
      db,
      { pendingBatch: { put: [batchOn(state, "first")] } },
      { requireNoPendingBatch: true },
    );

    expect(result).toBeNull();
    expect((await loadState(db)).pendingBatch?.id).toBe("first");
  });

  test("refuses with import-batch-pending, inside the same transaction, when storage holds a batch", async () => {
    const db = await openDatabase();
    const state = await loadState(db);
    await writeChanges(db, { pendingBatch: { put: [batchOn(state, "first")] } });
    const before = await loadState(db);

    // The in-memory state can be older than storage; the check reads storage itself.
    const result = await writeChanges(
      db,
      {
        accounts: {
          put: [{ id: "checking", name: "Checking", type: "checking", openingBalanceCents: 0 }],
        },
        pendingBatch: { put: [batchOn(state, "second")] },
      },
      { requireNoPendingBatch: true },
    );

    expect(result).toEqual({ code: "import-batch-pending" });
    expect(await loadState(db)).toEqual(before);
  });

  test("checks for a batch even when the changes put none", async () => {
    const db = await openDatabase();
    const state = await loadState(db);
    await writeChanges(db, { pendingBatch: { put: [batchOn(state, "first")] } });

    const result = await writeChanges(
      db,
      { settings: { put: state.settings } },
      { requireNoPendingBatch: true },
    );

    expect(result).toEqual({ code: "import-batch-pending" });
  });
});
