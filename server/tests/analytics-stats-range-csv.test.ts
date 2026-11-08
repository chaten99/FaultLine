import { describe, expect, it } from "vitest";
import {
  bucketSecondsFor,
  listBuckets,
  previousWindow,
  resolveWindow,
} from "../src/modules/analytics/analytics-range.js";
import {
  buildDistribution,
  mergeHistogramRows,
  nearestRankPercentile,
  percent,
  quantizeDuration,
  summarizeHistogram,
  type HistogramRow,
} from "../src/modules/analytics/analytics-stats.js";
import {
  buildCsv,
  formatCsvCell,
  sanitizeCsvText,
  sanitizeEndpoint,
} from "../src/modules/analytics/analytics-csv.js";

const rowsFrom = (values: number[]): HistogramRow[] =>
  mergeHistogramRows(
    values.map((value) => ({
      value: quantizeDuration(value),
      count: 1,
      sum: value,
      min: value,
      max: value,
    })),
  );

describe("percentiles", () => {
  const oneToHundred = Array.from({ length: 100 }, (_, index) => index + 1);

  it("uses the nearest-rank method on the underlying observations", () => {
    const summary = summarizeHistogram(rowsFrom(oneToHundred));
    expect(summary).toMatchObject({ samples: 100, min: 1, max: 100, p50: 50, p95: 95, p99: 99 });
    expect(summary.avg).toBe(50.5);
  });

  it("handles a single observation and ties", () => {
    expect(summarizeHistogram(rowsFrom([120]))).toMatchObject({
      samples: 1,
      avg: 120,
      min: 120,
      max: 120,
      p50: 120,
      p95: 120,
      p99: 120,
    });
    const ties = summarizeHistogram(rowsFrom([10, 10, 10, 10, 500]));
    expect(ties.p50).toBe(10);
    expect(ties.p95).toBe(500);
  });

  it("returns null values, never zero, when there are no observations", () => {
    expect(summarizeHistogram([])).toEqual({
      samples: 0,
      avg: null,
      min: null,
      max: null,
      p50: null,
      p95: null,
      p99: null,
    });
  });

  it("merging histograms equals computing over the raw combined data", () => {
    const first = [10, 20, 30, 400, 5000];
    const second = [15, 25, 35, 45, 55, 650];
    const merged = summarizeHistogram(
      mergeHistogramRows([...rowsFrom(first), ...rowsFrom(second)]),
    );
    const direct = summarizeHistogram(rowsFrom([...first, ...second]));
    expect(merged).toEqual(direct);
  });

  it("does not equal an average of per-group averages", () => {
    const small = rowsFrom([100]);
    const large = rowsFrom(Array.from({ length: 99 }, () => 200));
    const pooled = summarizeHistogram(mergeHistogramRows([...small, ...large]));
    expect(pooled.avg).toBe(199);
    expect((100 + 200) / 2).not.toBe(pooled.avg);
  });

  it("keeps exact min, max and average even when percentiles are quantized above one second", () => {
    expect(quantizeDuration(999)).toBe(999);
    expect(quantizeDuration(1234)).toBe(1230);
    const summary = summarizeHistogram(rowsFrom([1234, 1239, 2001]));
    expect(summary.min).toBe(1234);
    expect(summary.max).toBe(2001);
    expect(summary.avg).toBe(1491.3);
    expect(summary.p50).toBe(1230);
  });

  it("computes nearest rank boundaries precisely", () => {
    const sorted = mergeHistogramRows(rowsFrom([1, 2, 3, 4]));
    expect(nearestRankPercentile(sorted, 25)).toBe(1);
    expect(nearestRankPercentile(sorted, 26)).toBe(2);
    expect(nearestRankPercentile(sorted, 100)).toBe(4);
  });
});

describe("latency distribution", () => {
  it("bins actual observations without inventing counts", () => {
    const rows = rowsFrom([100, 100, 110, 150, 400]);
    const bins = buildDistribution(rows, 5);
    expect(bins.reduce((sum, bin) => sum + bin.count, 0)).toBe(5);
    expect(bins[0]?.fromMs).toBe(100);
    expect(bins.at(-1)?.toMs).toBeGreaterThan(400);
    expect(bins.some((bin) => bin.count === 0)).toBe(true);
  });

  it("returns no bins without data", () => {
    expect(buildDistribution([])).toEqual([]);
  });

  it("handles identical values", () => {
    const bins = buildDistribution(rowsFrom([42, 42, 42]));
    expect(bins).toEqual([{ fromMs: 42, toMs: 43, count: 3 }]);
  });
});

describe("percent helper", () => {
  it("returns null instead of 0 or NaN when the denominator is zero", () => {
    expect(percent(0, 0)).toBeNull();
    expect(percent(1, 3)).toBe(33.33);
    expect(percent(0, 5)).toBe(0);
  });
});

describe("date range validation", () => {
  const now = new Date("2026-06-15T12:30:45.000Z");

  it("resolves presets against a minute-aligned end", () => {
    const window = resolveWindow({ range: "24h" }, now);
    expect(window.to.toISOString()).toBe("2026-06-15T12:30:00.000Z");
    expect(window.from.toISOString()).toBe("2026-06-14T12:30:00.000Z");
  });

  it("accepts valid custom ranges", () => {
    const window = resolveWindow(
      { from: new Date("2026-06-01T00:00:00Z"), to: new Date("2026-06-10T00:00:00Z") },
      now,
    );
    expect(window.to.toISOString()).toBe("2026-06-10T00:00:00.000Z");
  });

  it.each([
    [
      "future end",
      { from: new Date("2026-06-14T00:00:00Z"), to: new Date("2026-06-16T00:00:00Z") },
      "to",
    ],
    [
      "inverted",
      { from: new Date("2026-06-10T00:00:00Z"), to: new Date("2026-06-09T00:00:00Z") },
      "from",
    ],
    [
      "equal",
      { from: new Date("2026-06-10T00:00:00Z"), to: new Date("2026-06-10T00:00:00Z") },
      "from",
    ],
    [
      "too short",
      { from: new Date("2026-06-10T00:00:00Z"), to: new Date("2026-06-10T00:02:00Z") },
      "to",
    ],
    [
      "over 90 days",
      { from: new Date("2026-01-01T00:00:00Z"), to: new Date("2026-06-10T00:00:00Z") },
      "from",
    ],
    ["missing bounds", { from: new Date("2026-06-10T00:00:00Z") }, "range"],
  ])("rejects %s", (_label, input, field) => {
    try {
      resolveWindow(input, now);
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toMatchObject({ statusCode: 400, code: "INVALID_RANGE" });
      expect((error as { fieldErrors: Record<string, string> }).fieldErrors).toHaveProperty(field);
    }
  });

  it("allows exactly 90 days and exactly now", () => {
    const to = new Date(now.getTime());
    const from = new Date(to.getTime() - 90 * 24 * 60 * 60 * 1000);
    expect(() => resolveWindow({ from, to }, now)).not.toThrow();
  });

  it("builds the equivalent previous period", () => {
    const window = { from: new Date("2026-06-08T00:00:00Z"), to: new Date("2026-06-10T00:00:00Z") };
    const previous = previousWindow(window);
    expect(previous.from.toISOString()).toBe("2026-06-06T00:00:00.000Z");
    expect(previous.to.toISOString()).toBe("2026-06-08T00:00:00.000Z");
  });
});

describe("bucket sizing", () => {
  const hour = 3_600_000;
  it.each([
    [hour, 300],
    [24 * hour, 900],
    [7 * 24 * hour, 3600],
    [30 * 24 * hour, 21_600],
    [90 * 24 * hour, 86_400],
  ])("chooses a sensible bucket for a %i ms range", (span, expected) => {
    expect(bucketSecondsFor(span)).toBe(expected);
  });

  it("lists epoch-aligned buckets clipped to the window", () => {
    const from = Date.UTC(2026, 0, 1, 0, 20);
    const to = Date.UTC(2026, 0, 1, 2, 10);
    const buckets = listBuckets(from, to, 3_600_000);
    expect(buckets).toEqual([
      { start: from, end: Date.UTC(2026, 0, 1, 1, 0) },
      { start: Date.UTC(2026, 0, 1, 1, 0), end: Date.UTC(2026, 0, 1, 2, 0) },
      { start: Date.UTC(2026, 0, 1, 2, 0), end: to },
    ]);
  });
});

describe("CSV safety", () => {
  it("escapes commas, quotes and line breaks", () => {
    expect(formatCsvCell('a,"b"\nc')).toBe('"a,""b""\nc"');
    expect(formatCsvCell("plain")).toBe("plain");
  });

  it.each(["=SUM(A1:A2)", "+1+1", "-2+3", "@cmd", "\t=1", "\r=1"])(
    "neutralizes spreadsheet formula injection in %j",
    (value) => {
      expect(sanitizeCsvText(value).startsWith("'")).toBe(true);
      expect(formatCsvCell(value).replace(/^"/, "").startsWith("'")).toBe(true);
    },
  );

  it("does not alter numeric cells, including negative numbers", () => {
    expect(formatCsvCell(-5)).toBe("-5");
    expect(formatCsvCell(0)).toBe("0");
    expect(formatCsvCell(Number.NaN)).toBe("");
  });

  it("formats dates in ISO UTC and empties for null", () => {
    expect(formatCsvCell(new Date("2026-01-01T00:00:00Z"))).toBe("2026-01-01T00:00:00.000Z");
    expect(formatCsvCell(null)).toBe("");
    expect(formatCsvCell(undefined)).toBe("");
  });

  it("strips control characters", () => {
    expect(sanitizeCsvText("a\u0000b\u0007c")).toBe("abc");
  });

  it("builds a CRLF-terminated document with headers", () => {
    const csv = buildCsv(
      ["name", "value"],
      [
        ["=cmd|' /C calc'!A0", 5],
        ["ok", null],
      ],
    );
    expect(csv).toBe("name,value\r\n'=cmd|' /C calc'!A0,5\r\nok,\r\n");
  });

  it("removes credentials, query strings and fragments from endpoints", () => {
    expect(sanitizeEndpoint("https://user:pass@api.example.com/health?token=abc#frag")).toBe(
      "https://api.example.com/health",
    );
    expect(sanitizeEndpoint("not a url")).toBe("Invalid URL");
  });
});
