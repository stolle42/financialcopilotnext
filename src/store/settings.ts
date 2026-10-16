import { servedLocally } from "@/ai/local";
import { setAiFeatures as decideAiFeatures } from "@/domain/settings";
import type { State } from "@/domain/types";
import type { Store } from "./store";

/**
 * Whether AI features may send: turned on, in the app served from the user's own computer. A
 * hosted copy keeps them off, whatever a restored backup holds (FR-095, FR-106).
 */
export function aiFeaturesOn(state: State): boolean {
  return state.settings.aiFeatures === true && servedLocally();
}

/** Saves the AI features switch at once, so the choice survives closing the app (FR-095). */
export function setAiFeatures(store: Store, on: boolean) {
  // Turning them on or off never refuses, so only the store's own save-failed can come back.
  return store.run<never>((state) => decideAiFeatures(state, on));
}
