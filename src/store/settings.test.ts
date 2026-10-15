import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, test } from "vitest";
import { loadState, openDatabase } from "@/persistence/db";
import { setAiFeatures } from "./settings";
import { createStore } from "./store";

// FR-095: the AI features switch saves at once.

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

describe("setAiFeatures (FR-095)", () => {
  test("turning them on survives closing the app", async () => {
    const { db, store } = await setUp();

    expect(await setAiFeatures(store, true)).toBeNull();

    expect(store.getState().settings.aiFeatures).toBe(true);
    db.close();
    expect((await reopened()).settings.aiFeatures).toBe(true);
  });

  test("turning them off survives closing the app", async () => {
    const { db, store } = await setUp();
    await setAiFeatures(store, true);

    expect(await setAiFeatures(store, false)).toBeNull();

    expect(store.getState().settings).not.toHaveProperty("aiFeatures");
    db.close();
    expect((await reopened()).settings).not.toHaveProperty("aiFeatures");
  });
});
