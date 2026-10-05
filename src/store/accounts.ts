import {
  createAccount,
  reconcile as reconcileDecision,
  updateAccount,
  type AccountInput,
} from "@/domain/accounts";
import type { Store } from "./store";

export function addAccount(store: Store, input: AccountInput) {
  return store.run((state, context) => createAccount(state, input, context));
}

export function editAccount(store: Store, id: string, input: AccountInput) {
  return store.run((state) => updateAccount(state, id, input));
}

/** Books what the user's stated balance differs from the computed one by, if anything (FR-005). */
export function reconcile(store: Store, accountId: string, statedCents: number) {
  return store.run((state, context) => reconcileDecision(state, accountId, statedCents, context));
}
