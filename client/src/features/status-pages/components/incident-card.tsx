import { useId } from "react";
import { ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { formatDateTime, formatDuration } from "../lib/status-presentation";
import type { PublicIncident } from "../types/status-page.types";
import { IncidentStatusBadge } from "./status-badges";

export function IncidentCard({ incident }: { incident: PublicIncident }) {
  const titleId = useId();
  const duration = formatDuration(incident.durationMs);
  return (
    <li>
      <Collapsible
        className="rounded-lg border border-border bg-background"
        aria-labelledby={titleId}
      >
        <CollapsibleTrigger className="group flex w-full items-start gap-3 p-4 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
          <ChevronDown
            className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=closed]:-rotate-90"
            aria-hidden="true"
          />
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
        </CollapsibleTrigger>
        <CollapsibleContent className="border-t border-border px-4 py-4">
          {incident.updates.length === 0 ? (
            <p className="text-sm text-muted-foreground">No updates have been posted yet.</p>
          ) : (
            <ol className="space-y-4 border-l border-border pl-4">
              {[...incident.updates]
                .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
                .map((update, index) => (
                  <li key={`${update.at}-${index}`} className="space-y-1">
                    <p className="text-xs text-muted-foreground">
                      <span className="font-semibold text-foreground">
                        {update.status.charAt(0).toUpperCase() + update.status.slice(1)}
                      </span>{" "}
                      · {formatDateTime(update.at)}
                    </p>
                    <p className="text-sm break-words">{update.message}</p>
                  </li>
                ))}
            </ol>
          )}
        </CollapsibleContent>
      </Collapsible>
    </li>
  );
}
