import { createContext, useContext, useSyncExternalStore } from "react";
import { applyChanges, isRefusal, type Changes, type Context } from "@/domain/changes";
import type { Refusal, State } from "@/domain/types";
import {
  loadState,
  replaceAll,
  writeChanges,
  type Database,
  type WriteOptions,
  type WriteRefusalCode,
} from "@/persistence/db";
import { todayLocal } from "./clock";

/** The refusal the store itself can return. */
export type StoreRefusalCode = "save-failed";

export type { Context };

export type Decide<Refused extends Refusal> = (state: State, context: Context) => Changes | Refused;

export interface Store {
  getState(): State;
  subscribe(listener: () => void): () => void;
  /** Decides, writes, then applies; resolves to the refusal, or `null` once the change is saved. */
  run<Refused extends Refusal>(
    decide: Decide<Refused>,
  ): Promise<Refused | Refusal<StoreRefusalCode> | null>;
  /** The same, with a check inside the write's own transaction that can refuse too (R-06). */
  run<Refused extends Refusal>(
    decide: Decide<Refused>,
    options: WriteOptions,
  ): Promise<Refused | Refusal<StoreRefusalCode | WriteRefusalCode> | null>;
  /**
   * Writes `next` over every record in one storage transaction, then reloads memory from storage
   * (FR-071). Resolves to `null` once done, or to `save-failed` with nothing changed (FR-072).
   */
  replaceAll(next: State): Promise<Refusal<StoreRefusalCode> | null>;
}

/** The whole state in memory, written to storage before it changes on screen (R-05, R-15). */
export function createStore(db: Database, initialState: State): Store {
  let state = initialState;
  const listeners = new Set<() => void>();
  // Actions run one at a time, so each decides on the state the previous one left.
  let queue: Promise<unknown> = Promise.resolve();

  async function decideWriteApply(
    decide: Decide<Refusal>,
    options?: WriteOptions,
  ): Promise<Refusal | null> {
    const decision = decide(state, { today: todayLocal(), newId: () => crypto.randomUUID() });
    if (isRefusal(decision)) return decision;
    try {
      const refused = await writeChanges(db, decision, options);
      if (refused) return refused;
    } catch (error) {
      const reason = error instanceof Error ? error.name : "unknown";
      return { code: "save-failed", details: { reason } };
    }
    state = applyChanges(state, decision);
    listeners.forEach((listener) => listener());
    return null;
  }

  async function replaceEverything(next: State): Promise<Refusal<StoreRefusalCode> | null> {
    let reloaded: State;
    try {
      await replaceAll(db, next);
      reloaded = await loadState(db);
    } catch (error) {
      const reason = error instanceof Error ? error.name : "unknown";
      return { code: "save-failed", details: { reason } };
    }
    state = reloaded;
    listeners.forEach((listener) => listener());
    return null;
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    // One implementation serves both signatures; each refusal it returns is one they declare.
    run: ((decide: Decide<Refusal>, options?: WriteOptions) => {
      const result = queue.then(() => decideWriteApply(decide, options));
      queue = result.catch(() => undefined);
      return result;
    }) as Store["run"],
    replaceAll(next) {
      const result = queue.then(() => replaceEverything(next));
      queue = result.catch(() => undefined);
      return result;
    },
  };
}

export const StoreContext = createContext<Store | null>(null);

/** The store itself, for screens that run actions. */
export function useStoreApi(): Store {
  const store = useContext(StoreContext);
  if (!store) throw new Error("The store is used outside StoreContext");
  return store;
}

/**
 * A value selected from the state, kept up to date. The selector must return stored values or
 * primitives, not new objects, or React would see a change on every read.
 */
export function useStore<Selected>(selector: (state: State) => Selected): Selected {
  const store = useStoreApi();
  const select = () => selector(store.getState());
  return useSyncExternalStore(store.subscribe, select, select);
}
