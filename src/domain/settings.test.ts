import { describe, expect, test } from "vitest";
import { seedState } from "./seed";
import { setDataSharing } from "./settings";
import { applyValid, idCounter } from "./testing";

// FR-095; data-model.md, settings and state transitions (data sharing).

describe("setDataSharing (FR-095)", () => {
  test("starts off on first launch", () => {
    expect(seedState(idCounter()).settings).not.toHaveProperty("dataSharing");
  });

  test("turning sharing on stores dataSharing: true and keeps the other settings", () => {
    const state = seedState(idCounter());
    const next = applyValid(state, setDataSharing(state, true));
    expect(next.settings).toStrictEqual({ ...state.settings, dataSharing: true });
  });

  test("turning sharing off removes the key, storing neither false nor undefined", () => {
    const state = seedState(idCounter());
    const on = applyValid(state, setDataSharing(state, true));

    const off = applyValid(on, setDataSharing(on, false));

    expect(off.settings).toStrictEqual(state.settings);
    expect(Object.keys(off.settings)).not.toContain("dataSharing");
  });

  test("changes the settings only", () => {
    const state = seedState(idCounter());
    expect(Object.keys(setDataSharing(state, true))).toEqual(["settings"]);
  });

  test("turning on twice keeps it on", () => {
    const state = seedState(idCounter());
    const on = applyValid(state, setDataSharing(state, true));
    expect(applyValid(on, setDataSharing(on, true)).settings).toStrictEqual(on.settings);
  });
});
