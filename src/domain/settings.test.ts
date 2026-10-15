import { describe, expect, test } from "vitest";
import { seedState } from "./seed";
import { setAiFeatures } from "./settings";
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
