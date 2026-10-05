import { removeLimit as removeLimitDecision, setLimit as setLimitDecision } from "@/domain/budgets";
import type { Store } from "./store";

/** Sets or changes a category's monthly limit at once; `null` is text that was no amount. */
export function setLimit(store: Store, categoryId: string, limitCents: number | null) {
  return store.run((state) => setLimitDecision(state, categoryId, limitCents));
}

export function removeLimit(store: Store, categoryId: string) {
  // Removing never refuses, so only the store's own save-failed can come back.
  return store.run<never>((state) => removeLimitDecision(state, categoryId));
}
