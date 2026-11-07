import { useState } from "react";
import { toast } from "sonner";
import { SpinnerCustom } from "@/components/common/loading-spinner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getApiErrorMessage } from "@/lib/api-error";
import { useExportReport } from "../hooks/use-analytics";
import { browserTimeZone, formatRangeLabel } from "../lib/analytics-range";
import { buildExportFilename } from "../lib/analytics-series";
import { exportFormSchema } from "../schemas/analytics.schema";
import type { AnalyticsQuery, ExportType } from "../types/analytics.types";

const reportOptions: { value: ExportType; label: string; description: string }[] = [
  {
    value: "overview",
    label: "Analytics overview",
    description: "Summary metrics for the selected range.",
  },
  {
    value: "monitors",
    label: "Per-monitor performance",
    description: "Availability, success rate, coverage, downtime and latency per monitor.",
  },
  {
    value: "incidents",
    label: "Incident report",
    description: "Every incident that started in the range.",
  },
];

const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export function ExportDialog({
  open,
  onOpenChange,
  query,
  monitors,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  query: AnalyticsQuery;
  monitors: { id: string; name: string }[];
}) {
  const [type, setType] = useState<ExportType>("overview");
  const [override, setOverride] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const exporter = useExportReport();

  const selectedMonitorValue = override ?? query.monitorId ?? "all";
  const effectiveMonitor = selectedMonitorValue === "all" ? undefined : selectedMonitorValue;

  const submit = async () => {
    const parsed = exportFormSchema.safeParse({ type, monitorId: selectedMonitorValue });
    if (!parsed.success) {
      setFormError("Choose a valid report and monitor.");
      return;
    }
    setFormError(null);
    const exportQuery: AnalyticsQuery = { from: query.from, to: query.to };
    if (effectiveMonitor) exportQuery.monitorId = effectiveMonitor;
    try {
      const result = await exporter.mutateAsync({ type, query: exportQuery });
      const filename = buildExportFilename(type, query.from, query.to, result.disposition);
      downloadBlob(result.blob, filename);
      toast.success(`Exported ${filename}.`);
      onOpenChange(false);
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !exporter.isPending && onOpenChange(next)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Export CSV report</DialogTitle>
          <DialogDescription>
            Download a CSV generated from your recorded monitoring and incident data.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="export-type">Report</Label>
            <Select value={type} onValueChange={(value) => setType(value as ExportType)}>
              <SelectTrigger id="export-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {reportOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {reportOptions.find((option) => option.value === type)?.description}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="export-monitor">Monitor</Label>
            <Select value={selectedMonitorValue} onValueChange={setOverride}>
              <SelectTrigger id="export-monitor">
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
          </div>
          <div className="space-y-1 rounded-md border border-border bg-muted/40 p-3 text-sm">
            <p className="text-xs font-medium text-muted-foreground">Date range</p>
            <p className="break-words">{formatRangeLabel(query.from, query.to)}</p>
            <p className="text-xs text-muted-foreground">
              Change the range on the Analytics page before exporting. Times in the CSV are UTC; the
              range shown uses {browserTimeZone()}.
            </p>
          </div>
          {formError ? (
            <p role="alert" className="text-sm text-destructive">
              {formError}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={exporter.isPending}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={exporter.isPending}>
            {exporter.isPending ? <SpinnerCustom>Generating</SpinnerCustom> : "Export CSV"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
