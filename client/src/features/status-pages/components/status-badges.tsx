import { cn } from "@/lib/utils";
import {
  incidentStatusLabel,
  monitorStatePresentation,
  pageStatusPresentation,
  publicStatusPresentation,
  toneClasses,
  type Tone,
} from "../lib/status-presentation";
import type {
  IncidentStatus,
  MonitorState,
  PageStatus,
  PublicStatus,
} from "../types/status-page.types";

const base =
  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap";

export function ToneBadge({
  tone,
  symbol,
  children,
  className,
}: {
  tone: Tone;
  symbol?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={cn(base, toneClasses[tone], className)}>
      {symbol ? <span aria-hidden="true">{symbol}</span> : null}
      {children}
    </span>
  );
}

export function PublicStatusBadge({
  status,
  className,
}: {
  status: PublicStatus;
  className?: string;
}) {
  const presentation = publicStatusPresentation[status];
  return (
    <ToneBadge tone={presentation.tone} symbol={presentation.symbol} className={className}>
      {presentation.label}
    </ToneBadge>
  );
}

const monitorSymbols: Record<MonitorState, string> = {
  operational: "✓",
  down: "✕",
  paused: "‖",
  unknown: "?",
};

export function MonitorStateBadge({ state }: { state: MonitorState }) {
  const presentation = monitorStatePresentation[state];
  return (
    <ToneBadge tone={presentation.tone} symbol={monitorSymbols[state]}>
      {presentation.label}
    </ToneBadge>
  );
}

const pageSymbols: Record<PageStatus, string> = { draft: "✎", published: "●", unpublished: "○" };

export function PageStatusBadge({ status }: { status: PageStatus }) {
  const tone: Tone = status === "published" ? "good" : "neutral";
  return (
    <ToneBadge tone={tone} symbol={pageSymbols[status]}>
      {pageStatusPresentation[status].label}
    </ToneBadge>
  );
}

export function IncidentStatusBadge({ status }: { status: IncidentStatus }) {
  const tone: Tone = status === "resolved" ? "good" : status === "acknowledged" ? "warn" : "bad";
  return <ToneBadge tone={tone}>{incidentStatusLabel[status]}</ToneBadge>;
}
