import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { SpinnerCustom } from "@/components/common/loading-spinner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getApiFieldErrors } from "@/lib/api-error";
import { useCreateService, useUpdateService } from "../hooks/use-status-pages";
import { managementErrorMessage } from "../lib/errors";
import { serviceFormSchema, type ServiceFormValues } from "../schemas/status-page.schema";
import type { ServiceDetail, ServiceMonitor } from "../types/status-page.types";
import { MonitorCombobox } from "./monitor-combobox";

export function ServiceDialog({
  pageId,
  service,
  open,
  onOpenChange,
}: {
  pageId: string;
  service: ServiceDetail | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const create = useCreateService(pageId);
  const update = useUpdateService(pageId);
  const busy = create.isPending || update.isPending;
  const [monitors, setMonitors] = useState<ServiceMonitor[]>([]);

  const {
    register,
    handleSubmit,
    setValue,
    setError,
    reset,
    formState: { errors },
  } = useForm<ServiceFormValues>({
    resolver: zodResolver(serviceFormSchema),
    defaultValues: { name: "", description: "", monitorIds: [] },
  });

  useEffect(() => {
    if (!open) return;
    reset({
      name: service?.name ?? "",
      description: service?.description ?? "",
      monitorIds: service?.monitorIds ?? [],
    });
    setMonitors(service?.monitors ?? []);
  }, [open, service, reset]);

  const changeMonitors = (next: ServiceMonitor[]) => {
    setMonitors(next);
    setValue(
      "monitorIds",
      next.map((monitor) => monitor.id),
      { shouldValidate: true },
    );
  };

  const submit = handleSubmit(async (values) => {
    try {
      if (service) {
        await update.mutateAsync({ serviceId: service.id, payload: values });
        toast.success(`${values.name} updated.`);
      } else {
        await create.mutateAsync(values);
        toast.success(`${values.name} added.`);
      }
      onOpenChange(false);
    } catch (error) {
      const fieldErrors = getApiFieldErrors(error);
      const entries = Object.entries(fieldErrors);
      if (entries.length === 0) toast.error(managementErrorMessage(error));
      for (const [field, message] of entries) {
        if (field === "name" || field === "description" || field === "monitorIds") {
          setError(field, { type: "server", message });
        }
      }
    }
  });

  return (
    <Dialog open={open} onOpenChange={(next) => (!busy ? onOpenChange(next) : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{service ? "Edit service" : "Add service"}</DialogTitle>
          <DialogDescription>
            Group the monitors that make up one customer-facing service. Only monitors you select
            are shown publicly.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(event) => void submit(event)} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="svc-name">Service name</Label>
            <Input
              id="svc-name"
              placeholder="Public API"
              autoComplete="off"
              aria-invalid={Boolean(errors.name)}
              {...register("name")}
            />
            {errors.name ? (
              <p role="alert" className="text-xs text-destructive">
                {errors.name.message}
              </p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="svc-description">Description</Label>
            <Input
              id="svc-description"
              placeholder="REST API used by our customers"
              autoComplete="off"
              aria-invalid={Boolean(errors.description)}
              {...register("description")}
            />
            {errors.description ? (
              <p role="alert" className="text-xs text-destructive">
                {errors.description.message}
              </p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label id="svc-monitors-label">Monitors</Label>
            <MonitorCombobox
              selected={monitors}
              onChange={changeMonitors}
              invalid={Boolean(errors.monitorIds)}
            />
            {errors.monitorIds ? (
              <p role="alert" className="text-xs text-destructive">
                {errors.monitorIds.message}
              </p>
            ) : null}
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? (
                <SpinnerCustom>Saving…</SpinnerCustom>
              ) : service ? (
                "Save service"
              ) : (
                "Add service"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
