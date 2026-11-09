import type { TimelineCell } from "../types/status-page.types";
import { timelineStatePresentation } from "./status-presentation";

export const cellLabel = (cell: TimelineCell): string => {
  const options: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" };
  const start = new Date(cell.start).toLocaleString(undefined, options);
  const end = new Date(cell.end).toLocaleString(undefined, options);
  return `${timelineStatePresentation[cell.state].label}, ${start} to ${end}`;
};

export const legendStates = ["up", "down", "paused", "unknown", "insufficient"] as const;

export const hasAnyData = (cells: TimelineCell[]): boolean =>
  cells.some((cell) => cell.state === "up" || cell.state === "down");

export const historyRanges = [
  { value: "24h", label: "24 hours" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "90d", label: "90 days" },
] as const;
