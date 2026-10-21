import {
  setAiFeatures as decideAiFeatures,
  removeKey as decideRemoveKey,
  turnOnWithKey as decideTurnOnWithKey,
  setModel,
} from "@/domain/settings";
import type { State } from "@/domain/types";
import type { Store } from "./store";

/**
 * Whether AI features may send: turned on, with a key stored. The switch alone, as a v1.5 database
 * leaves it, reads as off, wherever the app is served (FR-095, FR-106, FR-126).
 */
export function aiFeaturesOn(state: State): boolean {
  return state.settings.aiFeatures === true && state.apiKey !== null;
}

/** Saves the AI features switch at once, so the choice survives closing the app (FR-095). */
export function setAiFeatures(store: Store, on: boolean) {
  // Turning them on or off never refuses, so only the store's own save-failed can come back.
  return store.run<never>((state) => decideAiFeatures(state, on));
}

/** Stores the checked key and turns AI features on, in one write (FR-126). */
export function turnOnWithKey(store: Store, key: string) {
  return store.run<never>((state) => decideTurnOnWithKey(state, key));
}

/**
 * Deletes the key and turns AI features off, in one write (FR-126). An answer being written stops,
 * as turning off stops it, since AI features no longer read as on (FR-108).
 */
export function removeKey(store: Store) {
  return store.run<never>((state) => decideRemoveKey(state));
}

/** Saves the chosen model at once (FR-129). A failed write keeps the choice as it was. */
export function chooseModel(store: Store, model: string) {
  return store.run<never>((state) => setModel(state, model));
}
