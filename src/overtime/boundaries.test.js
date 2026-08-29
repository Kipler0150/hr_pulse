import { describe, expect, it } from "vitest";

import { normalizeDayBoundary } from "./boundaries";

describe("normalizeDayBoundary", () => {
  it("converts raw Drizzle timestamp strings to Date values", () => {
    const boundary = normalizeDayBoundary({
      local_date: "2026-08-17",
      utc_start: "2026-08-16T16:00:00.000Z",
      utc_end: "2026-08-17T16:00:00.000Z",
    });

    expect(boundary).toEqual({
      localDate: "2026-08-17",
      utcStart: new Date("2026-08-16T16:00:00.000Z"),
      utcEnd: new Date("2026-08-17T16:00:00.000Z"),
    });
  });
});
