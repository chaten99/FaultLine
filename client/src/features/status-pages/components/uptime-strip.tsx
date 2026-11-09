import { cellLabel, hasAnyData, legendStates } from "../lib/uptime";
import { formatPercent, timelineStatePresentation } from "../lib/status-presentation";
import type { Availability, TimelineCell } from "../types/status-page.types";

export function UptimeStrip({
  name,
  rangeLabel,
  availability,
  timeline,
}: {
  name: string;
  rangeLabel: string;
  availability: Availability;
  timeline: TimelineCell[];
}) {
  const percent = formatPercent(availability.percent, availability.state);
  const outages = timeline.filter((cell) => cell.state === "down").length;
  const summary = `${name}, last ${rangeLabel}: ${
    availability.state === "ok" ? `${percent} availability` : "not enough data"
  }${outages > 0 ? `, ${outages} outage period${outages === 1 ? "" : "s"}` : ""}.`;

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <h4 className="min-w-0 text-sm font-medium break-words">{name}</h4>
        <span className="shrink-0 text-sm text-muted-foreground">{percent}</span>
      </div>
      {timeline.length === 0 || !hasAnyData(timeline) ? (
        <p className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
          Not enough data for this period yet.
        </p>
      ) : (
        <ul role="img" aria-label={summary} className="flex h-8 w-full items-stretch gap-px">
          {timeline.map((cell) => {
            const presentation = timelineStatePresentation[cell.state];
            return (
              <li
                key={cell.start}
                title={cellLabel(cell)}
                className={`relative min-w-px flex-1 rounded-[1px] ${presentation.className}`}
              >
                {presentation.pattern && timeline.length <= 48 ? (
                  <span
                    aria-hidden="true"
                    className="absolute inset-0 grid place-items-center text-[10px] leading-none font-bold text-white"
                  >
                    {presentation.pattern}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function UptimeLegend() {
  return (
    <ul
      className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground"
      aria-label="Legend"
    >
      {legendStates.map((state) => {
        const presentation = timelineStatePresentation[state];
        return (
          <li key={state} className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className={`inline-block size-3 rounded-[2px] ${presentation.className}`}
            />
            {presentation.label}
            {presentation.pattern ? (
              <span aria-hidden="true" className="font-mono">
                ({presentation.pattern})
              </span>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
