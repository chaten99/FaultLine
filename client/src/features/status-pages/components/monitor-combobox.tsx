import { useState } from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useDebouncedValue, useMonitorOptions } from "../hooks/use-status-pages";
import type { MonitorOption, ServiceMonitor } from "../types/status-page.types";
import { MonitorStateBadge } from "./status-badges";

export function MonitorCombobox({
  selected,
  onChange,
  invalid,
}: {
  selected: ServiceMonitor[];
  onChange: (monitors: ServiceMonitor[]) => void;
  invalid?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const debounced = useDebouncedValue(search, 300);
  const options = useMonitorOptions(debounced, open);
  const selectedIds = new Set(selected.map((monitor) => monitor.id));

  const toggle = (option: MonitorOption) => {
    if (selectedIds.has(option.id)) {
      onChange(selected.filter((monitor) => monitor.id !== option.id));
    } else {
      onChange([
        ...selected,
        { id: option.id, name: option.name, host: option.host, state: option.state },
      ]);
    }
  };

  return (
    <div className="space-y-3">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-invalid={invalid}
            className="w-full justify-between font-normal"
          >
            <span className="truncate">
              {selected.length === 0
                ? "Select monitors"
                : `${selected.length} monitor${selected.length === 1 ? "" : "s"} selected`}
            </span>
            <ChevronsUpDown className="size-4 shrink-0 opacity-50" aria-hidden="true" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[min(28rem,calc(100vw-2rem))] space-y-3 p-3">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search monitors by name or host"
            aria-label="Search monitors"
            autoFocus
          />
          <div
            role="listbox"
            aria-multiselectable="true"
            aria-label="Monitors"
            className="max-h-64 space-y-1 overflow-y-auto"
          >
            {options.isLoading ? (
              <>
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </>
            ) : options.isError ? (
              <p role="alert" className="p-2 text-sm text-destructive">
                Couldn&apos;t load monitors.
              </p>
            ) : (options.data ?? []).length === 0 ? (
              <p className="p-2 text-sm text-muted-foreground">
                {debounced ? "No monitors match your search." : "You have no monitors yet."}
              </p>
            ) : (
              (options.data ?? []).map((option) => {
                const checked = selectedIds.has(option.id);
                return (
                  <button
                    key={option.id}
                    type="button"
                    role="option"
                    aria-selected={checked}
                    onClick={() => toggle(option)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                      checked && "bg-accent",
                    )}
                  >
                    <Check
                      className={cn("size-4 shrink-0", checked ? "opacity-100" : "opacity-0")}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{option.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {option.host ?? "Endpoint hidden"}
                      </span>
                    </span>
                    <MonitorStateBadge state={option.state} />
                  </button>
                );
              })
            )}
          </div>
        </PopoverContent>
      </Popover>

      {selected.length > 0 ? (
        <ul className="flex flex-wrap gap-2" aria-label="Selected monitors">
          {selected.map((monitor) => (
            <li
              key={monitor.id}
              className="flex max-w-full items-center gap-2 rounded-md border border-border bg-muted/40 py-1 pr-1 pl-2 text-sm"
            >
              <span className="min-w-0">
                <span className="block max-w-48 truncate font-medium">{monitor.name}</span>
                <span className="block max-w-48 truncate text-xs text-muted-foreground">
                  {monitor.host ?? "Endpoint hidden"}
                </span>
              </span>
              <MonitorStateBadge state={monitor.state} />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7"
                aria-label={`Remove ${monitor.name}`}
                onClick={() => onChange(selected.filter((item) => item.id !== monitor.id))}
              >
                <X className="size-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
