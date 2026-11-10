import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateTime, formatDuration, incidentStatusLabel } from "../lib/status-presentation";
import type { IncidentStatus, PublicIncident } from "../types/status-page.types";
import { IncidentStatusBadge } from "./status-badges";

const dotClass: Record<IncidentStatus, string> = {
  investigating: "bg-red-600",
  acknowledged: "bg-amber-500",
  resolved: "bg-emerald-600",
};

const accent: Record<IncidentStatus, string> = {
  investigating: "border-l-red-600",
  acknowledged: "border-l-amber-500",
  resolved: "border-l-emerald-600",
};

export function IncidentCard({
  incident,
  defaultOpen = false,
  fresh = false,
}: {
  incident: PublicIncident;
  defaultOpen?: boolean;
  fresh?: boolean;
}) {
  const titleId = useId();
  const panelId = useId();
  const [open, setOpen] = useState(defaultOpen);
  const duration = formatDuration(incident.durationMs);
  const updates = [...incident.updates].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));

  return (
    <li
      className={cn(
        "ps-card relative rounded-xl border border-l-4 border-border bg-background",
        accent[incident.status],
        fresh ? "ps-slide-in ps-flash [--ps-flash-color:var(--color-amber-500)]" : "",
      )}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((current) => !current)}
        className="group flex min-h-12 w-full items-start gap-3 rounded-xl p-4 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <span className="min-w-0 flex-1 space-y-1.5">
          <span className="flex flex-wrap items-center gap-2">
            <span id={titleId} className="font-semibold break-words">
              {incident.title}
            </span>
            <IncidentStatusBadge status={incident.status} />
          </span>
          <span className="block text-xs text-muted-foreground">
            {incident.services.length > 0 ? `${incident.services.join(", ")} · ` : ""}
            Started {formatDateTime(incident.startedAt)}
            {incident.ongoing ? ` · ongoing for ${duration}` : ` · lasted ${duration}`}
          </span>
        </span>
        <ChevronDown
          aria-hidden="true"
          className={cn(
            "mt-1 size-4 shrink-0 text-muted-foreground transition-transform duration-300",
            open ? "rotate-180" : "",
          )}
        />
      </button>
      <div
        id={panelId}
        role="region"
        aria-labelledby={titleId}
        data-open={open}
        className="ps-expand"
        inert={!open}
      >
        <div className="ps-expand-inner">
          <div className="border-t border-border px-4 py-4">
            {updates.length === 0 ? (
              <p className="text-sm text-muted-foreground">No updates have been posted yet.</p>
            ) : (
              <ol className="relative space-y-5 pl-6 before:absolute before:top-1.5 before:bottom-1.5 before:left-[5px] before:w-px before:bg-border">
                {updates.map((update, index) => (
                  <li key={`${update.at}-${index}`} className="relative space-y-1">
                    <span
                      aria-hidden="true"
                      className={cn(
                        "absolute top-1.5 -left-6 size-[11px] rounded-full ring-4 ring-background",
                        dotClass[update.status],
                      )}
                    />
                    <p className="text-xs text-muted-foreground">
                      <span className="font-semibold text-foreground">
                        {incidentStatusLabel[update.status]}
                      </span>{" "}
                      · {formatDateTime(update.at)}
                    </p>
                    <p className="text-sm break-words">{update.message}</p>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}
