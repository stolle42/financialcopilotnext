import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, test } from "vitest";
import { loadState, openDatabase } from "@/persistence/db";
import { addAccount, editAccount } from "./accounts";
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

describe("account actions", () => {
  test("a new account survives reopening the database", async () => {
    const { db, store } = await setUp();

    const result = await addAccount(store, {
      name: "Checking",
      type: "checking",
      openingBalanceCents: 125000,
    });

    expect(result).toBeNull();
    db.close();
    expect((await reopened()).accounts).toContainEqual(
      expect.objectContaining({ name: "Checking", openingBalanceCents: 125000 }),
    );
  });

  test("an edited opening balance survives reopening the database", async () => {
    const { db, store } = await setUp();
    const cash = store.getState().accounts[0]!;

    await editAccount(store, cash.id, { ...cash, openingBalanceCents: 5000 });

    db.close();
    expect((await reopened()).accounts[0]).toMatchObject({ openingBalanceCents: 5000 });
  });

  test("a refusal writes nothing", async () => {
    const { db, store } = await setUp();
    const before = await loadState(db);

    const result = await addAccount(store, { name: "cash", type: "cash", openingBalanceCents: 0 });

    expect(result).toEqual({ code: "account-name-taken" });
    db.close();
    expect(await reopened()).toEqual(before);
  });
});
