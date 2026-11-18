import {
  setAiFeatures as decideAiFeatures,
  removeKey as decideRemoveKey,
  turnOnWithKey as decideTurnOnWithKey,
  setModel,
  setSetAsideAmount as decideSetAsideAmount,
} from "@/domain/settings";
import { parseAmount } from "@/domain/amounts";
import type { Changes } from "@/domain/changes";
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

/**
 * Saves the amount typed in the field "Set aside rows under" at once (FR-152). The text follows the
 * amount grammar of CSV import, with the comma as the decimal separator when it holds one and no
 * point. An empty field removes the amount; so does text that is no amount, which is also
 * refused, so a row is never set aside by an amount the field does not show (R-45).
 */
export async function setSetAsideAmount(store: Store, text: string) {
  const trimmed = text.trim();
  if (trimmed === "") {
    return store.run<never>((state) => decideSetAsideAmount(state, undefined) as Changes);
  }
  const comma = trimmed.includes(",") && !trimmed.includes(".");
  const cents = parseAmount(trimmed, comma ? "," : ".");
  const valid = cents !== null && cents > 0;
  const refusal = await store.run<never>(
    (state) => decideSetAsideAmount(state, valid ? cents : undefined) as Changes,
  );
  return refusal ?? (valid ? null : { code: "set-aside-amount-invalid" as const });
}
