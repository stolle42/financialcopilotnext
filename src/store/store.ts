import { createContext, useContext, useSyncExternalStore } from "react";
import { applyChanges, isRefusal, type Changes } from "@/domain/changes";
import type { Refusal, State } from "@/domain/types";
import { writeChanges, type Database } from "@/persistence/db";
import { todayLocal } from "./clock";

/** The refusal the store itself can return. */
export type StoreRefusalCode = "save-failed";

/** The values a domain decision needs from outside, injected so the domain stays pure (R-05). */
export interface Context {
  today: string;
  newId: () => string;
}

export type Decide<Code extends string> = (
  state: State,
  context: Context,
) => Changes | Refusal<Code>;

export interface Store {
  getState(): State;
  subscribe(listener: () => void): () => void;
  /** Decides, writes, then applies; resolves to the refusal, or `null` once the change is saved. */
  run<Code extends string>(decide: Decide<Code>): Promise<Refusal<Code | StoreRefusalCode> | null>;
}

/** The whole state in memory, written to storage before it changes on screen (R-05, R-15). */
export function createStore(db: Database, initialState: State): Store {
  let state = initialState;
  const listeners = new Set<() => void>();
  // Actions run one at a time, so each decides on the state the previous one left.
  let queue: Promise<unknown> = Promise.resolve();

  async function decideWriteApply<Code extends string>(
    decide: Decide<Code>,
  ): Promise<Refusal<Code | StoreRefusalCode> | null> {
    const decision = decide(state, { today: todayLocal(), newId: () => crypto.randomUUID() });
    if (isRefusal(decision)) return decision;
    try {
      await writeChanges(db, decision);
    } catch (error) {
      const reason = error instanceof Error ? error.name : "unknown";
      return { code: "save-failed", details: { reason } };
    }
    state = applyChanges(state, decision);
    listeners.forEach((listener) => listener());
    return null;
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    run(decide) {
      const result = queue.then(() => decideWriteApply(decide));
      queue = result.catch(() => undefined);
      return result;
    },
  };
}

export const StoreContext = createContext<Store | null>(null);

/**
 * A value selected from the state, kept up to date. The selector must return stored values or
 * primitives, not new objects, or React would see a change on every read.
 */
export function useStore<Selected>(selector: (state: State) => Selected): Selected {
  const store = useContext(StoreContext);
  if (!store) throw new Error("useStore is used outside StoreContext");
  const select = () => selector(store.getState());
  return useSyncExternalStore(store.subscribe, select, select);
}
