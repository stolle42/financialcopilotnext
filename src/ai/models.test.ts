import { describe, expect, test } from "vitest";
import { AI_MODELS, DEFAULT_MODEL, modelInUse } from "./models";

// FR-129, FR-130; R-32; data-model.md, derived values (model in use).

describe("AI_MODELS (R-32)", () => {
  test("lists three models in the order Settings shows them, each with its hint", () => {
    expect(AI_MODELS).toEqual([
      { id: "gpt-5.4-mini", hint: "fastest" },
      { id: "gpt-5.6-luna", hint: "balanced" },
      { id: "gpt-6.1-sol", hint: "most thorough, slowest" },
    ]);
  });

  test("names gpt-5.4-mini the default, a model of the list", () => {
    expect(DEFAULT_MODEL).toBe("gpt-5.4-mini");
    expect(AI_MODELS.map((model) => model.id)).toContain(DEFAULT_MODEL);
  });
});

describe("modelInUse (FR-129, FR-130)", () => {
  const settings = { manualEntryAccountId: "cash" };

  test("is the default while no model is chosen", () => {
    expect(modelInUse(settings)).toEqual({ model: "gpt-5.4-mini", noLongerOffered: false });
  });

  test.each(["gpt-5.4-mini", "gpt-6.1-sol", "gpt-5.6-luna"])("is %s once chosen", (model) => {
    expect(modelInUse({ ...settings, model })).toEqual({ model, noLongerOffered: false });
  });

  test("is the default, no longer offered, for a model the list does not hold", () => {
    expect(modelInUse({ ...settings, model: "gpt-4o" })).toEqual({
      model: "gpt-5.4-mini",
      noLongerOffered: true,
    });
  });
});
