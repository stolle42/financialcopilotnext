import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, test } from "vitest";
import type { ProfileDraft } from "@/domain/import/profiles";
import type { MappingProfile } from "@/domain/types";
import { loadState, openDatabase } from "@/persistence/db";
import {
  assignGroup,
  assignRow,
  confirmBatch,
  deleteProfile,
  discardBatch,
  importFile,
  includeDuplicate,
  saveProfile,
} from "./import";
import { createStore } from "./store";

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

const draft: ProfileDraft = {
  id: null,
  name: "MyBank",
  hasHeaderRow: true,
  dateColumn: "Date",
  descriptionColumn: "Purpose",
  counterpartyColumn: "Payee",
  amount: { mode: "signed", column: "Amount", invertSign: false },
  dateFormat: "DD.MM.YYYY",
  decimalSeparator: ",",
  encoding: "UTF-8",
};

const file = new TextEncoder().encode(
  [
    "Date;Payee;Purpose;Amount",
    "01.08.2026;Shop;Groceries;-45,20",
    "03.08.2026;Shop;Groceries;-12,99",
    "12.08.2026;Parking;Ticket;-2,00",
    "12.08.2026;Parking;Ticket;-2,00",
    "15.08.2026;Credit Card;Card statement;-250,00",
  ].join("\r\n"),
);

async function setUp() {
  const db = await openDatabase();
  const store = createStore(db, await loadState(db));
  await saveProfile(store, draft);
  await store.run((_, context) => ({
    accounts: {
      put: [
        { id: context.newId(), name: "Credit card", type: "credit-card", openingBalanceCents: 0 },
      ],
    },
  }));
  const state = store.getState();
  return {
    db,
    store,
    profile: state.profiles[0]!,
    cash: state.accounts.find((a) => a.name === "Cash")!.id,
    card: state.accounts.find((a) => a.name === "Credit card")!.id,
  };
}

function importInto(
  store: Parameters<typeof importFile>[0],
  accountId: string,
  profile: MappingProfile,
) {
  return importFile(store, { accountId, profile, fileName: "mybank-2026-08.csv", bytes: file });
}

async function reopened() {
  return loadState(await openDatabase());
}

describe("profile actions", () => {
  test("a saved profile survives reopening the database", async () => {
    const { db } = await setUp();
    db.close();
    expect((await reopened()).profiles).toEqual([expect.objectContaining({ name: "MyBank" })]);
  });

  test("editing or deleting the profile leaves the pending batch unchanged (FR-021)", async () => {
    const { db, store, profile, cash } = await setUp();
    await importInto(store, cash, profile);
    const batch = store.getState().pendingBatch;

    await saveProfile(store, { ...draft, id: profile.id, name: "Renamed", dateColumn: "Day" });
    await deleteProfile(store, profile.id);

    db.close();
    const state = await reopened();
    expect(state.profiles).toEqual([]);
    expect(state.pendingBatch).toEqual(batch);
  });
});

describe("importFile", () => {
  test("stores the file as a pending batch that changes no ledger record (scenario 1)", async () => {
    const { db, store, profile, cash } = await setUp();

    const result = await importInto(store, cash, profile);

    expect(result).toBeNull();
    db.close();
    const state = await reopened();
    expect(state.transactions).toEqual([]);
    expect(state.pendingBatch).toMatchObject({ accountId: cash, fileName: "mybank-2026-08.csv" });
    expect(state.pendingBatch?.rows).toHaveLength(5);
  });

  test("refuses a second import while a batch is pending, before reading the file (FR-022)", async () => {
    const { store, profile, cash } = await setUp();
    await importInto(store, cash, profile);
    const batch = store.getState().pendingBatch;

    const result = await importFile(store, {
      accountId: cash,
      profile,
      fileName: "unreadable.csv",
      bytes: new Uint8Array([0x80]),
    });

    expect(result).toEqual({ code: "import-batch-pending" });
    expect(store.getState().pendingBatch).toBe(batch);
  });

  test("refuses in storage too, when the in-memory state has not seen the batch (R-06)", async () => {
    const { db, store, profile, cash } = await setUp();
    const stale = createStore(db, store.getState());
    await importInto(store, cash, profile);

    const result = await importInto(stale, cash, profile);

    expect(result).toEqual({ code: "import-batch-pending" });
    expect(stale.getState().pendingBatch).toBeNull();
    expect((await loadState(db)).pendingBatch).toEqual(store.getState().pendingBatch);
  });

  test("refuses bytes that are invalid in the profile's encoding and stores nothing", async () => {
    const { db, store, profile, cash } = await setUp();

    const result = await importFile(store, {
      accountId: cash,
      profile,
      fileName: "windows.csv",
      bytes: new Uint8Array([0x44, 0x80]),
    });

    expect(result).toMatchObject({ code: "import-decoding-failed" });
    expect((await loadState(db)).pendingBatch).toBeNull();
  });

  test("refuses a file whose layout does not fit the profile", async () => {
    const { store, profile, cash } = await setUp();
    const result = await importFile(store, {
      accountId: cash,
      profile,
      fileName: "header-only.csv",
      bytes: new TextEncoder().encode("Date;Payee;Purpose;Amount\r\n"),
    });
    expect(result).toEqual({ code: "import-no-transactions" });
  });
});

describe("review actions", () => {
  test("every review choice is written at once and survives reopening the database (FR-022)", async () => {
    const { db, store, profile, cash, card } = await setUp();
    await importInto(store, cash, profile);
    const groceries = store.getState().categories.find((c) => c.name === "Groceries")!.id;

    expect(
      await assignGroup(
        store,
        { key: "shop", side: "expense" },
        { type: "category", categoryId: groceries },
      ),
    ).toBeNull();
    expect(await assignRow(store, 6, { type: "transfer", counterAccountId: card })).toBeNull();
    expect(await includeDuplicate(store, 5, true)).toBeNull();
    const batch = store.getState().pendingBatch;

    db.close();
    const state = await reopened();
    expect(state.pendingBatch).toEqual(batch);
    expect(
      state.pendingBatch?.rows.map((row) => row.status === "parsed" && row.assignment),
    ).toEqual([
      { type: "category", categoryId: groceries },
      { type: "category", categoryId: groceries },
      expect.objectContaining({ type: "category" }),
      expect.objectContaining({ type: "category" }),
      { type: "transfer", counterAccountId: card },
    ]);
  });

  test("confirming books the rows under review and removes the batch, durably", async () => {
    const { db, store, profile, cash } = await setUp();
    await importInto(store, cash, profile);

    expect(await confirmBatch(store)).toBeNull();

    db.close();
    const state = await reopened();
    expect(state.pendingBatch).toBeNull();
    // Five rows, of which the second Parking ticket is a duplicate left out.
    expect(state.transactions).toHaveLength(4);
  });

  test("a failing confirmation leaves both the ledger and the batch unchanged (FR-027)", async () => {
    const { db, store, profile, cash } = await setUp();
    await importInto(store, cash, profile);
    const before = store.getState();
    db.close();

    const result = await confirmBatch(store);

    expect(result?.code).toBe("save-failed");
    expect(store.getState()).toBe(before);
    const state = await reopened();
    expect(state.transactions).toEqual([]);
    expect(state.pendingBatch).toEqual(before.pendingBatch);
  });

  test("discarding removes the batch and books nothing (scenario 10)", async () => {
    const { db, store, profile, cash } = await setUp();
    await importInto(store, cash, profile);

    expect(await discardBatch(store)).toBeNull();

    db.close();
    const state = await reopened();
    expect(state.pendingBatch).toBeNull();
    expect(state.transactions).toEqual([]);
  });
});
