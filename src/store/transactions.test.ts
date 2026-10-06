import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, test } from "vitest";
import { newDraft, type Draft } from "@/domain/transactions";
import { loadState, openDatabase } from "@/persistence/db";
import { addAccount } from "./accounts";
import { createStore } from "./store";
import { removeTransaction, saveTransaction } from "./transactions";

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

async function setUp() {
  const db = await openDatabase();
  const store = createStore(db, await loadState(db));
  await addAccount(store, { name: "Checking", type: "checking", openingBalanceCents: 0 });
  const checking = store.getState().accounts.find((a) => a.name === "Checking")!;
  return { db, store, checking };
}

async function reopened() {
  return loadState(await openDatabase());
}

describe("transaction actions", () => {
  test("a saved transaction and the new default account survive reopening the database", async () => {
    const { db, store, checking } = await setUp();
    const draft: Draft = {
      ...newDraft(store.getState(), "2026-09-03"),
      accountId: checking.id,
      amountCents: 4000,
    };

    const result = await saveTransaction(store, draft);

    expect(result).toBeNull();
    db.close();
    const state = await reopened();
    expect(state.transactions).toEqual([expect.objectContaining({ amountCents: 4000, seq: 1 })]);
    expect(state.settings.manualEntryAccountId).toBe(checking.id);
  });

  test("a deleted transaction stays deleted after reopening the database", async () => {
    const { db, store } = await setUp();
    await saveTransaction(store, newDraft(store.getState(), "2026-09-03"));
    const id = store.getState().transactions[0]!.id;

    await removeTransaction(store, id);

    db.close();
    expect((await reopened()).transactions).toEqual([]);
  });

  test("a refusal writes nothing", async () => {
    const { db, store } = await setUp();
    const before = await loadState(db);
    const draft: Draft = { ...newDraft(store.getState(), "2026-09-03"), amountCents: null };

    const result = await saveTransaction(store, draft);

    expect(result).toMatchObject({ code: "draft-invalid", details: { amount: "amount-invalid" } });
    db.close();
    expect(await reopened()).toEqual(before);
  });
});
