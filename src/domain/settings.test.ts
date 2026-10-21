import { describe, expect, test } from "vitest";
import { seedState } from "./seed";
import { setAiFeatures, setModel } from "./settings";
import { applyValid, idCounter } from "./testing";

// FR-095; data-model.md, settings and state transitions (AI features).

describe("setAiFeatures (FR-095)", () => {
  test("AI features are off on first launch", () => {
    expect(seedState(idCounter()).settings).not.toHaveProperty("aiFeatures");
  });

  test("turning them on stores aiFeatures: true and keeps the other settings", () => {
    const state = seedState(idCounter());
    const next = applyValid(state, setAiFeatures(state, true));
    expect(next.settings).toStrictEqual({ ...state.settings, aiFeatures: true });
  });

  test("turning them off removes the key and keeps the other settings", () => {
    const state = seedState(idCounter());
    const on = applyValid(state, setAiFeatures(state, true));
    const off = applyValid(on, setAiFeatures(on, false));
    expect(off.settings).toStrictEqual(state.settings);
    expect(off.settings).not.toHaveProperty("aiFeatures");
  });

  test("changes the settings only", () => {
    const state = seedState(idCounter());
    expect(Object.keys(setAiFeatures(state, true))).toEqual(["settings"]);
    expect(Object.keys(setAiFeatures(state, false))).toEqual(["settings"]);
  });

  test("turning them on twice keeps them on", () => {
    const state = seedState(idCounter());
    const on = applyValid(state, setAiFeatures(state, true));
    expect(applyValid(on, setAiFeatures(on, true)).settings).toStrictEqual(on.settings);
  });
});

describe("setModel (FR-129; data-model.md, state transitions: model)", () => {
  test("no model is chosen on first launch", () => {
    expect(seedState(idCounter()).settings).not.toHaveProperty("model");
  });

  test("stores the model and keeps the other settings", () => {
    const state = seedState(idCounter());
    const next = applyValid(state, setModel(state, "gpt-6.1-sol"));
    expect(next.settings).toStrictEqual({ ...state.settings, model: "gpt-6.1-sol" });
  });

  test("stores the model in use too, when the user selects it", () => {
    const state = seedState(idCounter());
    const next = applyValid(state, setModel(state, "gpt-5.4-mini"));
    expect(next.settings.model).toBe("gpt-5.4-mini");
  });

  test("replaces a model chosen before, also one no longer offered", () => {
    const state = seedState(idCounter());
    const old = applyValid(state, { settings: { put: { ...state.settings, model: "gpt-4o" } } });
    expect(applyValid(old, setModel(old, "gpt-5.6-luna")).settings.model).toBe("gpt-5.6-luna");
  });

  test("changes nothing else, whether AI features are on or off", () => {
    const state = seedState(idCounter());
    const on = applyValid(state, setAiFeatures(state, true));
    expect(Object.keys(setModel(state, "gpt-6.1-sol"))).toEqual(["settings"]);
    expect(applyValid(on, setModel(on, "gpt-6.1-sol")).settings).toStrictEqual({
      ...on.settings,
      model: "gpt-6.1-sol",
    });
  });
});
