import type {
  PublicIncident,
  StatusBlock,
  TimelineCell,
  TimelineState,
} from "../types/status-page.types";

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export const easeOutCubic = (progress: number): number =>
  1 - Math.pow(1 - clamp(progress, 0, 1), 3);

export const countUpValue = (target: number, progress: number, decimals = 2): number => {
  const factor = Math.pow(10, decimals);
  return Math.round(target * easeOutCubic(progress) * factor) / factor;
};

export const staggerStyle = (index: number, stepMs = 60, maxMs = 420): Record<string, string> => ({
  "--ps-delay": `${clamp(index * stepMs, 0, maxMs)}ms`,
});

export const formatRelativeTime = (value: string | null | undefined, nowMs: number): string => {
  if (!value) return "—";
  const time = Date.parse(value);
  if (Number.isNaN(time)) return "—";
  const seconds = Math.floor((nowMs - time) / 1000);
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

const dayKey = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;

export type IncidentDayGroup = { key: string; label: string; items: PublicIncident[] };

export const groupIncidentsByDay = (
  incidents: PublicIncident[],
  nowMs: number,
): IncidentDayGroup[] => {
  const today = new Date(nowMs);
  const yesterday = new Date(nowMs - 86_400_000);
  const sorted = [...incidents].sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
  const groups: IncidentDayGroup[] = [];
  for (const incident of sorted) {
    const date = new Date(incident.startedAt);
    if (Number.isNaN(date.getTime())) continue;
    const key = dayKey(date);
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.items.push(incident);
      continue;
    }
    const label =
      key === dayKey(today)
        ? "Today"
        : key === dayKey(yesterday)
          ? "Yesterday"
          : date.toLocaleDateString(undefined, {
              year: "numeric",
              month: "short",
              day: "numeric",
            });
    groups.push({ key, label, items: [incident] });
  }
  return groups;
};

export type UptimeBar = {
  key: string;
  start: string;
  end: string;
  state: TimelineState;
  count: number;
  downCount: number;
};

const tiePriority: TimelineState[] = ["unknown", "insufficient", "paused", "up"];

const pickState = (cells: TimelineCell[]): TimelineState => {
  if (cells.some((cell) => cell.state === "down")) return "down";
  const counts = new Map<TimelineState, number>();
  for (const cell of cells) counts.set(cell.state, (counts.get(cell.state) ?? 0) + 1);
  let best: TimelineState = "up";
  let bestCount = -1;
  for (const state of tiePriority) {
    const count = counts.get(state) ?? 0;
    if (count > bestCount) {
      best = state;
      bestCount = count;
    }
  }
  return best;
};

export const bucketTimeline = (cells: TimelineCell[], maxBars: number): UptimeBar[] => {
  if (cells.length === 0) return [];
  const limit = Math.max(1, Math.floor(maxBars));
  const groupCount = Math.min(limit, cells.length);
  const bars: UptimeBar[] = [];
  for (let index = 0; index < groupCount; index += 1) {
    const from = Math.floor((index * cells.length) / groupCount);
    const to = Math.floor(((index + 1) * cells.length) / groupCount);
    const slice = cells.slice(from, Math.max(to, from + 1));
    const first = slice[0] as TimelineCell;
    const last = slice[slice.length - 1] as TimelineCell;
    bars.push({
      key: `${first.start}-${index}`,
      start: first.start,
      end: last.end,
      state: pickState(slice),
      count: slice.length,
      downCount: slice.filter((cell) => cell.state === "down").length,
    });
  }
  return bars;
};

export const barsForWidth = (width: number, minBarWidth = 6, max = 90, min = 24): number =>
  width > 0 ? clamp(Math.floor(width / minBarWidth), min, max) : max;

export type StatusDiff = { overallChanged: boolean; changedServiceIds: string[] };

export const diffStatus = (
  previous: StatusBlock | undefined,
  next: StatusBlock | undefined,
): StatusDiff => {
  if (!previous || !next) return { overallChanged: false, changedServiceIds: [] };
  const before = new Map(previous.services.map((service) => [service.id, service.status]));
  return {
    overallChanged: previous.overall !== next.overall,
    changedServiceIds: next.services
      .filter((service) => before.has(service.id) && before.get(service.id) !== service.status)
      .map((service) => service.id),
  };
};

export type ConnectionState = "live" | "reconnecting" | "offline";

export const connectionLabel = (state: ConnectionState): string | null =>
  state === "live" ? "Live" : state === "reconnecting" ? "Reconnecting…" : null;

export const nextConnectionState = (
  event: "connect" | "disconnect" | "error",
  everConnected: boolean,
): ConnectionState => (event === "connect" ? "live" : everConnected ? "reconnecting" : "offline");
