import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Calendar } from "@/components/ui/calendar";
import { SpinnerCustom } from "@/components/common/loading-spinner";
import { apiClient } from "@/lib/api-client";
import { getApiErrorMessage } from "@/lib/api-error";
import { useCan } from "@/features/workspaces/hooks/use-workspaces";
import { listMonitors } from "@/features/monitors/api/monitors.api";
export type MaintenanceInput = {
  title: string;
  description: string;
  monitorIds: string[];
  startAt: string;
  endAt: string;
  timezone: string;
  recurrence: "once" | "weekly";
  enabled: boolean;
  notifyDuring: boolean;
  notifyAfter: boolean;
};
export type Maintenance = MaintenanceInput & {
  _id: string;
  state: "active" | "upcoming" | "completed" | "disabled";
};
export const maintenanceInput = (v: MaintenanceInput): MaintenanceInput => ({
  title: v.title,
  description: v.description,
  monitorIds: [...v.monitorIds],
  startAt: v.startAt,
  endAt: v.endAt,
  timezone: v.timezone,
  recurrence: v.recurrence,
  enabled: v.enabled,
  notifyDuring: v.notifyDuring,
  notifyAfter: v.notifyAfter,
});
export const maintenanceRangeError = (start: string, end: string) =>
  !Number.isFinite(Date.parse(start)) ||
  !Number.isFinite(Date.parse(end)) ||
  Date.parse(end) <= Date.parse(start) ||
  Date.parse(end) - Date.parse(start) > 7 * 86400000
    ? "Choose a valid range lasting up to seven days."
    : undefined;
export function MaintenancePage() {
  const client = useQueryClient();
  const canWrite = useCan("monitors:write");
  const [editing, setEditing] = useState<Maintenance | "new" | null>(null);
  const [removing, setRemoving] = useState<Maintenance | null>(null);
  const [busy, setBusy] = useState(false);
  const windows = useQuery({
    queryKey: ["maintenance"],
    queryFn: async () =>
      (await apiClient.get<{ items: Maintenance[] }>("/maintenance-windows")).data.items,
    refetchInterval: 30000,
  });
  const remove = async () => {
    if (!removing) return;
    setBusy(true);
    try {
      await apiClient.delete("/maintenance-windows/" + removing._id);
      await client.invalidateQueries({ queryKey: ["maintenance"] });
      setRemoving(null);
      toast.success("Maintenance cancelled.");
    } catch (e) {
      toast.error(getApiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <DashboardLayout>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Maintenance windows</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Keep collecting real checks while controlling incident notifications.
          </p>
        </div>
        {canWrite && <Button onClick={() => setEditing("new")}>Schedule maintenance</Button>}
      </div>
      {windows.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : windows.error ? (
        <div role="alert">
          {getApiErrorMessage(windows.error)}
          <Button variant="outline" onClick={() => void windows.refetch()}>
            Retry
          </Button>
        </div>
      ) : !windows.data?.length ? (
        <div className="rounded-lg border border-dashed p-10 text-center">
          No maintenance windows scheduled.
        </div>
      ) : (
        <div className="space-y-8">
          {["active", "upcoming", "completed", "disabled"].map((state) => (
            <section key={state} className="space-y-3">
              <h2 className="text-base font-medium capitalize">{state}</h2>
              {windows.data
                .filter((w) => w.state === state)
                .map((w) => (
                  <article
                    key={w._id}
                    className="flex flex-wrap justify-between gap-4 rounded-lg border p-4"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium">{w.title}</h3>
                        <Badge variant="outline">{w.recurrence}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {new Date(w.startAt).toLocaleString(undefined, { timeZone: w.timezone })} –{" "}
                        {new Date(w.endAt).toLocaleString(undefined, { timeZone: w.timezone })} (
                        {w.timezone})
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {w.monitorIds.length
                          ? w.monitorIds.length + " selected monitors"
                          : "All workspace monitors"}{" "}
                        · {w.notifyDuring ? "Notifications enabled" : "Notifications suppressed"}
                      </p>
                      {w.description && <p className="text-sm">{w.description}</p>}
                    </div>
                    {canWrite && (
                      <div className="flex gap-2">
                        <Button variant="outline" onClick={() => setEditing(w)}>
                          Edit
                        </Button>
                        <Button variant="outline" onClick={() => setRemoving(w)}>
                          Cancel window
                        </Button>
                      </div>
                    )}
                  </article>
                ))}
            </section>
          ))}
        </div>
      )}
      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {editing === "new" ? "Schedule maintenance" : "Edit maintenance"}
            </DialogTitle>
            <DialogDescription>
              Failures remain in history and incidents. Times below use UTC to avoid ambiguous local
              timestamps.
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <MaintenanceForm
              key={editing === "new" ? "new" : editing._id}
              initial={editing === "new" ? undefined : editing}
              onSave={() => {
                setEditing(null);
                void client.invalidateQueries({ queryKey: ["maintenance"] });
              }}
            />
          )}
        </DialogContent>
      </Dialog>
      <AlertDialog open={!!removing} onOpenChange={(open) => !open && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel maintenance?</AlertDialogTitle>
            <AlertDialogDescription>
              Checks and ordinary notifications will continue. Historical maintenance markers are
              preserved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Keep window</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                void remove();
              }}
            >
              {busy ? <SpinnerCustom>Cancelling…</SpinnerCustom> : "Cancel window"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
function MaintenanceForm({ initial, onSave }: { initial?: Maintenance; onSave: () => void }) {
  const now = Date.now();
  const [value, setValue] = useState<MaintenanceInput>(
    initial
      ? maintenanceInput(initial)
      : {
          title: "",
          description: "",
          monitorIds: [],
          startAt: new Date(now + 3600000).toISOString(),
          endAt: new Date(now + 7200000).toISOString(),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          recurrence: "once",
          enabled: true,
          notifyDuring: false,
          notifyAfter: true,
        },
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const monitors = useQuery({
    queryKey: ["maintenance-monitor-options"],
    queryFn: async () => {
      const first = (await listMonitors({ pageSize: 50 })).data;
      const items = [...first.items];
      for (let page = 2; page <= Math.min(first.totalPages, 10); page++)
        items.push(...(await listMonitors({ pageSize: 50, page })).data.items);
      return items;
    },
  });
  const change = (next: Partial<MaintenanceInput>) => setValue({ ...value, ...next });
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const rangeError = maintenanceRangeError(value.startAt, value.endAt);
    if (rangeError) {
      setError(rangeError);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const payload = { ...value };
      if (initial) await apiClient.patch("/maintenance-windows/" + initial._id, payload);
      else await apiClient.post("/maintenance-windows", payload);
      toast.success("Maintenance saved.");
      onSave();
    } catch (e) {
      setError(getApiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-5">
      <fieldset disabled={busy} className="space-y-5">
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="space-y-2">
          <Label htmlFor="maintenance-title">Title</Label>
          <Input
            id="maintenance-title"
            required
            maxLength={100}
            value={value.title}
            onChange={(e) => change({ title: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="maintenance-description">Description (optional)</Label>
          <Input
            id="maintenance-description"
            maxLength={1000}
            value={value.description}
            onChange={(e) => change({ description: e.target.value })}
          />
        </div>
        <UtcDate
          label="Start (UTC)"
          value={value.startAt}
          onChange={(v) => change({ startAt: v })}
        />
        <UtcDate label="End (UTC)" value={value.endAt} onChange={(v) => change({ endAt: v })} />
        <div className="space-y-2">
          <Label htmlFor="maintenance-recurrence">Repeat</Label>
          <Select
            value={value.recurrence}
            onValueChange={(v) => change({ recurrence: v as MaintenanceInput["recurrence"] })}
          >
            <SelectTrigger id="maintenance-recurrence">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="once">One time</SelectItem>
              <SelectItem value="weekly">Every week</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="maintenance-timezone">IANA timezone for weekly recurrence</Label>
          <Input
            id="maintenance-timezone"
            required
            value={value.timezone}
            onChange={(e) => change({ timezone: e.target.value })}
          />
          <p className="text-xs text-muted-foreground">
            Weekly windows follow local wall time in this timezone, including daylight saving
            changes. Repeated clock hours are included; skipped clock times begin when the clock
            enters the window.
          </p>
        </div>
        <div className="space-y-2">
          <Label>Affected monitors</Label>
          <p className="text-xs text-muted-foreground">
            Leave all unchecked to apply to every workspace monitor.
          </p>
          {monitors.isLoading ? (
            <Skeleton className="h-16" />
          ) : monitors.error ? (
            <p role="alert">
              Unable to load monitors.{" "}
              <Button type="button" variant="outline" onClick={() => void monitors.refetch()}>
                Retry
              </Button>
            </p>
          ) : (
            <div className="max-h-40 overflow-auto space-y-2 rounded border p-3">
              {monitors.data?.map((m) => (
                <label key={m._id} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={value.monitorIds.includes(m._id)}
                    onCheckedChange={(v) =>
                      change({
                        monitorIds: v
                          ? [...value.monitorIds, m._id]
                          : value.monitorIds.filter((id) => id !== m._id),
                      })
                    }
                  />
                  {m.name}
                </label>
              ))}
            </div>
          )}
        </div>
        <label className="flex items-center gap-3 text-sm">
          <Switch checked={value.enabled} onCheckedChange={(v) => change({ enabled: v })} />
          Enabled
        </label>
        <label className="flex items-center gap-3 text-sm">
          <Switch
            checked={value.notifyDuring}
            onCheckedChange={(v) => change({ notifyDuring: v })}
          />
          Send notifications during maintenance
          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={0} className="rounded border px-1">
                ?
              </span>
            </TooltipTrigger>
            <TooltipContent>
              Checks and incidents always continue. This switch controls outbound incident alerts.
            </TooltipContent>
          </Tooltip>
        </label>
        <label className="flex items-center gap-3 text-sm">
          <Switch checked={value.notifyAfter} onCheckedChange={(v) => change({ notifyAfter: v })} />
          Notify once if the incident remains unresolved after maintenance
        </label>
        <Button type="submit" disabled={busy}>
          {busy ? <SpinnerCustom>Saving…</SpinnerCustom> : "Save maintenance"}
        </Button>
      </fieldset>
    </form>
  );
}
function UtcDate({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const id = label.startsWith("Start") ? "maintenance-start" : "maintenance-end";
  const [raw, setRaw] = useState(value.slice(0, 16));
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex gap-2">
        <Input
          id={id}
          required
          type="datetime-local"
          value={raw}
          onChange={(e) => {
            setRaw(e.target.value);
            const date = new Date(e.target.value + "Z");
            onChange(Number.isFinite(date.getTime()) ? date.toISOString() : "");
          }}
        />
        <Popover>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" aria-label={"Choose " + label + " date"}>
              Calendar
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0">
            <Calendar
              mode="single"
              selected={value ? new Date(value) : undefined}
              onSelect={(date) => {
                if (date) {
                  const iso =
                    new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
                      .toISOString()
                      .slice(0, 10) +
                    "T" +
                    (raw.split("T")[1] ?? "00:00");
                  setRaw(iso);
                  onChange(iso + ":00.000Z");
                }
              }}
            />
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
