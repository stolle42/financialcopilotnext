import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, test } from "vitest";
import { loadState, openDatabase } from "@/persistence/db";
import { setDataSharing } from "./settings";
import { createStore } from "./store";

// FR-095: the data-sharing switch saves at once.

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

describe("setDataSharing (FR-095)", () => {
  test("saves data sharing on, so it survives closing the app", async () => {
    const { db, store } = await setUp();

    expect(await setDataSharing(store, true)).toBeNull();

    expect(store.getState().settings.dataSharing).toBe(true);
    db.close();
    expect((await reopened()).settings.dataSharing).toBe(true);
  });

  test("saves data sharing off by removing the setting", async () => {
    const { db, store } = await setUp();
    await setDataSharing(store, true);

    expect(await setDataSharing(store, false)).toBeNull();

    expect(store.getState().settings).not.toHaveProperty("dataSharing");
    db.close();
    expect(Object.keys((await reopened()).settings)).not.toContain("dataSharing");
  });
});
