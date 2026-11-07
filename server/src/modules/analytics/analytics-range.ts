import { createApiError } from "../../lib/errors/create-api-error.js";

export const maxRangeMs = 90 * 24 * 60 * 60 * 1000;
export const minRangeMs = 5 * 60 * 1000;
const futureToleranceMs = 60 * 1000;

export const presetDurations = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
  "90d": 90 * 24 * 60 * 60 * 1000,
} as const;

export type RangePreset = keyof typeof presetDurations;

export type AnalyticsWindow = { from: Date; to: Date };

const invalid = (field: "from" | "to" | "range", message: string) =>
  createApiError(message, 400, "INVALID_RANGE", { [field]: message });

export const resolveWindow = (
  input: { range?: RangePreset; from?: Date; to?: Date },
  now = new Date(),
): AnalyticsWindow => {
  if (input.range) {
    const to = new Date(Math.floor(now.getTime() / 60_000) * 60_000);
    return { from: new Date(to.getTime() - presetDurations[input.range]), to };
  }
  if (!input.from || !input.to) {
    throw invalid("range", "Provide a range preset or both from and to.");
  }
  if (input.to.getTime() > now.getTime() + futureToleranceMs) {
    throw invalid("to", "The end of the range cannot be in the future.");
  }
  if (input.from.getTime() >= input.to.getTime()) {
    throw invalid("from", "The start of the range must be before its end.");
  }
  const span = input.to.getTime() - input.from.getTime();
  if (span < minRangeMs) throw invalid("to", "The range must cover at least 5 minutes.");
  if (span > maxRangeMs) throw invalid("from", "The range cannot be longer than 90 days.");
  return { from: input.from, to: input.to };
};

export const bucketSecondsFor = (spanMs: number): number => {
  const hour = 60 * 60 * 1000;
  if (spanMs <= 3 * hour) return 300;
  if (spanMs <= 36 * hour) return 900;
  if (spanMs <= 8 * 24 * hour) return 3600;
  if (spanMs <= 35 * 24 * hour) return 21_600;
  return 86_400;
};

export const bucketStart = (timestamp: number, bucketMs: number): number =>
  Math.floor(timestamp / bucketMs) * bucketMs;

export const listBuckets = (
  from: number,
  to: number,
  bucketMs: number,
): Array<{ start: number; end: number }> => {
  const buckets: Array<{ start: number; end: number }> = [];
  for (let start = bucketStart(from, bucketMs); start < to; start += bucketMs) {
    const clippedStart = Math.max(start, from);
    const clippedEnd = Math.min(start + bucketMs, to);
    if (clippedEnd > clippedStart) buckets.push({ start: clippedStart, end: clippedEnd });
  }
  return buckets;
};

export const previousWindow = (window: AnalyticsWindow): AnalyticsWindow => {
  const span = window.to.getTime() - window.from.getTime();
  return { from: new Date(window.from.getTime() - span), to: new Date(window.from.getTime()) };
};
