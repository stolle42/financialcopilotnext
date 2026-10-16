import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { everyEntityState } from "@/domain/testing";
import type { State } from "@/domain/types";
import { backupFileName, serializeBackup } from "@/files/backup";
import { loadState, openDatabase } from "@/persistence/db";
import { createBackup, prepareRestore, restore } from "./backup";
import { todayLocal } from "./clock";
import { createStore } from "./store";

// FR-070 – FR-072, SC-014; contracts/backup-file.md, saving and loading.

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function setUp(state?: State) {
  const db = await openDatabase();
  const store = createStore(db, state ?? (await loadState(db)));
  const notified = vi.fn();
  store.subscribe(notified);
  return { db, store, notified };
}

async function reopened() {
  return loadState(await openDatabase());
}

const dataOf = (text: string) => (JSON.parse(text) as { data: unknown }).data;

/** The fixture's backup file, as another machine would have saved it. */
const fixtureFile = () => serializeBackup(everyEntityState(), "2026-09-03T10:15:00.000Z");

/** The state `prepareRestore` accepted, or a failure naming its refusal. */
function accepted(text: string): State {
  const prepared = prepareRestore(text);
  if ("code" in prepared) throw new Error(`Refused: ${JSON.stringify(prepared)}`);
  return prepared;
}

describe("createBackup (FR-070)", () => {
  test("gives the file named after today, holding the whole state", async () => {
    const { store } = await setUp(everyEntityState());

    const backup = createBackup(store);

    expect(backup.fileName).toBe(backupFileName(todayLocal()));
    const json = JSON.parse(backup.text) as {
      app: unknown;
      formatVersion: unknown;
      exportedAt: string;
    };
    expect(json).toMatchObject({ app: "financial-copilot", formatVersion: 1 });
    expect(Number.isNaN(Date.parse(json.exportedAt))).toBe(false);
    expect(dataOf(backup.text)).toEqual(dataOf(fixtureFile()));
  });

  test("writes nothing and changes nothing in the app (scenario 1)", async () => {
    const { db, store, notified } = await setUp();
    const before = store.getState();
    const stored = await loadState(db);

    createBackup(store);

    expect(store.getState()).toBe(before);
    expect(notified).not.toHaveBeenCalled();
    expect(await loadState(db)).toEqual(stored);
  });
});

describe("prepareRestore (loading steps 1–4)", () => {
  test("accepts a valid backup and gives its state, without writing", async () => {
    const { db } = await setUp();
    const stored = await loadState(db);

    const prepared = accepted(fixtureFile());

    expect(dataOf(serializeBackup(prepared, "x"))).toEqual(dataOf(fixtureFile()));
    expect(await loadState(db)).toEqual(stored);
  });

  test("passes on the refusals of the file's shape", () => {
    expect(prepareRestore("not a backup")).toEqual({ code: "backup-not-a-backup" });
    const newer = JSON.stringify({ ...JSON.parse(fixtureFile()), formatVersion: 2 });
    expect(prepareRestore(newer)).toEqual({ code: "backup-newer-version" });
  });

  test("refuses data that breaks an invariant as damaged, naming the rule (step 4)", () => {
    const json = JSON.parse(fixtureFile()) as { data: { transactions: { accountId: string }[] } };
    json.data.transactions[0]!.accountId = "not-in-the-backup";

    expect(prepareRestore(JSON.stringify(json))).toMatchObject({
      code: "backup-damaged",
      details: { rule: "transaction-account-missing" },
    });
  });

  test("refuses a conversation that breaks invariant 9 as damaged, naming the rule and the turn (step 4)", () => {
    const json = JSON.parse(fixtureFile()) as { data: { conversation: { answer: string }[] } };
    json.data.conversation[0]!.answer = "";

    expect(prepareRestore(JSON.stringify(json))).toEqual({
      code: "backup-damaged",
      details: { rule: "conversation-turn-invalid", turn: 1 },
    });
  });
});

describe("restore (FR-071, FR-072)", () => {
  test("replaces all data in storage and in memory, and tells the screens", async () => {
    const { db, store, notified } = await setUp();
    const prepared = accepted(fixtureFile());

    const result = await restore(store, prepared);

    expect(result).toBeNull();
    expect(notified).toHaveBeenCalled();
    expect(dataOf(createBackup(store).text)).toEqual(dataOf(fixtureFile()));
    db.close();
    expect(dataOf(serializeBackup(await reopened(), "x"))).toEqual(dataOf(fixtureFile()));
  });

  test("an invalid file is refused before anything changes (scenario 3)", async () => {
    const { db, store, notified } = await setUp();
    const before = store.getState();
    const stored = await loadState(db);

    const prepared = prepareRestore('{"app": "financial-copilot", "formatVersion": 1}');

    expect(prepared).toMatchObject({ code: "backup-damaged" });
    expect(store.getState()).toBe(before);
    expect(notified).not.toHaveBeenCalled();
    expect(await loadState(db)).toEqual(stored);
  });

  test("a restore that fails part-way changes nothing and gives save-failed", async () => {
    const { db, store, notified } = await setUp();
    const before = store.getState();
    const stored = await loadState(db);
    const prepared = accepted(fixtureFile());
    for (const method of ["put", "add"] as const) {
      const write = IDBObjectStore.prototype[method];
      vi.spyOn(IDBObjectStore.prototype, method).mockImplementation(function (
        this: IDBObjectStore,
        ...args: Parameters<IDBObjectStore["put"]>
      ) {
        if (this.name === "transactions") {
          throw new DOMException("The disk is full", "QuotaExceededError");
        }
        return write.apply(this, args);
      });
    }

    const result = await restore(store, prepared);

    expect(result).toEqual({ code: "save-failed", details: { reason: "QuotaExceededError" } });
    expect(store.getState()).toBe(before);
    expect(notified).not.toHaveBeenCalled();
    vi.restoreAllMocks();
    expect(await loadState(db)).toEqual(stored);
  });

  test("a restore into a fresh install, saved again, gives the same data (SC-014)", async () => {
    const original = await setUp(everyEntityState());
    const saved = createBackup(original.store);
    original.db.close();

    globalThis.indexedDB = new IDBFactory();
    const fresh = await setUp();
    expect(await restore(fresh.store, accepted(saved.text))).toBeNull();

    expect(dataOf(createBackup(fresh.store).text)).toEqual(dataOf(saved.text));
  });
});
