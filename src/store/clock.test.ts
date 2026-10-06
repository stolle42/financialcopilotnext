import { afterEach, describe, expect, test, vi } from "vitest";
import { todayLocal } from "./clock";

afterEach(() => {
  vi.useRealTimers();
});

describe("todayLocal", () => {
  test("is the local calendar date, not the UTC one", () => {
    vi.useFakeTimers();
    // 05:00 UTC on 3 September is still 2 September in the test time zone, Los Angeles.
    vi.setSystemTime(new Date("2026-09-03T05:00:00Z"));
    expect(todayLocal()).toBe("2026-09-02");
  });

  test("pads month and day to two digits", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 5, 12));
    expect(todayLocal()).toBe("2026-01-05");
  });
});
