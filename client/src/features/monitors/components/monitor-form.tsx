import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import axios from "axios";
import { ChevronDown, Globe, HelpCircle } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { SpinnerCustom } from "@/components/common/loading-spinner";
import {
  formatStatusCodes,
  monitorFormSchema,
  monitorIntervals,
  parseStatusCodes,
  type MonitorFormValues,
} from "../schemas/monitor.schema";
import type { Monitor, MonitorInput } from "../api/monitors.api";
import { getApiErrorMessage, getApiFieldErrors } from "@/lib/api-error";
import { cn } from "@/lib/utils";

import { AdvancedHttpFields, emptyHttpConfig, validateHttpForm } from "./advanced-http-fields";
import type { HttpConfig, DnsConfig, MonitorType } from "../types-advanced";

interface MonitorFormProps {
  mode: "create" | "edit";
  initialData?: Monitor | null;
  onSubmit: (data: MonitorInput) => Promise<void>;
  onCancel: () => void;
}

const intervalDescriptions: Record<number, string> = {
  60: "Every 1 minute",
  300: "Every 5 minutes (Recommended)",
  600: "Every 10 minutes",
  900: "Every 15 minutes",
  1800: "Every 30 minutes",
  3600: "Every 1 hour",
};

const statusCodePresets = [
  { label: "200 OK", value: "200" },
  {
    label: "All 2xx responses",
    value: Array.from({ length: 100 }, (_, i) => String(200 + i)).join(", "),
  },
  { label: "201 Created", value: "201" },
  { label: "204 No Content", value: "204" },
];

export function MonitorForm({ mode, initialData, onSubmit, onCancel }: MonitorFormProps) {
  const [apiError, setApiError] = useState<string | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(mode === "edit");

  const [httpConfig, setHttpConfig] = useState<HttpConfig>(
    initialData?.httpConfig ?? emptyHttpConfig,
  );
  const [dnsConfig, setDnsConfig] = useState<DnsConfig>(
    initialData?.dnsConfig ?? { recordType: "A", expectedValues: [], comparison: "includes" },
  );
  const [warningDays, setWarningDays] = useState(
    initialData?.tlsConfig?.warningDays ?? initialData?.domainConfig?.warningDays ?? 30,
  );

  const defaultValues: MonitorFormValues = {
    name: initialData?.name ?? "",
    url: initialData?.url ?? "",
    method: initialData?.method ?? "GET",
    type: initialData?.type ?? "http",
    intervalSeconds: initialData?.intervalSeconds ?? 300,
    timeoutMs: initialData?.timeoutMs ?? 10000,
    expectedStatusCodes: initialData?.expectedStatusCodes
      ? formatStatusCodes(initialData.expectedStatusCodes)
      : "200",
    failureThreshold: initialData?.failureThreshold ?? 3,
    recoveryThreshold: initialData?.recoveryThreshold ?? 2,
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

  const monitorType = watch("type") ?? "http";
  const method = watch("method");
  const selectedInterval = watch("intervalSeconds");
  const currentTimeoutMs = watch("timeoutMs");
  const currentStatusCodes = watch("expectedStatusCodes");
  const activeChecked = watch("active");

  const timeoutSeconds = Math.round((currentTimeoutMs || 10000) / 1000);

  const submitHandler = async (values: MonitorFormValues) => {
    setApiError(null);
    try {
      const payload: MonitorInput = {
        name: values.name.trim(),
        url: values.url.trim(),
        method: values.method,
        type: values.type ?? "http",
        intervalSeconds: Number(values.intervalSeconds),
        timeoutMs: Number(values.timeoutMs),
        expectedStatusCodes: parseStatusCodes(values.expectedStatusCodes),
        failureThreshold: Number(values.failureThreshold),
        recoveryThreshold: Number(values.recoveryThreshold),
        active: Boolean(values.active),
      };
      if (monitorType === "http") {
        const message = validateHttpForm(httpConfig, values.method);
        if (message) {
          setApiError(message);
          return;
        }
        payload.httpConfig = httpConfig;
      }
      if (monitorType === "tls") payload.tlsConfig = { warningDays };
      if (monitorType === "domain") payload.domainConfig = { warningDays };
      if (monitorType === "dns")
        payload.dnsConfig = {
          ...dnsConfig,
          expectedValues: dnsConfig.expectedValues.filter((v) => v.trim().length > 0),
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

      <section className="space-y-2">
        <Label htmlFor="monitor-type">Monitoring type</Label>
        <Select
          value={monitorType}
          disabled={mode === "edit" || isSubmitting}
          onValueChange={(v) => setValue("type", v as MonitorType)}
        >
          <SelectTrigger id="monitor-type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="http">HTTP / API</SelectItem>
            <SelectItem value="tls">SSL / TLS certificate</SelectItem>
            <SelectItem value="dns">DNS records</SelectItem>
            <SelectItem value="domain">Domain registration expiry</SelectItem>
          </SelectContent>
        </Select>
      </section>
      <section className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="monitor-name">
            Monitor name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="monitor-name"
            placeholder="e.g. Production API"
            autoFocus={mode === "create"}
            disabled={isSubmitting}
            aria-invalid={Boolean(errors.name)}
            aria-describedby={errors.name ? "monitor-name-error" : "monitor-name-helper"}
            {...register("name")}
          />
          {errors.name ? (
            <p id="monitor-name-error" className="text-xs text-destructive">
              {errors.name.message}
            </p>
          ) : (
            <p id="monitor-name-helper" className="text-xs text-muted-foreground">
              Choose a name that helps you recognize this service.
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <Label htmlFor="monitor-url">
              {monitorType === "http"
                ? "API endpoint"
                : monitorType === "tls"
                  ? "HTTPS endpoint"
                  : "Domain / hostname"}{" "}
              <span className="text-destructive">*</span>
            </Label>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="inline-flex text-muted-foreground hover:text-foreground focus:outline-none"
                  aria-label="URL reachability guidance"
                >
                  <HelpCircle className="size-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs text-xs">
                The endpoint must be reachable from the monitoring worker. Localhost and private IP
                addresses are blocked for security.
              </TooltipContent>
            </Tooltip>
          </div>
          <div className="relative">
            <Globe className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="monitor-url"
              type="text"
              placeholder={
                ["http", "tls"].includes(monitorType)
                  ? "https://api.example.com/health"
                  : "example.com"
              }
              disabled={isSubmitting}
              className="pl-9"
              aria-invalid={Boolean(errors.url)}
              aria-describedby={errors.url ? "monitor-url-error" : "monitor-url-helper"}
              {...register("url")}
            />
          </div>
          {errors.url ? (
            <p id="monitor-url-error" className="text-xs text-destructive">
              {errors.url.message}
            </p>
          ) : (
            <p id="monitor-url-helper" className="text-xs text-muted-foreground">
              Enter the public URL that FaultLine should check.
            </p>
          )}
        </div>
      </section>

      {monitorType === "dns" && (
        <section className="space-y-3">
          <Label htmlFor="dns-record-type">DNS record type</Label>
          <Select
            value={dnsConfig.recordType}
            onValueChange={(v) =>
              setDnsConfig({ ...dnsConfig, recordType: v as DnsConfig["recordType"] })
            }
          >
            <SelectTrigger id="dns-record-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["A", "AAAA", "CNAME", "MX", "TXT", "NS"].map((v) => (
                <SelectItem key={v} value={v}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Label htmlFor="dns-expected">Expected records (one per line, optional)</Label>
          <textarea
            id="dns-expected"
            className="w-full rounded border p-3 bg-background font-mono text-sm"
            value={dnsConfig.expectedValues.join("\n")}
            onChange={(e) =>
              setDnsConfig({ ...dnsConfig, expectedValues: e.target.value.split("\n") })
            }
          />
          <Select
            value={dnsConfig.comparison}
            onValueChange={(v) =>
              setDnsConfig({ ...dnsConfig, comparison: v as DnsConfig["comparison"] })
            }
          >
            <SelectTrigger aria-label="DNS comparison">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="includes">Contains all expected records</SelectItem>
              <SelectItem value="exact">Matches expected records exactly</SelectItem>
            </SelectContent>
          </Select>
        </section>
      )}
      {["tls", "domain"].includes(monitorType) && (
        <section className="space-y-2">
          <Label htmlFor="warning-days">Warn when expiry is within (days)</Label>
          <Input
            id="warning-days"
            type="number"
            min={1}
            max={365}
            value={warningDays}
            onChange={(e) => setWarningDays(Number(e.target.value))}
          />
          {monitorType === "domain" && (
            <p className="text-xs text-muted-foreground">
              Registry RDAP data is cached for six hours. Unsupported or unavailable expiry dates
              remain unknown.
            </p>
          )}
        </section>
      )}
      <section className="space-y-1.5">
        <Label htmlFor="monitor-interval">How often should we check?</Label>
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
            <SelectValue placeholder="Select check frequency" />
          </SelectTrigger>
          <SelectContent>
            {monitorIntervals.map((seconds) => (
              <SelectItem key={seconds} value={String(seconds)}>
                {intervalDescriptions[seconds] ?? `Every ${seconds} seconds`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          More frequent checks help detect problems sooner but generate more requests to your
          endpoint.
        </p>
        {errors.intervalSeconds && (
          <p className="text-xs text-destructive">{errors.intervalSeconds.message}</p>
        )}
      </section>

      <Collapsible
        open={advancedOpen}
        onOpenChange={setAdvancedOpen}
        className="rounded-lg border border-border bg-card/40 p-4 transition-all"
      >
        <CollapsibleTrigger className="flex w-full items-center justify-between text-left focus:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-sm">
          <div className="space-y-0.5">
            <span className="text-sm font-medium text-foreground">Advanced settings</span>
            <p className="text-xs text-muted-foreground">
              Request timeout, expected status codes, and incident thresholds.
            </p>
          </div>
          <ChevronDown
            className={cn(
              "size-4 shrink-0 text-muted-foreground transition-transform duration-200",
              advancedOpen && "rotate-180",
            )}
          />
        </CollapsibleTrigger>

        <CollapsibleContent className="pt-4 space-y-5">
          <div className="space-y-2">
            <Label htmlFor="check-timeout">Maximum check time (seconds)</Label>
            <Input
              id="check-timeout"
              type="number"
              min={1}
              max={30}
              value={timeoutSeconds}
              onChange={(e) =>
                setValue(
                  "timeoutMs",
                  Math.max(1, Math.min(30, Number(e.target.value) || 1)) * 1000,
                  { shouldValidate: true },
                )
              }
            />
          </div>
          {monitorType === "http" && (
            <div className="space-y-5">
              <div className="space-y-1.5 border-t border-border/60 pt-3">
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Request method
                </Label>
                <Select
                  value={method}
                  onValueChange={(v) => setValue("method", v as MonitorFormValues["method"])}
                >
                  <SelectTrigger aria-label="Request method">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["GET", "POST", "PUT", "PATCH", "DELETE"].map((v) => (
                      <SelectItem key={v} value={v}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <AdvancedHttpFields value={httpConfig} onChange={setHttpConfig} method={method} />
              </div>

              <div className="space-y-2 border-t border-border/60 pt-3">
                <Label htmlFor="monitor-status-codes">What counts as a successful response?</Label>
                <p className="text-xs text-muted-foreground">
                  FaultLine marks a check as successful when the endpoint returns one of these HTTP
                  status codes.
                </p>
                <Input
                  id="monitor-status-codes"
                  placeholder="e.g. 200, 201, 204"
                  disabled={isSubmitting}
                  className="font-mono text-sm"
                  aria-invalid={Boolean(errors.expectedStatusCodes)}
                  {...register("expectedStatusCodes")}
                />
                <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                  <span className="text-xs text-muted-foreground mr-1">Presets:</span>
                  {statusCodePresets.map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      disabled={isSubmitting}
                      onClick={() =>
                        setValue("expectedStatusCodes", preset.value, { shouldValidate: true })
                      }
                      className={cn(
                        "rounded-md border px-2 py-0.5 text-xs transition-colors",
                        currentStatusCodes === preset.value
                          ? "border-foreground bg-foreground text-background font-medium"
                          : "border-border bg-background text-muted-foreground hover:border-foreground/40 hover:text-foreground",
                      )}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
                {errors.expectedStatusCodes && (
                  <p className="text-xs text-destructive">{errors.expectedStatusCodes.message}</p>
                )}
              </div>
            </div>
          )}

          <div className="space-y-3 border-t border-border/60 pt-3">
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Incident behavior
              </h4>
              <p className="text-xs text-muted-foreground mt-0.5">
                Configure when FaultLine opens and resolves incidents.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="monitor-failure-threshold">Open an incident after</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="monitor-failure-threshold"
                    type="number"
                    min={1}
                    max={10}
                    disabled={isSubmitting}
                    className="w-20 font-mono"
                    aria-invalid={Boolean(errors.failureThreshold)}
                    {...register("failureThreshold", { valueAsNumber: true })}
                  />
                  <span className="text-xs text-muted-foreground">failed checks</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  FaultLine opens an incident when this many consecutive checks fail.
                </p>
                {errors.failureThreshold && (
                  <p className="text-xs text-destructive">{errors.failureThreshold.message}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="monitor-recovery-threshold">Resolve an incident after</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="monitor-recovery-threshold"
                    type="number"
                    min={1}
                    max={10}
                    disabled={isSubmitting}
                    className="w-20 font-mono"
                    aria-invalid={Boolean(errors.recoveryThreshold)}
                    {...register("recoveryThreshold", { valueAsNumber: true })}
                  />
                  <span className="text-xs text-muted-foreground">successful checks</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  FaultLine automatically resolves an incident after this many consecutive checks
                  succeed.
                </p>
                {errors.recoveryThreshold && (
                  <p className="text-xs text-destructive">{errors.recoveryThreshold.message}</p>
                )}
              </div>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      <section className="flex items-start justify-between gap-4 rounded-lg border border-border bg-card/30 p-4">
        <div className="space-y-0.5">
          <Label
            htmlFor="monitor-active"
            className="cursor-pointer text-sm font-medium text-foreground"
          >
            Start monitoring immediately
          </Label>
          <p className="text-xs text-muted-foreground">
            When enabled, FaultLine will schedule checks as soon as the monitor is created.
          </p>
        </div>
        <Switch
          id="monitor-active"
          disabled={isSubmitting}
          checked={activeChecked}
          onCheckedChange={(checked) => setValue("active", checked)}
        />
      </section>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3 border-t border-border pt-4">
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
