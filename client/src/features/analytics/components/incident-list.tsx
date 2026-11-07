import { Link } from "react-router-dom";
import { IncidentStatusBadge } from "@/features/incidents/components/incident-status-badge";
import { formatDuration } from "../lib/analytics-format";
import { formatTimestamp } from "../lib/analytics-series";
import type { DowntimePeriod, IncidentRow } from "../types/analytics.types";

export function IncidentList({
  incidents,
  emptyText = "No incidents were recorded in this range.",
}: {
  incidents: IncidentRow[];
  emptyText?: string;
}) {
  if (incidents.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border p-5 text-sm text-muted-foreground">
        {emptyText}
      </p>
    );
  }
  return (
    <ul className="divide-y divide-border rounded-lg border border-border bg-background">
      {incidents.map((incident) => (
        <li key={incident.id}>
          <Link
            to={`/incidents/${incident.id}`}
            className="flex flex-col gap-2 px-4 py-3 transition-colors hover:bg-accent/60 focus-visible:bg-accent/60 focus-visible:outline-none sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0 space-y-1">
              <p className="truncate text-sm font-medium">{incident.title}</p>
              <p className="truncate text-xs text-muted-foreground">
                {incident.monitorName} - started {formatTimestamp(incident.firstFailureAt)}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
              <IncidentStatusBadge status={incident.status} />
              <span className="tabular-nums">
                {incident.ongoing
                  ? `ongoing, ${formatDuration(incident.durationMs)} so far`
                  : formatDuration(incident.durationMs)}
              </span>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function DowntimePeriods({ periods }: { periods: DowntimePeriod[] }) {
  if (periods.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border p-5 text-sm text-muted-foreground">
        No downtime was recorded while this monitor was active in this range.
      </p>
    );
  }
  return (
    <ul className="divide-y divide-border rounded-lg border border-border bg-background">
      {periods.map((period) => {
        const body = (
          <>
            <span className="min-w-0 text-sm">
              {formatTimestamp(period.start)} -{" "}
              {period.ongoing ? "now" : formatTimestamp(period.end)}
            </span>
            <span className="text-xs text-muted-foreground tabular-nums">
              {formatDuration(period.durationMs)}
              {period.ongoing ? " (ongoing)" : ""}
            </span>
          </>
        );
        return (
          <li key={`${period.start}-${period.end}`}>
            {period.incidentId ? (
              <Link
                to={`/incidents/${period.incidentId}`}
                className="flex flex-col gap-1 px-4 py-2.5 transition-colors hover:bg-accent/60 focus-visible:bg-accent/60 focus-visible:outline-none sm:flex-row sm:items-center sm:justify-between"
              >
                {body}
              </Link>
            ) : (
              <div className="flex flex-col gap-1 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                {body}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
