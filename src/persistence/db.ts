import { openDB, type DBSchema, type IDBPDatabase, type StoreNames } from "idb";
import type { Changes } from "@/domain/changes";
import { seedState } from "@/domain/seed";
import type {
  Account,
  Budget,
  Category,
  MappingProfile,
  PendingBatch,
  Refusal,
  Settings,
  State,
  Transaction,
} from "@/domain/types";

// One IndexedDB database holding the seven stores of data-model.md, storage layout (R-06).

const DATABASE_NAME = "financial-copilot";
const SETTINGS_KEY = "settings";

interface Schema extends DBSchema {
  accounts: { key: string; value: Account };
  categories: { key: string; value: Category };
  transactions: { key: string; value: Transaction };
  budgets: { key: string; value: Budget };
  profiles: { key: string; value: MappingProfile };
  pendingBatch: { key: string; value: PendingBatch };
  settings: { key: typeof SETTINGS_KEY; value: Settings };
}

export type Database = IDBPDatabase<Schema>;

type RecordStore = Exclude<StoreNames<Schema>, "settings">;

const recordStores: Record<RecordStore, string> = {
  accounts: "id",
  categories: "id",
  transactions: "id",
  budgets: "categoryId",
  profiles: "id",
  pendingBatch: "id",
};

/**
 * Opens the database, creating it on first launch. The seed is written in the same transaction
 * that creates the stores, so a first start either completes or leaves nothing behind.
 */
export function openDatabase(): Promise<Database> {
  return openDB<Schema>(DATABASE_NAME, 1, {
    upgrade(db, _oldVersion, _newVersion, transaction) {
      for (const [name, keyPath] of Object.entries(recordStores) as [RecordStore, string][]) {
        db.createObjectStore(name, { keyPath });
      }
      db.createObjectStore("settings");

      const seed = seedState(() => crypto.randomUUID());
      for (const account of seed.accounts) void transaction.objectStore("accounts").put(account);
      for (const category of seed.categories) {
        void transaction.objectStore("categories").put(category);
      }
      void transaction.objectStore("settings").put(seed.settings, SETTINGS_KEY);
    },
  });
}

/** Reads every store into one state, in one read transaction. */
export async function loadState(db: Database): Promise<State> {
  const storeNames = [...(Object.keys(recordStores) as RecordStore[]), "settings" as const];
  const transaction = db.transaction(storeNames, "readonly");
  const [accounts, categories, transactions, budgets, profiles, batches, settings] =
    await Promise.all([
      transaction.objectStore("accounts").getAll(),
      transaction.objectStore("categories").getAll(),
      transaction.objectStore("transactions").getAll(),
      transaction.objectStore("budgets").getAll(),
      transaction.objectStore("profiles").getAll(),
      transaction.objectStore("pendingBatch").getAll(),
      transaction.objectStore("settings").get(SETTINGS_KEY),
      transaction.done,
    ]);
  if (!settings) throw new Error("The settings record is missing from storage");
  return {
    accounts,
    categories,
    transactions,
    budgets,
    profiles,
    pendingBatch: batches[0] ?? null,
    settings,
  };
}

/** The refusal a write itself can give, when its option asks for a check inside the transaction. */
export type WriteRefusalCode = "import-batch-pending";

export interface WriteOptions {
  /**
   * Refuse when storage already holds a pending batch, checked inside the write's own
   * transaction, so no other write can slip in between (FR-022, R-06).
   */
  requireNoPendingBatch?: boolean;
}

/**
 * Writes `changes` in one read-write transaction over every store they touch. Resolves to `null`
 * only once the transaction has completed, or to the refusal of `options` with nothing written.
 * On any failure no store changes and the original error, with its `name`, is rethrown (R-06,
 * R-15).
 */
export async function writeChanges(
  db: Database,
  changes: Changes,
  options: WriteOptions = {},
): Promise<Refusal<WriteRefusalCode> | null> {
  const stores = (Object.keys(changes) as (keyof Changes)[]).filter((name) => changes[name]);
  if (options.requireNoPendingBatch && !stores.includes("pendingBatch"))
    stores.push("pendingBatch");
  if (stores.length === 0) return null;

  const transaction = db.transaction(stores, "readwrite");
  if (options.requireNoPendingBatch) {
    if ((await transaction.objectStore("pendingBatch").count()) > 0) {
      transaction.abort();
      await transaction.done.catch(() => undefined);
      return { code: "import-batch-pending" };
    }
  }

  const requests: Promise<unknown>[] = [];
  try {
    for (const name of Object.keys(recordStores) as RecordStore[]) {
      const storeChanges = changes[name];
      if (!storeChanges) continue;
      const store = transaction.objectStore(name);
      for (const key of storeChanges.delete ?? []) requests.push(store.delete(key));
      for (const record of storeChanges.put ?? []) requests.push(store.put(record as never));
    }
    if (changes.settings) {
      requests.push(transaction.objectStore("settings").put(changes.settings.put, SETTINGS_KEY));
    }
  } catch (error) {
    // A request that throws at once, such as a record without its key, would otherwise let the
    // requests before it commit.
    transaction.abort();
    await Promise.allSettled([...requests, transaction.done]);
    throw error;
  }
  await Promise.all([...requests, transaction.done]);
  return null;
}

/**
 * Clears every store and writes every record of `state`, in one transaction (backup-file.md,
 * loading step 4). Resolves once the transaction has completed. On any failure no store changes
 * and the original error, with its `name`, is rethrown (FR-072, R-15).
 */
export async function replaceAll(db: Database, state: State): Promise<void> {
  const storeNames = [...(Object.keys(recordStores) as RecordStore[]), "settings" as const];
  const transaction = db.transaction(storeNames, "readwrite");
  const requests: Promise<unknown>[] = [];
  try {
    for (const name of storeNames) requests.push(transaction.objectStore(name).clear());
    const records: Record<RecordStore, readonly unknown[]> = {
      accounts: state.accounts,
      categories: state.categories,
      transactions: state.transactions,
      budgets: state.budgets,
      profiles: state.profiles,
      pendingBatch: state.pendingBatch ? [state.pendingBatch] : [],
    };
    for (const name of Object.keys(records) as RecordStore[]) {
      const store = transaction.objectStore(name);
      for (const record of records[name]) requests.push(store.put(record as never));
    }
    requests.push(transaction.objectStore("settings").put(state.settings, SETTINGS_KEY));
  } catch (error) {
    // A request that throws at once would otherwise let the requests before it commit.
    transaction.abort();
    await Promise.allSettled([...requests, transaction.done]);
    throw error;
  }
  await Promise.all([...requests, transaction.done]);
}
