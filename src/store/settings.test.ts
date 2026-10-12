import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, test } from "vitest";
import { loadState, openDatabase } from "@/persistence/db";
import { skipSharingWarning } from "./settings";
import { createStore } from "./store";

// FR-095: Don't warn me again saves at once.

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

describe("skipSharingWarning (FR-095)", () => {
  test("saves the choice, so it survives closing the app", async () => {
    const { db, store } = await setUp();

    expect(await skipSharingWarning(store)).toBeNull();

    expect(store.getState().settings.skipSharingWarning).toBe(true);
    db.close();
    expect((await reopened()).settings.skipSharingWarning).toBe(true);
  });
});
