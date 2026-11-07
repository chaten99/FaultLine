import { useState } from "react";
import type { DateRange } from "react-day-picker";
import { CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  browserTimeZone,
  customRangeFromDays,
  formatRangeLabel,
  validateRange,
} from "../lib/analytics-range";

const wideScreen = () =>
  typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(min-width: 640px)").matches
    : true;

export function DateRangePicker({
  from,
  to,
  active,
  onApply,
}: {
  from?: string;
  to?: string;
  active: boolean;
  onApply: (from: Date, to: Date) => void;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<DateRange | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [months] = useState(() => (wideScreen() ? 2 : 1));

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      setError(null);
      setSelected(from && to ? { from: new Date(from), to: new Date(to) } : undefined);
    }
  };

  const apply = () => {
    if (!selected?.from) {
      setError("Choose a start date and an end date.");
      return;
    }
    const now = Date.now();
    const { from: start, to: end } = customRangeFromDays(
      selected.from,
      selected.to ?? selected.from,
      now,
    );
    const result = validateRange(start, end, now);
    if (!result.valid) {
      setError(result.message);
      return;
    }
    setError(null);
    onApply(start, end);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="w-full justify-start gap-2 sm:w-auto"
          aria-label="Choose custom date range"
        >
          <CalendarDays className="size-4" />
          <span className="truncate">
            {active && from && to ? formatRangeLabel(from, to) : "Pick dates"}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[min(calc(100vw-2rem),42rem)] space-y-3 overflow-x-auto"
      >
        <Calendar
          mode="range"
          selected={selected}
          onSelect={(range) => {
            setSelected(range);
            setError(null);
          }}
          numberOfMonths={months}
          disabled={{ after: new Date() }}
          defaultMonth={selected?.from}
        />
        <p className="text-xs text-muted-foreground">
          Days are in your browser timezone ({browserTimeZone()}). The range can be up to 90 days
          and cannot end in the future.
        </p>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={apply}>
            Apply range
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
