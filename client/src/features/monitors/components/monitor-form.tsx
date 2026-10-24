import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { HelpCircle } from "lucide-react";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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

interface MonitorFormProps {
  mode: "create" | "edit";
  initialData?: Monitor | null;
  onSubmit: (data: MonitorInput) => Promise<void>;
  onCancel: () => void;
}

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
  });

  const selectedInterval = watch("intervalSeconds");
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
          <Label htmlFor="monitor-url">
            Endpoint URL <span className="text-destructive">*</span>
          </Label>
          <Input
            id="monitor-url"
            type="url"
            placeholder="https://api.example.com/health"
            disabled={isSubmitting}
            aria-invalid={Boolean(errors.url)}
            aria-describedby={errors.url ? "monitor-url-error" : undefined}
            {...register("url")}
          />
          {errors.url && (
            <p id="monitor-url-error" className="text-xs text-destructive">
              {errors.url.message}
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
            <Label htmlFor="monitor-method">HTTP method</Label>
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
            <p className="text-xs text-muted-foreground">
              GET is currently the only supported method.
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Label htmlFor="monitor-interval">Check interval</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex text-muted-foreground hover:text-foreground focus:outline-none"
                    aria-label="Interval guidance"
                  >
                    <HelpCircle className="size-3.5" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-72 text-xs leading-relaxed">
                  <p className="font-semibold text-foreground">Monitoring interval</p>
                  <p className="mt-1 text-muted-foreground">
                    Controls how frequently FaultLine probes this endpoint. Shorter intervals detect
                    outages faster, while longer intervals reduce query volume on your service.
                  </p>
                </PopoverContent>
              </Popover>
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
                    Every {formatInterval(seconds)}
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
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex text-muted-foreground hover:text-foreground focus:outline-none"
                    aria-label="Timeout guidance"
                  >
                    <HelpCircle className="size-3.5" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-72 text-xs leading-relaxed">
                  <p className="font-semibold text-foreground">Request timeout</p>
                  <p className="mt-1 text-muted-foreground">
                    Maximum time FaultLine waits for a response before considering the request timed
                    out. Must be between 1,000ms and 30,000ms.
                  </p>
                </PopoverContent>
              </Popover>
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
            {errors.timeoutMs && (
              <p id="monitor-timeout-error" className="text-xs text-destructive">
                {errors.timeoutMs.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Label htmlFor="monitor-status-codes">Expected status codes</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex text-muted-foreground hover:text-foreground focus:outline-none"
                    aria-label="Status codes guidance"
                  >
                    <HelpCircle className="size-3.5" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-72 text-xs leading-relaxed">
                  <p className="font-semibold text-foreground">Expected HTTP status codes</p>
                  <p className="mt-1 text-muted-foreground">
                    Comma-separated list of HTTP status codes (100–599) that indicate your service
                    is functioning properly (e.g. 200, 201, 204).
                  </p>
                </PopoverContent>
              </Popover>
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
