import type { Changes } from "./changes";
import type { Refusal, Settings, State } from "./types";

/**
 * Turns AI features on or off (FR-095). Off removes the setting rather than storing `false`, so
 * the stored settings read as they did before v1.2 (data-model.md, settings).
 */
export function setAiFeatures(state: State, on: boolean): Changes {
  const settings: Settings = { ...state.settings };
  if (on) settings.aiFeatures = true;
  else delete settings.aiFeatures;
  return { settings: { put: settings } };
}

/**
 * Stores the key and turns AI features on, together, so neither is stored without the other
 * (FR-126). The key is trimmed of spaces and line breaks a paste may bring.
 */
export function turnOnWithKey(state: State, key: string): Changes {
  return { ...setAiFeatures(state, true), apiKey: key.trim() };
}

/** Deletes the key and turns AI features off, together; the chosen model stays (FR-126). */
export function removeKey(state: State): Changes {
  return { ...setAiFeatures(state, false), apiKey: null };
}

/** The key as Settings shows it: `sk-…` and its last 4 characters only (FR-126). */
export function maskKey(key: string): string {
  return `sk-…${key.slice(-4)}`;
}

/** Chooses the model that answers, and changes nothing else (FR-129). */
export function setModel(state: State, model: string): Changes {
  return { settings: { put: { ...state.settings, model } } };
}

/**
 * Sets the amount under which review sets rows aside, in cents, or removes it with `undefined`
 * (FR-152). Zero, a negative amount and a fraction of a cent are refused, so a stored amount is
 * always a positive whole number of cents (data-model.md, settings).
 */
export function setSetAsideAmount(
  state: State,
  cents: number | undefined,
): Changes | Refusal<"set-aside-amount-invalid"> {
  const settings: Settings = { ...state.settings };
  if (cents === undefined) {
    delete settings.setAsideUnderCents;
  } else {
    if (!Number.isSafeInteger(cents) || cents <= 0) return { code: "set-aside-amount-invalid" };
    settings.setAsideUnderCents = cents;
  }
  return { settings: { put: settings } };
}
