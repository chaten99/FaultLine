import type {
  IncidentStatus,
  MonitorState,
  PageStatus,
  PublicStatus,
  TimelineState,
} from "../types/status-page.types";

export type Tone = "good" | "warn" | "bad" | "neutral";

export type StatusPresentation = {
  label: string;
  tone: Tone;
  symbol: string;
  banner: string;
};

export const publicStatusPresentation: Record<PublicStatus, StatusPresentation> = {
  operational: {
    label: "Operational",
    tone: "good",
    symbol: "✓",
    banner: "All monitored services are operating normally.",
  },
  partial_outage: {
    label: "Partial outage",
    tone: "warn",
    symbol: "!",
    banner: "Some services are experiencing disruptions.",
  },
  major_outage: {
    label: "Major outage",
    tone: "bad",
    symbol: "✕",
    banner: "One or more services are experiencing significant outages.",
  },
  unknown: {
    label: "Status unknown",
    tone: "neutral",
    symbol: "?",
    banner: "We are currently unable to determine the status of all services.",
  },
};

export const monitorStatePresentation: Record<MonitorState, { label: string; tone: Tone }> = {
  operational: { label: "Operational", tone: "good" },
  down: { label: "Down", tone: "bad" },
  paused: { label: "Paused", tone: "neutral" },
  unknown: { label: "Unknown", tone: "neutral" },
};

export const pageStatusPresentation: Record<PageStatus, { label: string; description: string }> = {
  draft: { label: "Draft", description: "Private. Not visible to visitors." },
  published: { label: "Published", description: "Live at its public URL." },
  unpublished: { label: "Unpublished", description: "Private again. Visitors cannot see it." },
};

export const incidentStatusLabel: Record<IncidentStatus, string> = {
  investigating: "Investigating",
  acknowledged: "Acknowledged",
  resolved: "Resolved",
};

export const toneClasses: Record<Tone, string> = {
  good: "border-emerald-600/30 bg-emerald-600/10 text-emerald-800",
  warn: "border-amber-600/40 bg-amber-500/15 text-amber-900",
  bad: "border-red-600/40 bg-red-600/10 text-red-800",
  neutral: "border-border bg-muted text-muted-foreground",
};

export const bannerMessage = (status: PublicStatus, serverMessage?: string | null): string =>
  serverMessage?.trim() ? serverMessage : publicStatusPresentation[status].banner;

export const serviceCountsNote = (counts: {
  paused: number;
  unknown: number;
  down: number;
  total: number;
}): string | null => {
  const parts: string[] = [];
  if (counts.down > 0) parts.push(`${counts.down} of ${counts.total} down`);
  if (counts.paused > 0) parts.push(`${counts.paused} paused`);
  if (counts.unknown > 0) parts.push(`${counts.unknown} unknown`);
  return parts.length > 0 ? parts.join(", ") : null;
};

export const timelineStatePresentation: Record<
  TimelineState,
  { label: string; className: string; pattern: string }
> = {
  up: { label: "Operational", className: "bg-emerald-600", pattern: "" },
  down: { label: "Outage", className: "bg-red-600", pattern: "✕" },
  paused: { label: "Paused", className: "bg-slate-400", pattern: "‖" },
  unknown: { label: "Unknown", className: "bg-slate-300", pattern: "?" },
  insufficient: { label: "Not enough data", className: "bg-slate-200", pattern: "·" },
};

export const formatPercent = (percent: number | null, state: "ok" | "insufficient"): string =>
  state === "ok" && percent !== null ? `${percent.toFixed(2)}%` : "Not enough data";

export const formatDuration = (durationMs: number): string => {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
};

export const formatDateTime = (value: string | null | undefined): string => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export const formatDate = (value: string | null | undefined): string => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
};

export const toneSolid: Record<Tone, string> = {
  good: "bg-emerald-600",
  warn: "bg-amber-500",
  bad: "bg-red-600",
  neutral: "bg-slate-400",
};

export const toneRing: Record<Tone, string> = {
  good: "text-emerald-600",
  warn: "text-amber-600",
  bad: "text-red-600",
  neutral: "text-slate-500",
};
