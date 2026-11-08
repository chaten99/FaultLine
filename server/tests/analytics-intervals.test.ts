import { describe, expect, it } from "vitest";
import {
  buildCheckGaps,
  buildMonitorSegments,
  clipIntervals,
  countExpectedChecks,
  gapGraceMs,
  intersectIntervals,
  normalizeIntervals,
  subtractIntervals,
  totalDuration,
} from "../src/modules/analytics/analytics-intervals.js";

const T0 = Date.UTC(2026, 0, 1, 0, 0, 0);
const M = 60_000;
const H = 60 * M;

describe("interval arithmetic", () => {
  it("merges overlapping and adjacent intervals so nothing is counted twice", () => {
    const merged = normalizeIntervals([
      { start: 10, end: 20 },
      { start: 15, end: 30 },
      { start: 30, end: 40 },
      { start: 50, end: 60 },
      { start: 70, end: 70 },
    ]);
    expect(merged).toEqual([
      { start: 10, end: 40 },
      { start: 50, end: 60 },
    ]);
    expect(totalDuration(merged)).toBe(40);
  });

  it("does not mutate its input", () => {
    const input = [
      { start: 5, end: 10 },
      { start: 1, end: 6 },
    ];
    normalizeIntervals(input);
    expect(input).toEqual([
      { start: 5, end: 10 },
      { start: 1, end: 6 },
    ]);
  });

  it("clips intervals to a window and drops those outside it", () => {
    expect(
      clipIntervals(
        [
          { start: 0, end: 50 },
          { start: 80, end: 200 },
          { start: 300, end: 400 },
        ],
        20,
        100,
      ),
    ).toEqual([
      { start: 20, end: 50 },
      { start: 80, end: 100 },
    ]);
  });

  it("intersects interval lists", () => {
    expect(
      intersectIntervals(
        [
          { start: 0, end: 10 },
          { start: 20, end: 40 },
        ],
        [
          { start: 5, end: 25 },
          { start: 30, end: 35 },
        ],
      ),
    ).toEqual([
      { start: 5, end: 10 },
      { start: 20, end: 25 },
      { start: 30, end: 35 },
    ]);
    expect(intersectIntervals([{ start: 0, end: 5 }], [{ start: 5, end: 9 }])).toEqual([]);
  });

  it("subtracts interval lists", () => {
    expect(
      subtractIntervals(
        [{ start: 0, end: 100 }],
        [
          { start: 10, end: 20 },
          { start: 50, end: 120 },
        ],
      ),
    ).toEqual([
      { start: 0, end: 10 },
      { start: 20, end: 50 },
    ]);
    expect(subtractIntervals([{ start: 0, end: 10 }], [{ start: 0, end: 10 }])).toEqual([]);
    expect(subtractIntervals([{ start: 0, end: 10 }], [])).toEqual([{ start: 0, end: 10 }]);
  });
});

describe("monitor lifecycle segments", () => {
  const window = { from: T0, to: T0 + 10 * H };

  it("treats a monitor created mid-window as existing only from its creation", () => {
    const segments = buildMonitorSegments(
      { createdAt: T0 + 4 * H },
      [{ at: T0 + 4 * H, type: "created", active: true }],
      window.from,
      window.to,
    );
    expect(segments.active).toEqual([{ start: T0 + 4 * H, end: T0 + 10 * H }]);
    expect(segments.paused).toEqual([]);
    expect(segments.untracked).toEqual([]);
  });

  it("separates paused periods from active ones using recorded events only", () => {
    const segments = buildMonitorSegments(
      { createdAt: T0 - 5 * H },
      [
        { at: T0 - 5 * H, type: "created", active: true },
        { at: T0 + 2 * H, type: "paused", active: false },
        { at: T0 + 5 * H, type: "resumed", active: true },
      ],
      window.from,
      window.to,
    );
    expect(segments.active).toEqual([
      { start: T0, end: T0 + 2 * H },
      { start: T0 + 5 * H, end: T0 + 10 * H },
    ]);
    expect(segments.paused).toEqual([{ start: T0 + 2 * H, end: T0 + 5 * H }]);
  });

  it("derives the starting state from events that precede the window", () => {
    const segments = buildMonitorSegments(
      { createdAt: T0 - 9 * H },
      [
        { at: T0 - 9 * H, type: "created", active: true },
        { at: T0 - 3 * H, type: "paused", active: false },
      ],
      window.from,
      window.to,
    );
    expect(segments.active).toEqual([]);
    expect(segments.paused).toEqual([{ start: T0, end: T0 + 10 * H }]);
  });

  it("marks time before baseline tracking as untracked instead of inventing history", () => {
    const segments = buildMonitorSegments(
      { createdAt: T0 - 20 * H },
      [{ at: T0 + 3 * H, type: "tracking_started", active: true }],
      window.from,
      window.to,
    );
    expect(segments.untracked).toEqual([{ start: T0, end: T0 + 3 * H }]);
    expect(segments.active).toEqual([{ start: T0 + 3 * H, end: T0 + 10 * H }]);
  });

  it("treats a monitor with no lifecycle records as entirely untracked", () => {
    const segments = buildMonitorSegments({ createdAt: T0 - H }, [], window.from, window.to);
    expect(segments.untracked).toEqual([{ start: T0, end: T0 + 10 * H }]);
    expect(segments.active).toEqual([]);
  });

  it("returns nothing for monitors created after the window", () => {
    const segments = buildMonitorSegments(
      { createdAt: T0 + 20 * H },
      [{ at: T0 + 20 * H, type: "created", active: true }],
      window.from,
      window.to,
    );
    expect(segments).toEqual({ active: [], paused: [], untracked: [] });
  });

  it("ignores events at or after the window end", () => {
    const segments = buildMonitorSegments(
      { createdAt: T0 - H },
      [
        { at: T0 - H, type: "created", active: true },
        { at: T0 + 10 * H, type: "paused", active: false },
      ],
      window.from,
      window.to,
    );
    expect(segments.active).toEqual([{ start: T0, end: T0 + 10 * H }]);
  });
});

describe("check gaps and expected coverage", () => {
  const interval = 60_000;
  const tolerance = interval + gapGraceMs(interval);

  it("uses a half-interval grace window with a 30 second minimum", () => {
    expect(gapGraceMs(60_000)).toBe(30_000);
    expect(gapGraceMs(3_600_000)).toBe(1_800_000);
  });

  it("does not report a gap for checks arriving within the tolerance", () => {
    const gaps = buildCheckGaps({
      intervalMs: interval,
      windowStart: T0,
      windowEnd: T0 + 10 * M,
      internalGaps: [{ prev: T0 + M, next: T0 + M + tolerance }],
      firstCheck: T0 + 5_000,
      lastCheck: T0 + 10 * M - 5_000,
    });
    expect(gaps).toEqual([]);
  });

  it("reports unknown time beyond the tolerance between checks", () => {
    const gaps = buildCheckGaps({
      intervalMs: interval,
      windowStart: T0,
      windowEnd: T0 + 60 * M,
      internalGaps: [{ prev: T0 + 10 * M, next: T0 + 40 * M }],
      firstCheck: T0,
      lastCheck: T0 + 60 * M - 1000,
    });
    expect(gaps).toEqual([{ start: T0 + 10 * M + tolerance, end: T0 + 40 * M }]);
  });

  it("treats the lead-in and tail of the window as unknown when no checks cover them", () => {
    const gaps = buildCheckGaps({
      intervalMs: interval,
      windowStart: T0,
      windowEnd: T0 + 60 * M,
      internalGaps: [],
      firstCheck: T0 + 20 * M,
      lastCheck: T0 + 30 * M,
    });
    expect(gaps).toEqual([
      { start: T0 + tolerance, end: T0 + 20 * M },
      { start: T0 + 30 * M + tolerance, end: T0 + 60 * M },
    ]);
  });

  it("treats a window with no checks as entirely unknown rather than healthy", () => {
    expect(
      buildCheckGaps({
        intervalMs: interval,
        windowStart: T0,
        windowEnd: T0 + H,
        internalGaps: [],
        firstCheck: null,
        lastCheck: null,
      }),
    ).toEqual([{ start: T0, end: T0 + H }]);
  });

  it("counts expected checks per active interval", () => {
    expect(
      countExpectedChecks(
        [
          { start: T0, end: T0 + 10 * M },
          { start: T0 + H, end: T0 + H + 90_000 },
        ],
        interval,
      ),
    ).toBe(11);
  });
});
