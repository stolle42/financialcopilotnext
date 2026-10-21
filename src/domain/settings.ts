import type { Changes } from "./changes";
import type { Settings, State } from "./types";

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

/** Chooses the model that answers, and changes nothing else (FR-129). */
export function setModel(state: State, model: string): Changes {
  return { settings: { put: { ...state.settings, model } } };
}
