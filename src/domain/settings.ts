import type { Changes } from "./changes";
import type { Settings, State } from "./types";

/**
 * Turns data sharing on or off (FR-095). Off removes the setting rather than storing `false`, so
 * the stored settings read as they did before v1.2 (data-model.md, settings).
 */
export function setDataSharing(state: State, on: boolean): Changes {
  const settings: Settings = { ...state.settings };
  if (on) settings.dataSharing = true;
  else delete settings.dataSharing;
  return { settings: { put: settings } };
}
