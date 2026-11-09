import { describe, expect, it } from "vitest";
import {
  INSUFFICIENT,
  NO_DATA,
  formatDuration,
  formatMs,
  formatPercent,
  presentAvailability,
  presentAvgResponse,
  presentDelta,
  presentDowntime,
  presentIncidentCount,
  presentSuccessRate,
  presentTotalChecks,
} from "./analytics-format";

describe("number formatting", () => {
  it("formats percentages and treats missing values as null", () => {
    expect(formatPercent(99.9512, 2)).toBe("99.95%");
    expect(formatPercent(null)).toBeNull();
    expect(formatPercent(undefined)).toBeNull();
    expect(formatPercent(Number.NaN)).toBeNull();
  });

  it("formats durations", () => {
    expect(formatDuration(0)).toBe("0s");
    expect(formatDuration(45_000)).toBe("45s");
    expect(formatDuration(125_000)).toBe("2m 5s");
    expect(formatDuration(3_900_000)).toBe("1h 5m");
    expect(formatDuration(90_000_000)).toBe("1d 1h");
    expect(formatDuration(null)).toBe("-");
    expect(formatDuration(-5)).toBe("-");
  });

  it("formats milliseconds and seconds", () => {
    expect(formatMs(120.4)).toBe("120 ms");
    expect(formatMs(1240)).toBe("1.24 s");
    expect(formatMs(12_400)).toBe("12.4 s");
    expect(formatMs(null)).toBe("-");
  });
});

describe("metric presentation never shows missing data as zero", () => {
  it("availability", () => {
    expect(
      presentAvailability({ percent: null, state: "insufficient", eligibleMs: 0, knownMs: 0 }),
    ).toMatchObject({ value: INSUFFICIENT, state: "insufficient" });
    expect(
      presentAvailability({
        percent: 99.98765,
        state: "ok",
        eligibleMs: 3_600_000,
        knownMs: 3_600_000,
      }),
    ).toMatchObject({ value: "99.988%", state: "ok" });
  });

  it("availability of exactly zero percent is a real value, not missing", () => {
    expect(
      presentAvailability({ percent: 0, state: "ok", eligibleMs: 60_000, knownMs: 60_000 }).value,
    ).toBe("0.000%");
  });

  it("success rate with no completed checks is No data", () => {
    expect(presentSuccessRate({ percent: null, successful: 0, failed: 0, total: 0 })).toMatchObject(
      {
        value: NO_DATA,
        state: "empty",
      },
    );
    expect(
      presentSuccessRate({ percent: 99.5, successful: 995, failed: 5, total: 1000 }),
    ).toMatchObject({
      value: "99.50%",
      hint: "995 of 1,000 checks succeeded",
    });
  });

  it("totals and average response", () => {
    expect(presentTotalChecks(0).value).toBe(NO_DATA);
    expect(presentTotalChecks(12345).value).toBe("12,345");
    expect(presentAvgResponse(null, 0).value).toBe(NO_DATA);
    expect(presentAvgResponse(250, 10)).toMatchObject({ value: "250 ms", state: "ok" });
  });

  it("downtime states", () => {
    expect(presentDowntime({ ms: null, state: "unknown", outages: 0 })).toMatchObject({
      value: INSUFFICIENT,
    });
    expect(presentDowntime({ ms: 0, state: "observed", outages: 0 })).toMatchObject({
      value: "0s",
      hint: "0 outages",
    });
    expect(presentDowntime({ ms: 120_000, state: "incomplete", outages: 1 }).hint).toContain(
      "incomplete",
    );
  });

  it("incident count hints", () => {
    expect(presentIncidentCount(0, 0).hint).toBe("No incidents recorded");
    expect(presentIncidentCount(3, 1).hint).toBe("1 currently open");
    expect(presentIncidentCount(3, 0).hint).toBeUndefined();
  });
});

describe("comparison display rules", () => {
  it("renders nothing for missing comparisons", () => {
    expect(presentDelta("availabilityDeltaPoints", null)).toBeNull();
    expect(presentDelta("incidentsDelta", Number.NaN)).toBeNull();
  });

  it("marks improvements and regressions by metric direction", () => {
    expect(presentDelta("availabilityDeltaPoints", 0.25)).toEqual({
      text: "+0.25 pts vs previous period",
      tone: "better",
    });
    expect(presentDelta("successRateDeltaPoints", -1.5)?.tone).toBe("worse");
    expect(presentDelta("avgResponseDeltaPercent", -12)).toEqual({
      text: "-12% vs previous period",
      tone: "better",
    });
    expect(presentDelta("downtimeDeltaPercent", 30)?.tone).toBe("worse");
    expect(presentDelta("incidentsDelta", 2)).toEqual({
      text: "+2 vs previous period",
      tone: "worse",
    });
  });

  it("treats a zero delta as no change", () => {
    expect(presentDelta("availabilityDeltaPoints", 0)).toEqual({
      text: "No change vs previous period",
      tone: "neutral",
    });
    expect(presentDelta("availabilityDeltaPoints", 0.001)?.tone).toBe("neutral");
  });
});
