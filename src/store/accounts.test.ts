import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, test } from "vitest";
import { accountBalance } from "@/domain/accounts";
import { loadState, openDatabase } from "@/persistence/db";
import { addAccount, editAccount, reconcile } from "./accounts";
import { todayLocal } from "./clock";
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

describe("reconcile (FR-005)", () => {
  test("the booked transaction survives reopening the database", async () => {
    const { db, store } = await setUp();
    const cash = store.getState().accounts[0]!;
    const settings = store.getState().settings;

    const result = await reconcile(store, cash.id, -1500);

    expect(result).toBeNull();
    db.close();
    const state = await reopened();
    const unaccounted = state.categories.find(
      (c) => c.side === "expense" && c.role === "unaccounted",
    )!;
    expect(state.transactions).toEqual([
      expect.objectContaining({
        kind: "expense",
        amountCents: 1500,
        accountId: cash.id,
        categoryId: unaccounted.id,
        date: todayLocal(),
      }),
    ]);
    expect(accountBalance(state, cash.id)).toBe(-1500);
    expect(state.settings).toEqual(settings);
  });

  test("a balance that already matches is refused and writes nothing", async () => {
    const { db, store } = await setUp();
    const before = await loadState(db);

    const result = await reconcile(store, store.getState().accounts[0]!.id, 0);

    expect(result).toEqual({ code: "reconcile-already-matches" });
    expect(store.getState().transactions).toEqual([]);
    db.close();
    expect(await reopened()).toEqual(before);
  });
});
