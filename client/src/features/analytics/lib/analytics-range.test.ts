import { describe, expect, it } from "vitest";
import {
  DAY_MS,
  anchorNow,
  customRangeFromDays,
  floorToMinute,
  parseRangeState,
  resolveWindow,
  serializeRangeState,
  toAnalyticsQuery,
  validateRange,
} from "./analytics-range";

const NOW = Date.parse("2026-11-07T10:30:45.000Z");

describe("range anchoring", () => {
  it("rounds to the minute and stays safely in the past", () => {
    expect(floorToMinute(NOW)).toBe(Date.parse("2026-11-07T10:30:00.000Z"));
    expect(anchorNow(NOW)).toBe(Date.parse("2026-11-07T10:29:00.000Z"));
    expect(anchorNow(NOW)).toBeLessThan(NOW);
  });

  it("produces stable query keys for the same anchor", () => {
    const anchor = anchorNow(NOW);
    const first = toAnalyticsQuery({ range: "7d" }, anchor);
    const second = toAnalyticsQuery({ range: "7d" }, anchor);
    expect(first).toEqual(second);
  });
});

describe("preset ranges", () => {
  it.each([
    ["24h", 1],
    ["7d", 7],
    ["30d", 30],
    ["90d", 90],
  ] as const)("resolves %s relative to the anchor", (range, days) => {
    const anchor = anchorNow(NOW);
    const { from, to } = resolveWindow({ range }, anchor);
    expect(to.getTime()).toBe(anchor);
    expect(to.getTime() - from.getTime()).toBe(days * DAY_MS);
  });

  it("includes the monitor id only when selected", () => {
    const anchor = anchorNow(NOW);
    expect(toAnalyticsQuery({ range: "24h" }, anchor)).not.toHaveProperty("monitorId");
    expect(
      toAnalyticsQuery({ range: "24h", monitorId: "507f1f77bcf86cd799439011" }, anchor),
    ).toHaveProperty("monitorId", "507f1f77bcf86cd799439011");
  });

  it("uses explicit custom bounds", () => {
    const state = {
      range: "custom" as const,
      from: "2026-11-01T00:00:00.000Z",
      to: "2026-11-03T00:00:00.000Z",
    };
    const query = toAnalyticsQuery(state, anchorNow(NOW));
    expect(query).toEqual({ from: state.from, to: state.to });
  });
});

describe("range validation", () => {
  it("accepts a normal range", () => {
    expect(validateRange("2026-11-01T00:00:00Z", "2026-11-05T00:00:00Z", NOW)).toMatchObject({
      valid: true,
    });
  });

  it("rejects invalid dates", () => {
    expect(validateRange("nope", "2026-11-05T00:00:00Z", NOW).valid).toBe(false);
    expect(validateRange(undefined, undefined, NOW).valid).toBe(false);
  });

  it("rejects a future end", () => {
    const result = validateRange("2026-11-01T00:00:00Z", "2026-11-09T00:00:00Z", NOW);
    expect(result).toMatchObject({ valid: false, message: expect.stringContaining("future") });
  });

  it("rejects start after or equal to end", () => {
    expect(validateRange("2026-11-05T00:00:00Z", "2026-11-04T00:00:00Z", NOW).valid).toBe(false);
    expect(validateRange("2026-11-05T00:00:00Z", "2026-11-05T00:00:00Z", NOW).valid).toBe(false);
  });

  it("rejects spans shorter than five minutes", () => {
    expect(validateRange("2026-11-05T00:00:00Z", "2026-11-05T00:04:00Z", NOW).valid).toBe(false);
    expect(validateRange("2026-11-05T00:00:00Z", "2026-11-05T00:05:00Z", NOW).valid).toBe(true);
  });

  it("rejects spans over 90 days", () => {
    const result = validateRange("2026-07-01T00:00:00Z", "2026-11-07T00:00:00Z", NOW);
    expect(result).toMatchObject({ valid: false, message: expect.stringContaining("90 days") });
    expect(validateRange("2026-08-09T00:00:00Z", "2026-11-07T00:00:00Z", NOW).valid).toBe(true);
  });
});

describe("URL state", () => {
  it("defaults to 7 days for missing or unknown ranges", () => {
    expect(parseRangeState(new URLSearchParams(), NOW)).toEqual({ range: "7d" });
    expect(parseRangeState(new URLSearchParams("range=bogus"), NOW)).toEqual({ range: "7d" });
  });

  it("parses presets and a valid monitor id", () => {
    const params = new URLSearchParams("range=30d&monitor=507f1f77bcf86cd799439011");
    expect(parseRangeState(params, NOW)).toEqual({
      range: "30d",
      monitorId: "507f1f77bcf86cd799439011",
    });
  });

  it("ignores malformed monitor ids", () => {
    expect(parseRangeState(new URLSearchParams("monitor=%3Cscript%3E"), NOW)).toEqual({
      range: "7d",
    });
  });

  it("round-trips a valid custom range", () => {
    const state = {
      range: "custom" as const,
      from: "2026-11-01T00:00:00.000Z",
      to: "2026-11-03T00:00:00.000Z",
      monitorId: "507f1f77bcf86cd799439011",
    };
    expect(parseRangeState(serializeRangeState(state), NOW)).toEqual(state);
  });

  it("falls back when a custom range in the URL is invalid or in the future", () => {
    const future = new URLSearchParams(
      "range=custom&from=2026-11-01T00:00:00.000Z&to=2027-01-01T00:00:00.000Z",
    );
    expect(parseRangeState(future, NOW)).toEqual({ range: "7d" });
    expect(parseRangeState(new URLSearchParams("range=custom"), NOW)).toEqual({ range: "7d" });
  });

  it("only serializes custom bounds for custom ranges", () => {
    const params = serializeRangeState({ range: "24h", from: "x", to: "y" });
    expect(params.toString()).toBe("range=24h");
  });
});

describe("custom day selection", () => {
  it("covers whole local days and clips to the latest allowed moment", () => {
    const start = new Date(2026, 10, 1);
    const end = new Date(2026, 10, 3);
    const { from, to } = customRangeFromDays(start, end, new Date(2026, 10, 20, 12).getTime());
    expect(from.getTime()).toBe(new Date(2026, 10, 1).getTime());
    expect(to.getTime()).toBe(new Date(2026, 10, 4).getTime());

    const today = new Date(2026, 10, 7, 10, 30);
    const clipped = customRangeFromDays(
      new Date(2026, 10, 5),
      new Date(2026, 10, 7),
      today.getTime(),
    );
    expect(clipped.to.getTime()).toBe(anchorNow(today.getTime()));
  });
});
