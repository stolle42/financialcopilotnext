import { setAiFeatures as decideAiFeatures } from "@/domain/settings";
import type { Store } from "./store";

/** Saves the AI features switch at once, so the choice survives closing the app (FR-095). */
export function setAiFeatures(store: Store, on: boolean) {
  // Turning them on or off never refuses, so only the store's own save-failed can come back.
  return store.run<never>((state) => decideAiFeatures(state, on));
}
