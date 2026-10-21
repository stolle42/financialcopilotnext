import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { loadState, openDatabase } from "@/persistence/db";
import { aiFeaturesOn, chooseModel, removeKey, setAiFeatures, turnOnWithKey } from "./settings";
import { createStore } from "./store";

// FR-095, FR-126: the AI features switch and the key save at once.

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

const key = "sk-proj-abcdefa1b2";

describe("aiFeaturesOn (FR-095, FR-106, FR-126)", () => {
  test("is true only with the switch on and a key stored, wherever the app is served", async () => {
    const { store } = await setUp();
    expect(aiFeaturesOn(store.getState())).toBe(false);

    await turnOnWithKey(store, key);
    expect(aiFeaturesOn(store.getState())).toBe(true);

    await setAiFeatures(store, false);
    expect(aiFeaturesOn(store.getState())).toBe(false);
  });

  test("reads as off with the switch on but no key, as a v1.5 database leaves it", async () => {
    const { store } = await setUp();

    await setAiFeatures(store, true);

    expect(store.getState().settings.aiFeatures).toBe(true);
    expect(store.getState().apiKey).toBeNull();
    expect(aiFeaturesOn(store.getState())).toBe(false);
  });
});

describe("turnOnWithKey and removeKey (FR-126)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("turnOnWithKey stores the trimmed key and the switch together, surviving closing the app", async () => {
    const { db, store } = await setUp();

    expect(
      await turnOnWithKey(
        store,
        ` ${key}
`,
      ),
    ).toBeNull();

    expect(store.getState().apiKey).toBe(key);
    expect(store.getState().settings.aiFeatures).toBe(true);
    db.close();
    const loaded = await reopened();
    expect(loaded.apiKey).toBe(key);
    expect(loaded.settings.aiFeatures).toBe(true);
  });

  test("a failed write stores neither the key nor the switch", async () => {
    const { db, store } = await setUp();
    failSettingsPuts();

    expect(await turnOnWithKey(store, key)).toEqual({
      code: "save-failed",
      details: { reason: "QuotaExceededError" },
    });

    expect(store.getState().apiKey).toBeNull();
    expect(store.getState().settings).not.toHaveProperty("aiFeatures");
    vi.restoreAllMocks();
    db.close();
    const loaded = await reopened();
    expect(loaded.apiKey).toBeNull();
    expect(loaded.settings).not.toHaveProperty("aiFeatures");
  });

  test("removeKey deletes the key and turns AI features off, surviving closing the app", async () => {
    const { db, store } = await setUp();
    await turnOnWithKey(store, key);

    expect(await removeKey(store)).toBeNull();

    expect(store.getState().apiKey).toBeNull();
    expect(store.getState().settings).not.toHaveProperty("aiFeatures");
    db.close();
    const loaded = await reopened();
    expect(loaded.apiKey).toBeNull();
    expect(loaded.settings).not.toHaveProperty("aiFeatures");
  });

  test("turning AI features off keeps the key stored", async () => {
    const { db, store } = await setUp();
    await turnOnWithKey(store, key);

    await setAiFeatures(store, false);

    expect(store.getState().apiKey).toBe(key);
    db.close();
    expect((await reopened()).apiKey).toBe(key);
  });
});
