import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { loadState, openDatabase } from "@/persistence/db";
import { aiFeaturesOn, chooseModel, setAiFeatures } from "./settings";
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

/** A full disk on every put into the settings store. */
function failSettingsPuts() {
  const put = IDBObjectStore.prototype.put;
  vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function (
    this: IDBObjectStore,
    ...args: Parameters<IDBObjectStore["put"]>
  ) {
    if (this.name === "settings") throw new DOMException("The disk is full", "QuotaExceededError");
    return put.apply(this, args);
  });
}

describe("chooseModel (FR-129, FR-130)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("saves the choice at once, so it survives closing the app", async () => {
    const { db, store } = await setUp();

    expect(await chooseModel(store, "gpt-6.1-sol")).toBeNull();

    expect(store.getState().settings.model).toBe("gpt-6.1-sol");
    db.close();
    expect((await reopened()).settings.model).toBe("gpt-6.1-sol");
  });

  test("a failed write gives save-failed and keeps the choice as it was", async () => {
    const { db, store } = await setUp();
    await chooseModel(store, "gpt-5.6-luna");
    failSettingsPuts();

    const result = await chooseModel(store, "gpt-6.1-sol");

    expect(result).toEqual({ code: "save-failed", details: { reason: "QuotaExceededError" } });
    expect(store.getState().settings.model).toBe("gpt-5.6-luna");
    vi.restoreAllMocks();
    db.close();
    expect((await reopened()).settings.model).toBe("gpt-5.6-luna");
  });
});

describe("aiFeaturesOn (FR-095, FR-106)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("is true only with AI features on, in the app run on the user's own computer", async () => {
    const { store } = await setUp();
    vi.stubGlobal("location", { hostname: "localhost" });
    expect(aiFeaturesOn(store.getState())).toBe(false);

    await setAiFeatures(store, true);
    expect(aiFeaturesOn(store.getState())).toBe(true);

    vi.stubGlobal("location", { hostname: "financialcopilot-three.vercel.app" });
    expect(aiFeaturesOn(store.getState())).toBe(false);
  });
});
