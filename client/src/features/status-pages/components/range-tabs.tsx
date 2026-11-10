import { cn } from "@/lib/utils";
import { historyRanges } from "../lib/uptime";
import type { HistoryRange } from "../types/status-page.types";

export function RangeTabs({
  value,
  onChange,
}: {
  value: HistoryRange;
  onChange: (range: HistoryRange) => void;
}) {
  const index = Math.max(
    0,
    historyRanges.findIndex((item) => item.value === value),
  );
  const onKeyDown = (event: React.KeyboardEvent) => {
    const delta = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (delta === 0) return;
    event.preventDefault();
    const next = historyRanges[(index + delta + historyRanges.length) % historyRanges.length];
    if (next) onChange(next.value);
  };
  return (
    <div
      role="tablist"
      aria-label="Uptime range"
      onKeyDown={onKeyDown}
      className="relative grid grid-cols-4 rounded-full border border-border bg-muted/50 p-1"
    >
      <span
        aria-hidden="true"
        style={{ transform: `translateX(${index * 100}%)` }}
        className="ps-tab-indicator absolute inset-y-1 left-1 w-[calc((100%-0.5rem)/4)] rounded-full bg-foreground shadow-sm"
      />
      {historyRanges.map((item) => (
        <button
          key={item.value}
          role="tab"
          type="button"
          tabIndex={value === item.value ? 0 : -1}
          aria-selected={value === item.value}
          aria-label={item.label}
          onClick={() => onChange(item.value)}
          className={cn(
            "relative z-10 min-h-10 rounded-full px-2 text-xs font-medium whitespace-nowrap transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:px-4",
            value === item.value
              ? "text-background"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {item.value}
        </button>
      ))}
    </div>
  );
}
