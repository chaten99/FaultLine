import type { AnalyticsQuery, RangeKey } from "../types/analytics.types";

export const MINUTE_MS = 60_000;
export const DAY_MS = 86_400_000;
export const MIN_SPAN_MS = 5 * MINUTE_MS;
export const MAX_SPAN_MS = 90 * DAY_MS;
export const FUTURE_TOLERANCE_MS = MINUTE_MS;

export const rangeOptions: { key: RangeKey; label: string }[] = [
  { key: "24h", label: "Last 24 hours" },
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
  { key: "90d", label: "Last 90 days" },
  { key: "custom", label: "Custom range" },
];

export const presetOptions = rangeOptions.filter((option) => option.key !== "custom");

const presetSpans: Record<Exclude<RangeKey, "custom">, number> = {
  "24h": DAY_MS,
  "7d": 7 * DAY_MS,
  "30d": 30 * DAY_MS,
  "90d": 90 * DAY_MS,
};

export const floorToMinute = (ms: number): number => Math.floor(ms / MINUTE_MS) * MINUTE_MS;

export const anchorNow = (now: number): number => floorToMinute(now) - MINUTE_MS;

export type RangeState = {
  range: RangeKey;
  from?: string;
  to?: string;
  monitorId?: string;
};

export type RangeValidation = { valid: boolean; message: string };

export const validateRange = (
  from: Date | string | undefined,
  to: Date | string | undefined,
  now: number,
): RangeValidation => {
  const fromMs = from ? new Date(from).getTime() : Number.NaN;
  const toMs = to ? new Date(to).getTime() : Number.NaN;
  if (Number.isNaN(fromMs) || Number.isNaN(toMs)) {
    return { valid: false, message: "Choose a valid start and end date." };
  }
  if (toMs > now + FUTURE_TOLERANCE_MS) {
    return { valid: false, message: "The end of the range cannot be in the future." };
  }
  if (fromMs >= toMs) {
    return { valid: false, message: "The start must be before the end." };
  }
  if (toMs - fromMs < MIN_SPAN_MS) {
    return { valid: false, message: "The range must be at least 5 minutes long." };
  }
  if (toMs - fromMs > MAX_SPAN_MS) {
    return { valid: false, message: "The range cannot be longer than 90 days." };
  }
  return { valid: true, message: "" };
};

export const resolveWindow = (state: RangeState, anchor: number): { from: Date; to: Date } => {
  if (state.range === "custom" && state.from && state.to) {
    return { from: new Date(state.from), to: new Date(state.to) };
  }
  const key = state.range === "custom" ? "7d" : state.range;
  return { from: new Date(anchor - presetSpans[key]), to: new Date(anchor) };
};

export const toAnalyticsQuery = (state: RangeState, anchor: number): AnalyticsQuery => {
  const { from, to } = resolveWindow(state, anchor);
  const query: AnalyticsQuery = { from: from.toISOString(), to: to.toISOString() };
  if (state.monitorId) query.monitorId = state.monitorId;
  return query;
};

const isRangeKey = (value: string | null): value is RangeKey =>
  value === "24h" || value === "7d" || value === "30d" || value === "90d" || value === "custom";

const monitorIdPattern = /^[a-f\d]{24}$/i;

export const parseRangeState = (params: URLSearchParams, now: number): RangeState => {
  const rawRange = params.get("range");
  const monitor = params.get("monitor");
  const monitorId = monitor && monitorIdPattern.test(monitor) ? monitor : undefined;
  const base: RangeState = { range: "7d" };
  if (monitorId) base.monitorId = monitorId;
  if (!isRangeKey(rawRange)) return base;
  if (rawRange !== "custom") return { ...base, range: rawRange };
  const from = params.get("from") ?? undefined;
  const to = params.get("to") ?? undefined;
  if (!validateRange(from, to, now).valid) return base;
  return { ...base, range: "custom", from, to };
};

export const serializeRangeState = (state: RangeState): URLSearchParams => {
  const params = new URLSearchParams();
  params.set("range", state.range);
  if (state.range === "custom" && state.from && state.to) {
    params.set("from", state.from);
    params.set("to", state.to);
  }
  if (state.monitorId) params.set("monitor", state.monitorId);
  return params;
};

export const startOfLocalDay = (date: Date): Date =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());

export const endOfLocalDay = (date: Date): Date =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);

export const customRangeFromDays = (
  startDay: Date,
  endDay: Date,
  now: number,
): { from: Date; to: Date } => {
  const from = startOfLocalDay(startDay);
  const endBoundary = endOfLocalDay(endDay);
  const latest = new Date(anchorNow(now));
  return { from, to: endBoundary.getTime() > latest.getTime() ? latest : endBoundary };
};

export const browserTimeZone = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "local time";
  } catch {
    return "local time";
  }
};

export const formatRangeLabel = (from: string | Date, to: string | Date): string => {
  const options: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  };
  const start = new Date(from);
  const end = new Date(to);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "";
  return `${start.toLocaleString(undefined, options)} - ${end.toLocaleString(undefined, options)}`;
};
