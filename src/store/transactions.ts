import { deleteTransaction, saveDraft, type Draft } from "@/domain/transactions";
import type { Store } from "./store";

export function saveTransaction(store: Store, draft: Draft) {
  return store.run((state, context) => saveDraft(state, draft, context));
}

export function removeTransaction(store: Store, id: string) {
  // Deleting never refuses, so only the store's own save-failed can come back.
  return store.run<never>((state) => deleteTransaction(state, id));
}
