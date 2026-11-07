export type Interval = { start: number; end: number };

export const normalizeIntervals = (intervals: Interval[]): Interval[] => {
  const sorted = intervals
    .filter((interval) => interval.end > interval.start)
    .map((interval) => ({ ...interval }))
    .sort((a, b) => a.start - b.start);
  const merged: Interval[] = [];
  for (const interval of sorted) {
    const last = merged[merged.length - 1];
    if (last && interval.start <= last.end) {
      last.end = Math.max(last.end, interval.end);
    } else {
      merged.push(interval);
    }
  }
  return merged;
};

export const clipIntervals = (intervals: Interval[], start: number, end: number): Interval[] =>
  normalizeIntervals(
    intervals.map((interval) => ({
      start: Math.max(interval.start, start),
      end: Math.min(interval.end, end),
    })),
  );

export const intersectIntervals = (a: Interval[], b: Interval[]): Interval[] => {
  const left = normalizeIntervals(a);
  const right = normalizeIntervals(b);
  const result: Interval[] = [];
  let i = 0;
  let j = 0;
  while (i < left.length && j < right.length) {
    const l = left[i] as Interval;
    const r = right[j] as Interval;
    const start = Math.max(l.start, r.start);
    const end = Math.min(l.end, r.end);
    if (end > start) result.push({ start, end });
    if (l.end < r.end) i += 1;
    else j += 1;
  }
  return result;
};

export const subtractIntervals = (a: Interval[], b: Interval[]): Interval[] => {
  const remove = normalizeIntervals(b);
  const result: Interval[] = [];
  for (const source of normalizeIntervals(a)) {
    let cursor = source.start;
    for (const cut of remove) {
      if (cut.end <= cursor) continue;
      if (cut.start >= source.end) break;
      if (cut.start > cursor) result.push({ start: cursor, end: cut.start });
      cursor = Math.max(cursor, cut.end);
    }
    if (cursor < source.end) result.push({ start: cursor, end: source.end });
  }
  return result;
};

export const totalDuration = (intervals: Interval[]): number =>
  normalizeIntervals(intervals).reduce((sum, interval) => sum + (interval.end - interval.start), 0);

export type LifecycleInput = {
  at: number;
  type: "created" | "paused" | "resumed" | "tracking_started";
  active: boolean;
};

export type MonitorSegments = {
  active: Interval[];
  paused: Interval[];
  untracked: Interval[];
};

type SegmentState = "active" | "paused" | "untracked";

export const buildMonitorSegments = (
  monitor: { createdAt: number },
  events: LifecycleInput[],
  windowStart: number,
  windowEnd: number,
): MonitorSegments => {
  const empty: MonitorSegments = { active: [], paused: [], untracked: [] };
  const start = Math.max(windowStart, monitor.createdAt);
  if (start >= windowEnd) return empty;

  const ordered = [...events].sort((a, b) => a.at - b.at);
  const first = ordered[0];
  const points: Array<{ at: number; state: SegmentState }> = [];
  if (!first || start < first.at) points.push({ at: start, state: "untracked" });
  for (const event of ordered) {
    points.push({ at: event.at, state: event.active ? "active" : "paused" });
  }

  let current: SegmentState = "untracked";
  const timeline: Array<{ at: number; state: SegmentState }> = [{ at: start, state: current }];
  for (const point of points) {
    if (point.at <= start) {
      current = point.state;
      timeline[0] = { at: start, state: current };
    } else if (point.at < windowEnd) {
      timeline.push(point);
    }
  }

  const result: MonitorSegments = { active: [], paused: [], untracked: [] };
  for (let index = 0; index < timeline.length; index += 1) {
    const segment = timeline[index] as { at: number; state: SegmentState };
    const end = timeline[index + 1]?.at ?? windowEnd;
    if (end > segment.at) result[segment.state].push({ start: segment.at, end });
  }
  return {
    active: normalizeIntervals(result.active),
    paused: normalizeIntervals(result.paused),
    untracked: normalizeIntervals(result.untracked),
  };
};

export const gapGraceMs = (intervalMs: number): number =>
  Math.max(30_000, Math.round(intervalMs / 2));

export const buildCheckGaps = (input: {
  intervalMs: number;
  windowStart: number;
  windowEnd: number;
  internalGaps: Array<{ prev: number; next: number }>;
  firstCheck: number | null;
  lastCheck: number | null;
}): Interval[] => {
  const tolerance = input.intervalMs + gapGraceMs(input.intervalMs);
  if (input.firstCheck === null || input.lastCheck === null) {
    return [{ start: input.windowStart, end: input.windowEnd }];
  }
  const gaps: Interval[] = [];
  for (const gap of input.internalGaps) {
    if (gap.next - gap.prev > tolerance) gaps.push({ start: gap.prev + tolerance, end: gap.next });
  }
  if (input.firstCheck - input.windowStart > tolerance) {
    gaps.push({ start: input.windowStart + tolerance, end: input.firstCheck });
  }
  if (input.windowEnd - input.lastCheck > tolerance) {
    gaps.push({ start: input.lastCheck + tolerance, end: input.windowEnd });
  }
  return normalizeIntervals(gaps);
};

export const countExpectedChecks = (active: Interval[], intervalMs: number): number =>
  active.reduce(
    (sum, interval) => sum + Math.floor((interval.end - interval.start) / intervalMs),
    0,
  );
