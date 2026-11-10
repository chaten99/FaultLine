import { useState } from "react";
import { Globe, Plus } from "lucide-react";
import { toast } from "sonner";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
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
import { SpinnerCustom } from "@/components/common/loading-spinner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useDeleteStatusPage, usePublishToggle, useStatusPages } from "../hooks/use-status-pages";
import { managementErrorMessage } from "../lib/errors";
import type { StatusPageSummary } from "../types/status-page.types";
import { CreateStatusPageDialog } from "../components/create-status-page-dialog";
import { StatusPageCard } from "../components/status-page-card";

export function StatusPagesPage() {
  const pages = useStatusPages();
  const publish = usePublishToggle();
  const remove = useDeleteStatusPage();
  const [createOpen, setCreateOpen] = useState(false);
  const [deleting, setDeleting] = useState<StatusPageSummary | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const togglePublish = (page: StatusPageSummary) => {
    const next = page.status !== "published";
    setBusyId(page.id);
    publish.mutate(
      { id: page.id, publish: next },
      {
        onSuccess: () =>
          toast.success(next ? `${page.name} is now public.` : `${page.name} is no longer public.`),
        onError: (error) => toast.error(managementErrorMessage(error)),
        onSettled: () => setBusyId(null),
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

  const items = pages.data?.items ?? [];

  return (
    <DashboardLayout>
      <div className="min-w-0 space-y-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight">Status Pages</h1>
            <p className="text-muted-foreground">
              Create public pages to keep your customers informed about the health of your services.
            </p>
          </div>
          <Button onClick={() => setCreateOpen(true)} className="shrink-0">
            <Plus className="size-4" /> Create status page
          </Button>
        </div>

        {pages.isLoading ? (
          <div className="space-y-4" aria-busy="true" aria-label="Loading status pages">
            {[0, 1].map((key) => (
              <div key={key} className="space-y-4 rounded-lg border border-border p-5">
                <Skeleton className="h-6 w-1/3" />
                <Skeleton className="h-4 w-1/5" />
                <Skeleton className="h-12 w-full" />
              </div>
            ))}
          </div>
        ) : pages.isError ? (
          <div role="alert" className="rounded-lg border border-border p-8 text-center">
            <p className="font-medium">We couldn&apos;t load your status pages.</p>
            <Button variant="outline" className="mt-4" onClick={() => void pages.refetch()}>
              {pages.isFetching ? <SpinnerCustom>Retrying…</SpinnerCustom> : "Try again"}
            </Button>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border px-6 py-16 text-center">
            <div className="grid size-12 place-items-center rounded-full bg-muted">
              <Globe className="size-5 text-muted-foreground" aria-hidden="true" />
            </div>
            <h2 className="text-lg font-semibold">No status pages yet</h2>
            <p className="max-w-sm text-sm text-muted-foreground">
              Create your first status page to share your service health with customers.
            </p>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" /> Create status page
            </Button>
          </div>
        ) : (
          <ul className="space-y-4">
            {items.map((page) => (
              <StatusPageCard
                key={page.id}
                page={page}
                busy={busyId === page.id}
                onPublishToggle={togglePublish}
                onDelete={setDeleting}
              />
            ))}
          </ul>
        )}
      </div>

      <CreateStatusPageDialog open={createOpen} onOpenChange={setCreateOpen} />

      <AlertDialog open={Boolean(deleting)} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleting?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              The public page will stop working immediately and its services and subscribers will be
              removed. This cannot be undone.
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
              {remove.isPending ? <SpinnerCustom>Deleting…</SpinnerCustom> : "Delete page"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
