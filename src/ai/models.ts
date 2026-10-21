import type { Settings } from "@/domain/types";

/** The models Settings offers, in the order it shows them, each with its hint (FR-129, R-32). */
export const AI_MODELS = [
  { id: "gpt-5.4-mini", hint: "default" },
  { id: "gpt-6.1-sol", hint: "better answers, costs more" },
  { id: "gpt-5.6-luna", hint: "cheaper" },
] as const satisfies readonly { id: string; hint: string }[];

/** The model in use while the user has chosen none. */
export const DEFAULT_MODEL = "gpt-5.4-mini";

/**
 * The model that answers: the user's choice, or the default while none is chosen or the chosen
 * one is no longer offered, which `noLongerOffered` tells (FR-129, FR-130; data-model.md, derived
 * values).
 */
export function modelInUse(settings: Settings): { model: string; noLongerOffered: boolean } {
  const chosen = settings.model;
  if (chosen === undefined) return { model: DEFAULT_MODEL, noLongerOffered: false };
  if (AI_MODELS.some((model) => model.id === chosen)) {
    return { model: chosen, noLongerOffered: false };
  }
  return { model: DEFAULT_MODEL, noLongerOffered: true };
}
