import {
  createCategory as createDecision,
  deleteCategory as deleteDecision,
  recolourCategory as recolourDecision,
  renameCategory as renameDecision,
  type CategoryInput,
} from "@/domain/categories";
import type { Store } from "./store";

export function createCategory(store: Store, input: CategoryInput) {
  return store.run((state, context) => createDecision(state, input, context));
}

export function renameCategory(store: Store, id: string, name: string) {
  return store.run((state) => renameDecision(state, id, name));
}

export function recolourCategory(store: Store, id: string, color: string) {
  return store.run((state) => recolourDecision(state, id, color));
}

/** Deleting writes the category, its transactions, its budget and the pending rows in one go (R-06). */
export function deleteCategory(store: Store, id: string) {
  return store.run((state) => deleteDecision(state, id));
}
