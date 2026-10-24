import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import axios from "axios";
import { Globe, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SpinnerCustom } from "@/components/common/loading-spinner";
import {
  formatInterval,
  formatStatusCodes,
  monitorFormSchema,
  monitorIntervals,
  parseStatusCodes,
  type MonitorFormValues,
} from "../schemas/monitor.schema";
import type { Monitor, MonitorInput } from "../api/monitors.api";
import { getApiErrorMessage, getApiFieldErrors } from "@/lib/api-error";
import { cn } from "@/lib/utils";

interface MonitorFormProps {
  mode: "create" | "edit";
  initialData?: Monitor | null;
  onSubmit: (data: MonitorInput) => Promise<void>;
  onCancel: () => void;
}

const intervalLabels: Record<number, string> = {
  60: "Every 1m (60s)",
  300: "Every 5m (Recommended)",
  600: "Every 10m",
  900: "Every 15m",
  1800: "Every 30m",
  3600: "Every 1 hour",
};

const timeoutPresets = [
  { label: "5s", value: 5000 },
  { label: "10s", value: 10000 },
  { label: "15s", value: 15000 },
  { label: "30s", value: 30000 },
];

const statusCodePresets = [
  { label: "200 OK", value: "200" },
  { label: "2xx Success", value: "200, 201, 204" },
  { label: "2xx + 3xx", value: "200, 201, 301, 302" },
];

export function MonitorForm({ mode, initialData, onSubmit, onCancel }: MonitorFormProps) {
  const [apiError, setApiError] = useState<string | null>(null);

  const defaultValues: MonitorFormValues = {
    name: initialData?.name ?? "",
    url: initialData?.url ?? "",
    method: "GET",
    intervalSeconds: initialData?.intervalSeconds ?? 300,
    timeoutMs: initialData?.timeoutMs ?? 10000,
    expectedStatusCodes: initialData?.expectedStatusCodes
      ? formatStatusCodes(initialData.expectedStatusCodes)
      : "200",
    active: initialData?.active ?? true,
  };

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<MonitorFormValues>({
    resolver: zodResolver(monitorFormSchema),
    defaultValues,
    mode: "onBlur",
  });

  const selectedInterval = watch("intervalSeconds");
  const currentTimeout = watch("timeoutMs");
  const currentStatusCodes = watch("expectedStatusCodes");
  const activeChecked = watch("active");

  const submitHandler = async (values: MonitorFormValues) => {
    setApiError(null);
    try {
      const payload: MonitorInput = {
        name: values.name.trim(),
        url: values.url.trim(),
        method: "GET",
        intervalSeconds: Number(values.intervalSeconds),
        timeoutMs: Number(values.timeoutMs),
        expectedStatusCodes: parseStatusCodes(values.expectedStatusCodes),
        active: Boolean(values.active),
      };
      await onSubmit(payload);
    } catch (err) {
      const message = getApiErrorMessage(err);
      setApiError(message);
      const fieldErrors = getApiFieldErrors(err);
      for (const [key, val] of Object.entries(fieldErrors)) {
        if (key in defaultValues) {
          setError(key as keyof MonitorFormValues, { message: val });
        }
      }
      if (axios.isAxiosError(err)) {
        const code = err.response?.data?.code;
        if (code === "INVALID_MONITOR_URL" || code === "SSRF_PROHIBITED_DESTINATION") {
          setError("url", {
            message: err.response?.data?.message || "Invalid or restricted endpoint URL.",
          });
        }
        if (code === "INVALID_MONITOR_CONFIG") {
          setError("intervalSeconds", {
            message: err.response?.data?.message || "Invalid monitor configuration.",
          });
        }
      }
    }
  };

  return (
    <form onSubmit={handleSubmit(submitHandler)} className="space-y-6" noValidate>
      {apiError && (
        <div
          role="alert"
          className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive"
        >
          {apiError}
        </div>
      )}

      <div className="space-y-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Basic information
        </h3>

        <div className="space-y-2">
          <Label htmlFor="monitor-name">
            Monitor name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="monitor-name"
            placeholder="e.g. Production API Health"
            autoFocus={mode === "create"}
            disabled={isSubmitting}
            aria-invalid={Boolean(errors.name)}
            aria-describedby={errors.name ? "monitor-name-error" : undefined}
            {...register("name")}
          />
          {errors.name && (
            <p id="monitor-name-error" className="text-xs text-destructive">
              {errors.name.message}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <Label htmlFor="monitor-url">
              Endpoint URL <span className="text-destructive">*</span>
            </Label>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="inline-flex text-muted-foreground hover:text-foreground focus:outline-none"
                  aria-label="URL guidance"
                >
                  <HelpCircle className="size-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs text-xs">
                Public HTTP or HTTPS endpoint to probe. Localhost and private IP addresses are
                blocked for security.
              </TooltipContent>
            </Tooltip>
          </div>
          <div className="relative">
            <Globe className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input
              id="monitor-url"
              type="url"
              placeholder="https://api.example.com/health"
              disabled={isSubmitting}
              className="pl-9"
              aria-invalid={Boolean(errors.url)}
              aria-describedby={errors.url ? "monitor-url-error" : "monitor-url-hint"}
              {...register("url")}
            />
          </div>
          {errors.url ? (
            <p id="monitor-url-error" className="text-xs text-destructive">
              {errors.url.message}
            </p>
          ) : (
            <p id="monitor-url-hint" className="text-[11px] text-muted-foreground">
              Must be a publicly accessible HTTP or HTTPS URL without embedded credentials.
            </p>
          )}
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Request configuration
        </h3>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Label htmlFor="monitor-method">HTTP method</Label>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex text-muted-foreground hover:text-foreground focus:outline-none"
                    aria-label="Method guidance"
                  >
                    <HelpCircle className="size-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs text-xs">
                  HTTP probe method. Currently FaultLine probes with GET. Additional methods and
                  custom headers will be available soon.
                </TooltipContent>
              </Tooltip>
            </div>
            <Select
              defaultValue="GET"
              disabled
              onValueChange={(val) => setValue("method", val as "GET")}
            >
              <SelectTrigger id="monitor-method" className="w-full">
                <SelectValue placeholder="GET" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="GET">GET</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              GET is currently the only supported method.
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Label htmlFor="monitor-interval">Check interval</Label>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex text-muted-foreground hover:text-foreground focus:outline-none"
                    aria-label="Interval guidance"
                  >
                    <HelpCircle className="size-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs text-xs">
                  Controls how frequently FaultLine executes probes. 5 minutes is recommended for
                  balanced coverage.
                </TooltipContent>
              </Tooltip>
            </div>
            <Select
              value={String(selectedInterval)}
              disabled={isSubmitting}
              onValueChange={(val) =>
                setValue("intervalSeconds", Number(val), {
                  shouldValidate: true,
                })
              }
            >
              <SelectTrigger id="monitor-interval" className="w-full">
                <SelectValue placeholder="Select interval" />
              </SelectTrigger>
              <SelectContent>
                {monitorIntervals.map((seconds) => (
                  <SelectItem key={seconds} value={String(seconds)}>
                    {intervalLabels[seconds] ?? `Every ${formatInterval(seconds)}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.intervalSeconds && (
              <p className="text-xs text-destructive">{errors.intervalSeconds.message}</p>
            )}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Label htmlFor="monitor-timeout">Timeout (ms)</Label>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex text-muted-foreground hover:text-foreground focus:outline-none"
                    aria-label="Timeout guidance"
                  >
                    <HelpCircle className="size-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs text-xs">
                  Maximum response wait time before marking probe timed out. Must be between 1,000ms
                  and 30,000ms.
                </TooltipContent>
              </Tooltip>
            </div>
            <Input
              id="monitor-timeout"
              type="number"
              min={1000}
              max={30000}
              step={500}
              placeholder="10000"
              disabled={isSubmitting}
              aria-invalid={Boolean(errors.timeoutMs)}
              aria-describedby={errors.timeoutMs ? "monitor-timeout-error" : undefined}
              {...register("timeoutMs", { valueAsNumber: true })}
            />
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-[11px] text-muted-foreground">Presets:</span>
              {timeoutPresets.map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => setValue("timeoutMs", preset.value, { shouldValidate: true })}
                  className={cn(
                    "rounded border px-1.5 py-0.5 text-[11px] font-mono transition-colors",
                    currentTimeout === preset.value
                      ? "border-foreground bg-foreground text-background"
                      : "border-border bg-background text-muted-foreground hover:border-foreground/40 hover:text-foreground",
                  )}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            {errors.timeoutMs && (
              <p id="monitor-timeout-error" className="text-xs text-destructive">
                {errors.timeoutMs.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Label htmlFor="monitor-status-codes">Expected status codes</Label>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex text-muted-foreground hover:text-foreground focus:outline-none"
                    aria-label="Status codes guidance"
                  >
                    <HelpCircle className="size-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs text-xs">
                  HTTP response codes considered healthy (100–599). Any response code not in this
                  list is reported as a failure.
                </TooltipContent>
              </Tooltip>
            </div>
            <Input
              id="monitor-status-codes"
              placeholder="200, 201"
              disabled={isSubmitting}
              aria-invalid={Boolean(errors.expectedStatusCodes)}
              aria-describedby={
                errors.expectedStatusCodes ? "monitor-status-codes-error" : undefined
              }
              {...register("expectedStatusCodes")}
            />
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-[11px] text-muted-foreground">Presets:</span>
              {statusCodePresets.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  disabled={isSubmitting}
                  onClick={() =>
                    setValue("expectedStatusCodes", preset.value, { shouldValidate: true })
                  }
                  className={cn(
                    "rounded border px-1.5 py-0.5 text-[11px] font-mono transition-colors",
                    currentStatusCodes === preset.value
                      ? "border-foreground bg-foreground text-background"
                      : "border-border bg-background text-muted-foreground hover:border-foreground/40 hover:text-foreground",
                  )}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            {errors.expectedStatusCodes && (
              <p id="monitor-status-codes-error" className="text-xs text-destructive">
                {errors.expectedStatusCodes.message}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 pt-2">
          <input
            id="monitor-active"
            type="checkbox"
            className="size-4 rounded border-border text-primary focus:ring-ring"
            disabled={isSubmitting}
            checked={activeChecked}
            onChange={(e) => setValue("active", e.target.checked)}
          />
          <Label
            htmlFor="monitor-active"
            className="cursor-pointer text-sm font-normal text-foreground"
          >
            Enable monitor immediately
          </Label>
        </div>
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
        <Button type="button" variant="outline" disabled={isSubmitting} onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? (
            <SpinnerCustom>
              {mode === "create" ? "Creating monitor…" : "Saving changes…"}
            </SpinnerCustom>
          ) : mode === "create" ? (
            "Create monitor"
          ) : (
            "Save changes"
          )}
        </Button>
      </div>
    </form>
  );
}
