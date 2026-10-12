import { describe, expect, test } from "vitest";
import { seedState } from "./seed";
import { skipSharingWarning } from "./settings";
import { applyValid, idCounter } from "./testing";

// FR-095; data-model.md, settings and state transitions (data-sharing warning).

describe("skipSharingWarning (FR-095)", () => {
  test("the warning shows on first launch", () => {
    expect(seedState(idCounter()).settings).not.toHaveProperty("skipSharingWarning");
  });

  test("stores skipSharingWarning: true and keeps the other settings", () => {
    const state = seedState(idCounter());
    const next = applyValid(state, skipSharingWarning(state));
    expect(next.settings).toStrictEqual({ ...state.settings, skipSharingWarning: true });
  });

  test("changes the settings only", () => {
    const state = seedState(idCounter());
    expect(Object.keys(skipSharingWarning(state))).toEqual(["settings"]);
  });

  test("asking twice keeps it", () => {
    const state = seedState(idCounter());
    const skipped = applyValid(state, skipSharingWarning(state));
    expect(applyValid(skipped, skipSharingWarning(skipped)).settings).toStrictEqual(
      skipped.settings,
    );
  });
});
