import { removeLimit as removeLimitDecision, setLimit as setLimitDecision } from "@/domain/budgets";
import type { Store } from "./store";

/** Sets or changes a category's monthly limit, written at once; `null` is a limit the user left unreadable. */
export function setLimit(store: Store, categoryId: string, limitCents: number | null) {
  return store.run((state) => setLimitDecision(state, categoryId, limitCents));
}

export function removeLimit(store: Store, categoryId: string) {
  return store.run((state) => removeLimitDecision(state, categoryId));
}
