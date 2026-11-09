import { useState } from "react";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { SpinnerCustom } from "@/components/common/loading-spinner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useDeleteService, useReorderServices, useUpdateService } from "../hooks/use-status-pages";
import { managementErrorMessage } from "../lib/errors";
import { moveItem, reorderAnnouncement } from "../lib/reorder";
import type { ServiceDetail } from "../types/status-page.types";
import { EditorSection } from "./editor-section";
import { ServiceDialog } from "./service-dialog";
import { MonitorStateBadge, PublicStatusBadge } from "./status-badges";

export function ServicesSection({
  pageId,
  services,
}: {
  pageId: string;
  services: ServiceDetail[];
}) {
  const update = useUpdateService(pageId);
  const remove = useDeleteService(pageId);
  const reorder = useReorderServices(pageId);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ServiceDetail | null>(null);
  const [deleting, setDeleting] = useState<ServiceDetail | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const ordered = [...services].sort((a, b) => a.order - b.order);

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const openEdit = (service: ServiceDetail) => {
    setEditing(service);
    setDialogOpen(true);
  };

  const move = (index: number, direction: -1 | 1) => {
    const next = moveItem(ordered, index, direction);
    if (next === ordered) return;
    const moved = ordered[index] as ServiceDetail;
    reorder.mutate(
      next.map((service) => service.id),
      {
        onSuccess: () =>
          setAnnouncement(
            reorderAnnouncement(moved.name, index, index + direction, ordered.length),
          ),
        onError: (error) => toast.error(managementErrorMessage(error)),
      },
    );
  };

  const toggleEnabled = (service: ServiceDetail, enabled: boolean) => {
    setTogglingId(service.id);
    update.mutate(
      { serviceId: service.id, payload: { enabled } },
      {
        onSuccess: () =>
          toast.success(`${service.name} ${enabled ? "is now visible" : "is now hidden"}.`),
        onError: (error) => toast.error(managementErrorMessage(error)),
        onSettled: () => setTogglingId(null),
      },
    );
  };

  const confirmDelete = () => {
    if (!deleting) return;
    const target = deleting;
    remove.mutate(target.id, {
      onSuccess: () => {
        toast.success(`${target.name} deleted.`);
        setDeleting(null);
      },
      onError: (error) => toast.error(managementErrorMessage(error)),
    });
  };

  return (
    <EditorSection
      title="Services"
      description="Group monitors into the services your customers recognize."
      action={
        <Button size="sm" onClick={openCreate}>
          <Plus className="size-4" /> Add service
        </Button>
      }
    >
      <div className="sr-only" aria-live="polite" role="status">
        {announcement}
      </div>
      {ordered.length === 0 ? (
        <div className="rounded-md border border-dashed border-border p-8 text-center">
          <p className="font-medium">No services yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Add a service and choose which of your monitors belong to it.
          </p>
          <Button className="mt-4" size="sm" onClick={openCreate}>
            <Plus className="size-4" /> Add service
          </Button>
        </div>
      ) : (
        <ol className="space-y-3">
          {ordered.map((service, index) => (
            <li key={service.id} className="rounded-md border border-border p-3 sm:p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold break-words">{service.name}</h3>
                    <PublicStatusBadge status={service.status} />
                    {!service.enabled ? (
                      <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                        Hidden
                      </span>
                    ) : null}
                  </div>
                  {service.description ? (
                    <p className="text-sm text-muted-foreground">{service.description}</p>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Move ${service.name} up`}
                    disabled={index === 0 || reorder.isPending}
                    onClick={() => move(index, -1)}
                  >
                    <ArrowUp className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Move ${service.name} down`}
                    disabled={index === ordered.length - 1 || reorder.isPending}
                    onClick={() => move(index, 1)}
                  >
                    <ArrowDown className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Edit ${service.name}`}
                    onClick={() => openEdit(service)}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Delete ${service.name}`}
                    onClick={() => setDeleting(service)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <ul className="flex flex-wrap gap-2" aria-label={`Monitors in ${service.name}`}>
                  {service.monitors.map((monitor) => (
                    <li
                      key={monitor.id}
                      className="flex max-w-full items-center gap-2 rounded-md bg-muted/50 px-2 py-1 text-xs"
                    >
                      <span className="max-w-40 truncate font-medium">{monitor.name}</span>
                      <span className="max-w-32 truncate text-muted-foreground">
                        {monitor.host ?? ""}
                      </span>
                      <MonitorStateBadge state={monitor.state} />
                    </li>
                  ))}
                </ul>
                <label className="flex items-center gap-2 text-sm">
                  {togglingId === service.id ? <SpinnerCustom /> : null}
                  <Switch
                    checked={service.enabled}
                    disabled={togglingId === service.id}
                    onCheckedChange={(checked) => toggleEnabled(service, checked)}
                    aria-label={`Show ${service.name} on the public page`}
                  />
                  <span>Show on page</span>
                </label>
              </div>
            </li>
          ))}
        </ol>
      )}

      <ServiceDialog
        pageId={pageId}
        service={editing}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />

      <AlertDialog open={Boolean(deleting)} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleting?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              The service is removed from the page. Your monitors are not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={remove.isPending}
              onClick={(event) => {
                event.preventDefault();
                confirmDelete();
              }}
            >
              {remove.isPending ? <SpinnerCustom>Deleting…</SpinnerCustom> : "Delete service"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </EditorSection>
  );
}
