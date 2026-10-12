import { setDataSharing as decideDataSharing } from "@/domain/settings";
import type { Store } from "./store";

/** Saves the data-sharing switch at once, so the choice survives closing the app (FR-095). */
export function setDataSharing(store: Store, on: boolean) {
  // Turning it on or off never refuses, so only the store's own save-failed can come back.
  return store.run<never>((state) => decideDataSharing(state, on));
}
