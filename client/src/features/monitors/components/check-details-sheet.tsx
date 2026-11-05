import { useState } from "react";
import { Check, ChevronDown, Copy, Info, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { formatRelativeTime } from "../lib/monitor-status";
import { presentCheck } from "../lib/check-presentation";
import type { Monitor, MonitorCheck } from "../api/monitors.api";
import { cn } from "@/lib/utils";

interface CheckDetailsSheetProps {
  check: MonitorCheck | null;
  monitor?: Monitor | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CheckDetailsSheet({ check, monitor, open, onOpenChange }: CheckDetailsSheetProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);

  if (!check) return null;

  const presentation = presentCheck(check, monitor);

  const copyValue = async (value: string, key: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      toast.success(`${label} copied to clipboard`);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      toast.error(`Failed to copy ${label}`);
    }
  };

  const formatExactDate = (isoString?: string) => {
    if (!isoString) return "—";
    try {
      return new Date(isoString).toLocaleString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
      });
    } catch {
      return "—";
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl">
        <SheetHeader className="pb-4 border-b border-border">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant={presentation.badgeVariant}
              className={cn(
                "gap-1.5 px-2.5 py-1 text-xs font-medium",
                presentation.resultLabel === "Up" && "border-foreground/30 text-foreground",
                presentation.resultLabel === "Down" &&
                  "border-destructive/50 text-destructive bg-destructive/10",
                presentation.resultLabel === "Timeout" &&
                  "border-destructive/50 text-destructive bg-destructive/10",
                presentation.resultLabel === "Error" &&
                  "border-destructive/50 text-destructive bg-destructive/10",
              )}
            >
              <span
                className={cn(
                  "size-2 rounded-full",
                  presentation.resultLabel === "Up" && "bg-foreground",
                  presentation.resultLabel === "Down" && "bg-destructive",
                  presentation.resultLabel === "Timeout" && "bg-destructive",
                  presentation.resultLabel === "Error" && "bg-destructive",
                  presentation.resultLabel === "Checking" && "bg-foreground animate-ping",
                  presentation.resultLabel === "Queued" && "bg-muted-foreground",
                )}
              />
              {presentation.resultLabel}
            </Badge>
            <span className="text-xs text-muted-foreground">
              Executed {formatRelativeTime(check.startedAt)}
            </span>
          </div>

          <SheetTitle className="text-xl font-semibold tracking-tight text-foreground mt-2">
            Check details
          </SheetTitle>
          <SheetDescription className="font-mono text-xs">
            {formatExactDate(check.startedAt)}
          </SheetDescription>
        </SheetHeader>

        <div className="py-6 space-y-6">
          {/* Overview Section */}
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg border border-border bg-card p-3 shadow-xs">
              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                Result
              </span>
              <p className="mt-1 text-base font-semibold text-foreground">
                {presentation.resultLabel}
              </p>
            </div>

            <div className="rounded-lg border border-border bg-card p-3 shadow-xs">
              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                HTTP Code
              </span>
              <p className="mt-1 text-base font-mono font-semibold text-foreground">
                {presentation.httpResponseDisplay}
              </p>
            </div>

            <div className="rounded-lg border border-border bg-card p-3 shadow-xs">
              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                Duration
              </span>
              <p className="mt-1 text-base font-mono font-semibold text-foreground">
                {presentation.durationDisplay}
              </p>
            </div>

            <div className="rounded-lg border border-border bg-card p-3 shadow-xs">
              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                Category
              </span>
              <p
                className="mt-1 truncate text-xs font-mono font-medium text-foreground"
                title={check.failureCategory || "Normal"}
              >
                {check.failureCategory || "Success"}
              </p>
            </div>
          </section>

          {/* What happened Section */}
          <section className="space-y-2 rounded-lg border border-border bg-card p-4 shadow-xs">
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Info className="size-3.5" />
              What happened
            </div>
            <p className="text-sm font-medium leading-relaxed text-foreground">
              {presentation.detailedExplanation}
            </p>
            {presentation.guidance && (
              <div className="mt-3 rounded-md border border-border/80 bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
                <span className="font-semibold text-foreground block mb-0.5">
                  Recommended action:
                </span>
                {presentation.guidance}
              </div>
            )}
          </section>

          {/* Expected vs Actual Section */}
          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Expected vs actual
            </h3>
            <div className="rounded-lg border border-border bg-card divide-y divide-border text-xs shadow-xs">
              <div className="flex items-center justify-between p-3">
                <span className="text-muted-foreground">HTTP status code</span>
                <div className="flex items-center gap-3 font-mono">
                  <span className="text-muted-foreground">
                    Expected: [{presentation.expectedVsActual.expectedStatusCodes}]
                  </span>
                  <span className="font-semibold text-foreground">
                    Actual: {presentation.expectedVsActual.actualStatusCode}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between p-3">
                <span className="text-muted-foreground">Response duration</span>
                <div className="flex items-center gap-3 font-mono">
                  <span className="text-muted-foreground">
                    Timeout: {presentation.expectedVsActual.configuredTimeout}
                  </span>
                  <span className="font-semibold text-foreground">
                    Actual: {presentation.expectedVsActual.actualDuration}
                  </span>
                </div>
              </div>
            </div>
          </section>

          {/* Execution Information Section */}
          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Execution information
            </h3>
            <div className="rounded-lg border border-border bg-card divide-y divide-border text-xs shadow-xs">
              <div className="flex items-center justify-between p-3">
                <span className="text-muted-foreground">Check ID</span>
                <div className="flex items-center gap-1.5 font-mono">
                  <span className="truncate max-w-[200px] text-foreground">{check._id}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-6 text-muted-foreground hover:text-foreground"
                    onClick={() => copyValue(check._id, "checkId", "Check ID")}
                  >
                    {copiedKey === "checkId" ? (
                      <Check className="size-3 text-emerald-500" />
                    ) : (
                      <Copy className="size-3" />
                    )}
                  </Button>
                </div>
              </div>

              <div className="flex items-center justify-between p-3">
                <span className="text-muted-foreground">Run ID</span>
                <div className="flex items-center gap-1.5 font-mono">
                  <span className="truncate max-w-[200px] text-foreground">{check.runId}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-6 text-muted-foreground hover:text-foreground"
                    onClick={() => copyValue(check.runId, "runId", "Run ID")}
                  >
                    {copiedKey === "runId" ? (
                      <Check className="size-3 text-emerald-500" />
                    ) : (
                      <Copy className="size-3" />
                    )}
                  </Button>
                </div>
              </div>

              {monitor && (
                <div className="flex items-center justify-between p-3">
                  <span className="text-muted-foreground">Monitor ID</span>
                  <div className="flex items-center gap-1.5 font-mono">
                    <span className="truncate max-w-[200px] text-foreground">{monitor._id}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-6 text-muted-foreground hover:text-foreground"
                      onClick={() => copyValue(monitor._id, "monitorId", "Monitor ID")}
                    >
                      {copiedKey === "monitorId" ? (
                        <Check className="size-3 text-emerald-500" />
                      ) : (
                        <Copy className="size-3" />
                      )}
                    </Button>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between p-3">
                <span className="text-muted-foreground">Started at</span>
                <span className="font-mono text-foreground">
                  {formatExactDate(check.startedAt)}
                </span>
              </div>

              {check.completedAt && (
                <div className="flex items-center justify-between p-3">
                  <span className="text-muted-foreground">Completed at</span>
                  <span className="font-mono text-foreground">
                    {formatExactDate(check.completedAt)}
                  </span>
                </div>
              )}
            </div>
          </section>

          {/* Technical Diagnostics Section (Collapsible) */}
          <Collapsible
            open={diagnosticsOpen}
            onOpenChange={setDiagnosticsOpen}
            className="rounded-lg border border-border bg-card/60 p-4 shadow-xs"
          >
            <CollapsibleTrigger className="flex w-full items-center justify-between text-left focus:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-sm">
              <div className="flex items-center gap-2">
                <ShieldAlert className="size-4 text-muted-foreground" />
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Technical diagnostics
                </span>
              </div>
              <ChevronDown
                className={cn(
                  "size-4 shrink-0 text-muted-foreground transition-transform duration-200",
                  diagnosticsOpen && "rotate-180",
                )}
              />
            </CollapsibleTrigger>

            <CollapsibleContent className="pt-3 space-y-2 text-xs">
              <div className="rounded-md bg-muted/60 p-3 space-y-2 font-mono">
                <div>
                  <span className="text-muted-foreground">Classification: </span>
                  <span className="text-foreground">{presentation.diagnostics.classification}</span>
                </div>
                {presentation.diagnostics.errorCode && (
                  <div>
                    <span className="text-muted-foreground">Error Code: </span>
                    <span className="text-destructive font-semibold">
                      {presentation.diagnostics.errorCode}
                    </span>
                  </div>
                )}
                {typeof presentation.diagnostics.statusCode === "number" && (
                  <div>
                    <span className="text-muted-foreground">HTTP Status: </span>
                    <span className="text-foreground">{presentation.diagnostics.statusCode}</span>
                  </div>
                )}
                {presentation.diagnostics.safeErrorSummary && (
                  <div className="border-t border-border/40 pt-2 text-[11px] text-destructive break-words">
                    <span className="text-muted-foreground block mb-0.5">Error Summary:</span>
                    {presentation.diagnostics.safeErrorSummary}
                  </div>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      </SheetContent>
    </Sheet>
  );
}
