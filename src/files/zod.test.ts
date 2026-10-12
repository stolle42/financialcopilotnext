import { describe, expect, test } from "vitest";
import { z } from "./zod";

// R-19, R-23: zod's fast path compiles schemas with `new Function`, which the CSP blocks and reports.

describe("zod", () => {
  test("comes with its fast path switched off, whichever schema module loads first", () => {
    expect(z.config().jitless).toBe(true);
  });
});
