import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { Changes } from "@/domain/changes";
import type { Account, Refusal, State } from "@/domain/types";
import { loadState, openDatabase } from "@/persistence/db";
import { todayLocal } from "./clock";
import { createStore, StoreContext, useStore, type Context } from "./store";

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

async function setUp() {
  const db = await openDatabase();
  const store = createStore(db, await loadState(db));
  const notified = vi.fn();
  store.subscribe(notified);
  return { db, store, notified };
}

function addAccount(name: string) {
  return (state: State, context: Context): Changes | Refusal<"account-name-taken"> => {
    if (state.accounts.some((a) => a.name === name)) return { code: "account-name-taken" };
    const account: Account = {
      id: context.newId(),
      name,
      type: "checking",
      openingBalanceCents: 0,
    };
    return { accounts: { put: [account] } };
  };
}

describe("run", () => {
  test("passes today's local date and new ids to the decision", async () => {
    const { store } = await setUp();
    const seen: Context[] = [];
    await store.run((_, context) => {
      seen.push(context);
      return {};
    });
    expect(seen[0]?.today).toBe(todayLocal());
    expect(seen[0]?.newId()).toMatch(/^[0-9a-f-]{36}$/);
  });

  test("returns a refusal unchanged and writes nothing", async () => {
    const { db, store, notified } = await setUp();
    const before = store.getState();

    const result = await store.run(addAccount("Cash"));

    expect(result).toEqual({ code: "account-name-taken" });
    expect(store.getState()).toBe(before);
    expect(await loadState(db)).toEqual(before);
    expect(notified).not.toHaveBeenCalled();
  });

  test("keeps a success in memory and in storage, and notifies subscribers", async () => {
    const { db, store, notified } = await setUp();

    const result = await store.run(addAccount("Checking"));

    expect(result).toBeNull();
    expect(store.getState().accounts.map((a) => a.name)).toContain("Checking");
    expect(notified).toHaveBeenCalledOnce();
    db.close();
    const reopened = await openDatabase();
    expect((await loadState(reopened)).accounts.map((a) => a.name)).toContain("Checking");
  });

  test("gives save-failed and leaves the state untouched when the write fails", async () => {
    const { db, store, notified } = await setUp();
    const before = store.getState();
    db.close();

    const result = await store.run(addAccount("Checking"));

    expect(result?.code).toBe("save-failed");
    expect(store.getState()).toBe(before);
    expect(notified).not.toHaveBeenCalled();
  });

  test("decides each action on the state the previous one left", async () => {
    const { store } = await setUp();

    const results = await Promise.all([
      store.run(addAccount("Checking")),
      store.run(addAccount("Checking")),
    ]);

    expect(results).toEqual([null, { code: "account-name-taken" }]);
  });
});

describe("useStore", () => {
  test("reads the selected value from the provided store", async () => {
    const { store } = await setUp();
    function FirstAccountName() {
      return useStore((state) => state.accounts[0]?.name);
    }

    const html = renderToString(
      createElement(StoreContext.Provider, { value: store }, createElement(FirstAccountName)),
    );

    expect(html).toBe("Cash");
  });
});
