import { useState } from "react";
import { Download, FileText, RefreshCw } from "lucide-react";
import { SpinnerCustom } from "@/components/common/loading-spinner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { rangeOptions, type RangeState } from "../lib/analytics-range";
import type { AnalyticsQuery, RangeKey } from "../types/analytics.types";
import { DateRangePicker } from "./date-range-picker";
import { ExportDialog } from "./export-dialog";

export function AnalyticsToolbar({
  state,
  query,
  monitors,
  refreshing,
  onRangeChange,
  onCustomApply,
  onMonitorChange,
  onRefresh,
}: {
  state: RangeState;
  query: AnalyticsQuery;
  monitors: { id: string; name: string }[];
  refreshing: boolean;
  onRangeChange: (range: RangeKey) => void;
  onCustomApply: (from: Date, to: Date) => void;
  onMonitorChange: (monitorId: string | undefined) => void;
  onRefresh: () => void;
}) {
  const [exportOpen, setExportOpen] = useState(false);

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
      <Select value={state.range} onValueChange={(value) => onRangeChange(value as RangeKey)}>
        <SelectTrigger aria-label="Date range" className="w-full lg:w-48">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {rangeOptions.map((option) => (
            <SelectItem key={option.key} value={option.key}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {state.range === "custom" ? (
        <DateRangePicker from={state.from} to={state.to} active onApply={onCustomApply} />
      ) : null}
      <Select
        value={state.monitorId ?? "all"}
        onValueChange={(value) => onMonitorChange(value === "all" ? undefined : value)}
      >
        <SelectTrigger aria-label="Monitor" className="w-full lg:w-56">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All monitors</SelectItem>
          {monitors.map((monitor) => (
            <SelectItem key={monitor.id} value={monitor.id}>
              {monitor.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="flex gap-2 lg:ml-auto">
        <Button
          variant="outline"
          onClick={onRefresh}
          disabled={refreshing}
          className="flex-1 lg:flex-none"
        >
          {refreshing ? (
            <SpinnerCustom>Refreshing</SpinnerCustom>
          ) : (
            <>
              <RefreshCw className="size-4" /> Refresh
            </>
          )}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button className="flex-1 lg:flex-none">
              <Download className="size-4" /> Export
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Download report</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => setExportOpen(true)}>
              <FileText className="size-4" /> Export CSV...
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <ExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        query={query}
        monitors={monitors}
      />
    </div>
  );
}
