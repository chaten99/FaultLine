import { useState } from "react";
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
import type { Monitor } from "../api/monitors.api";
import { toast } from "sonner";
import { getApiErrorMessage } from "@/lib/api-error";

interface DeleteMonitorDialogProps {
  monitor: Monitor | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirmDelete: (id: string) => Promise<void>;
}

export function DeleteMonitorDialog({
  monitor,
  open,
  onOpenChange,
  onConfirmDelete,
}: DeleteMonitorDialogProps) {
  const [deleting, setDeleting] = useState(false);

  if (!monitor) return null;

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    setDeleting(true);
    try {
      await onConfirmDelete(monitor._id);
      onOpenChange(false);
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!deleting) {
          onOpenChange(next);
        }
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete monitor?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently remove the configuration for{" "}
            <span className="font-semibold text-foreground">{monitor.name}</span> ({monitor.url}).
            This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={deleting}
            onClick={handleDelete}
            className="bg-destructive text-white hover:bg-destructive/90 focus:ring-destructive"
          >
            {deleting ? <SpinnerCustom>Deleting monitor…</SpinnerCustom> : "Delete monitor"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
