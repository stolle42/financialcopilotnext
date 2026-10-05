import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, test } from "vitest";
import { loadState, openDatabase } from "@/persistence/db";
import type { State } from "@/domain/types";
import { removeLimit, setLimit } from "./budgets";
import { createStore } from "./store";

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

async function setUp() {
  const db = await openDatabase();
  return { db, store: createStore(db, await loadState(db)) };
}

async function reopened() {
  return loadState(await openDatabase());
}

const categoryId = (state: State, name: string) =>
  state.categories.find((c) => c.side === "expense" && c.name === name)!.id;

describe("budget actions", () => {
  test("a limit survives reopening the database", async () => {
    const { db, store } = await setUp();
    const groceries = categoryId(store.getState(), "Groceries");

    const result = await setLimit(store, groceries, 40000);

    expect(result).toBeNull();
    expect(store.getState().budgets).toEqual([{ categoryId: groceries, limitCents: 40000 }]);
    db.close();
    expect((await reopened()).budgets).toEqual([{ categoryId: groceries, limitCents: 40000 }]);
  });

  test("a changed limit survives reopening the database", async () => {
    const { db, store } = await setUp();
    const groceries = categoryId(store.getState(), "Groceries");
    await setLimit(store, groceries, 40000);

    await setLimit(store, groceries, 45000);

    db.close();
    expect((await reopened()).budgets).toEqual([{ categoryId: groceries, limitCents: 45000 }]);
  });

  test("a removed limit stays removed after reopening the database", async () => {
    const { db, store } = await setUp();
    const groceries = categoryId(store.getState(), "Groceries");
    const transport = categoryId(store.getState(), "Transport");
    await setLimit(store, groceries, 40000);
    await setLimit(store, transport, 8000);

    const result = await removeLimit(store, groceries);

    expect(result).toBeNull();
    expect(store.getState().budgets).toEqual([{ categoryId: transport, limitCents: 8000 }]);
    db.close();
    expect((await reopened()).budgets).toEqual([{ categoryId: transport, limitCents: 8000 }]);
  });

  test("a refused limit writes nothing", async () => {
    const { db, store } = await setUp();
    const before = await loadState(db);

    const result = await setLimit(store, categoryId(store.getState(), "Groceries"), 0);

    expect(result).toEqual({ code: "budget-limit-invalid" });
    expect(store.getState().budgets).toEqual([]);
    db.close();
    expect(await reopened()).toEqual(before);
  });
});
