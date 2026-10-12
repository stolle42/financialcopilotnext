import type { Changes } from "./changes";
import type { State } from "./types";

/**
 * Remembers that the user agreed to the data-sharing warning with Don't warn me again ticked
 * (FR-095), so Suggest categories sends at once from now on (data-model.md, settings).
 */
export function skipSharingWarning(state: State): Changes {
  return { settings: { put: { ...state.settings, skipSharingWarning: true } } };
}
