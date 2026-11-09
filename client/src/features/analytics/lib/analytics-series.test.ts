import { describe, expect, it } from "vitest";
import {
  ariaSort,
  buildExportFilename,
  defaultSortOrder,
  distributionLabel,
  fillSeriesGaps,
  hasObservations,
  nextSort,
  placePercentileMarkers,
  timelineMeta,
  timelineOrder,
} from "./analytics-series";
import type { DistributionBin, ResponseTimePoint } from "../types/analytics.types";

const HOUR = 3_600_000;

const point = (start: number, overrides: Partial<ResponseTimePoint> = {}): ResponseTimePoint => ({
  start: new Date(start).toISOString(),
  end: new Date(start + HOUR).toISOString(),
  samples: 10,
  avg: 100,
  min: 50,
  max: 200,
  p50: 95,
  p95: 180,
  p99: 195,
  ...overrides,
});

describe("fillSeriesGaps", () => {
  const base = Date.parse("2026-11-07T00:00:00.000Z");
  const window = {
    from: new Date(base).toISOString(),
    to: new Date(base + 5 * HOUR).toISOString(),
    bucketSeconds: 3600,
  };

  it("inserts empty buckets as nulls, never zeros", () => {
    const filled = fillSeriesGaps([point(base), point(base + 3 * HOUR)], window);
    expect(filled).toHaveLength(5);
    expect(filled.map((item) => item.samples)).toEqual([10, 0, 0, 10, 0]);
    expect(filled[1]).toMatchObject({ avg: null, p95: null, p99: null, min: null, max: null });
    expect(filled[0]?.avg).toBe(100);
  });

  it("keeps points sorted and returns real values untouched", () => {
    const filled = fillSeriesGaps([point(base + 2 * HOUR, { avg: 321 })], window);
    expect(filled.map((item) => item.t)).toEqual(
      [...filled.map((item) => item.t)].sort((a, b) => a - b),
    );
    expect(filled.find((item) => item.samples > 0)?.avg).toBe(321);
  });

  it("keeps misaligned server buckets instead of dropping them", () => {
    const odd = base + 90 * 60_000;
    const filled = fillSeriesGaps([point(odd)], window);
    expect(filled.some((item) => item.t === odd && item.samples === 10)).toBe(true);
  });

  it("returns only real points when the window would create too many buckets", () => {
    const wide = {
      from: new Date(base).toISOString(),
      to: new Date(base + 40 * 86_400_000).toISOString(),
      bucketSeconds: 60,
    };
    expect(fillSeriesGaps([point(base)], wide, 100)).toHaveLength(1);
  });

  it("handles empty input and invalid windows", () => {
    expect(hasObservations(fillSeriesGaps([], window))).toBe(false);
    expect(fillSeriesGaps([point(base)], { ...window, to: window.from })).toHaveLength(1);
  });
});

describe("percentile markers", () => {
  const bins: DistributionBin[] = [
    { fromMs: 0, toMs: 100, count: 5 },
    { fromMs: 100, toMs: 200, count: 20 },
    { fromMs: 200, toMs: 300, count: 3 },
  ];

  it("places markers in the containing bin", () => {
    const markers = placePercentileMarkers(bins, { p50: 150, p95: 250, p99: 299 });
    expect(markers).toEqual([
      { key: "p50", label: "P50", binIndex: 1 },
      { key: "p95", label: "P95", binIndex: 2 },
      { key: "p99", label: "P99", binIndex: 2 },
    ]);
  });

  it("uses lower-inclusive upper-exclusive bins and includes the final upper bound", () => {
    const markers = placePercentileMarkers(bins, { p50: 100, p95: 300, p99: null });
    expect(markers.map((marker) => marker.binIndex)).toEqual([1, 2]);
  });

  it("omits markers outside the domain or without data", () => {
    expect(placePercentileMarkers(bins, { p50: 5000, p95: null, p99: null })).toEqual([]);
    expect(placePercentileMarkers([], { p50: 10, p95: 10, p99: 10 })).toEqual([]);
  });

  it("labels bins with readable ranges", () => {
    expect(distributionLabel({ fromMs: 900, toMs: 1200, count: 1 })).toBe("900 ms - 1.20 s");
  });
});

describe("timeline state mapping", () => {
  it("describes every state distinctly", () => {
    expect(timelineOrder).toHaveLength(5);
    const labels = timelineOrder.map((state) => timelineMeta[state].label);
    expect(new Set(labels).size).toBe(5);
    expect(timelineMeta.paused.description).toContain("not downtime");
    expect(timelineMeta.unknown.swatch).not.toBe(timelineMeta.up.swatch);
  });
});

describe("sorting", () => {
  it("uses sensible default directions", () => {
    expect(defaultSortOrder("name")).toBe("asc");
    expect(defaultSortOrder("availability")).toBe("desc");
  });

  it("toggles direction on the active column and resets on a new one", () => {
    expect(nextSort({ sortBy: "name", sortOrder: "asc" }, "name")).toEqual({
      sortBy: "name",
      sortOrder: "desc",
    });
    expect(nextSort({ sortBy: "name", sortOrder: "desc" }, "name")).toEqual({
      sortBy: "name",
      sortOrder: "asc",
    });
    expect(nextSort({ sortBy: "name", sortOrder: "asc" }, "downtime")).toEqual({
      sortBy: "downtime",
      sortOrder: "desc",
    });
  });

  it("maps to aria-sort values", () => {
    expect(ariaSort({ sortBy: "name", sortOrder: "asc" }, "name")).toBe("ascending");
    expect(ariaSort({ sortBy: "name", sortOrder: "desc" }, "name")).toBe("descending");
    expect(ariaSort({ sortBy: "name", sortOrder: "desc" }, "incidents")).toBe("none");
  });
});

describe("export filenames", () => {
  const from = "2026-11-01T00:00:00.000Z";
  const to = "2026-11-07T00:00:00.000Z";

  it("builds a descriptive default", () => {
    expect(buildExportFilename("overview", from, to)).toBe(
      "faultline-overview-2026-11-01-2026-11-07.csv",
    );
  });

  it("prefers a safe server-provided name", () => {
    expect(
      buildExportFilename("monitors", from, to, 'attachment; filename="faultline-monitors.csv"'),
    ).toBe("faultline-monitors.csv");
  });

  it("ignores unsafe header filenames", () => {
    expect(
      buildExportFilename("incidents", from, to, 'attachment; filename="../../evil.csv"'),
    ).toBe("faultline-incidents-2026-11-01-2026-11-07.csv");
    expect(buildExportFilename("incidents", "bad", to, null)).toBe(
      "faultline-incidents-range-2026-11-07.csv",
    );
  });
});
