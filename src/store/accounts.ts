import { createAccount, updateAccount, type AccountInput } from "@/domain/accounts";
import type { Store } from "./store";

export function addAccount(store: Store, input: AccountInput) {
  return store.run((state, context) => createAccount(state, input, context));
}

export function editAccount(store: Store, id: string, input: AccountInput) {
  return store.run((state) => updateAccount(state, id, input));
}
