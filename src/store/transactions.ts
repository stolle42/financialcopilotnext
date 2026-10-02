import { deleteTransaction, saveDraft, type Draft } from "@/domain/transactions";
import type { Store } from "./store";

export function saveTransaction(store: Store, draft: Draft) {
  return store.run((state, context) => saveDraft(state, draft, context));
}

export function removeTransaction(store: Store, id: string) {
  return store.run((state) => deleteTransaction(state, id));
}
