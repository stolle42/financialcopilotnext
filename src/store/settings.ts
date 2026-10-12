import { skipSharingWarning as decideSkipSharingWarning } from "@/domain/settings";
import type { Store } from "./store";

/** Saves Don't warn me again at once, so the choice survives closing the app (FR-095). */
export function skipSharingWarning(store: Store) {
  // It never refuses, so only the store's own save-failed can come back.
  return store.run<never>((state) => decideSkipSharingWarning(state));
}
