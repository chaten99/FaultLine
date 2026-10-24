import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MonitorForm } from "./monitor-form";
import type { Monitor, MonitorInput } from "../api/monitors.api";

interface EditMonitorDialogProps {
  monitor: Monitor | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate: (id: string, input: Partial<MonitorInput>) => Promise<void>;
}

export function EditMonitorDialog({
  monitor,
  open,
  onOpenChange,
  onUpdate,
}: EditMonitorDialogProps) {
  const [submitting, setSubmitting] = useState(false);

  if (!monitor) return null;

  const handleSubmit = async (data: MonitorInput) => {
    setSubmitting(true);
    try {
      await onUpdate(monitor._id, data);
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!submitting) {
          onOpenChange(next);
        }
      }}
    >
      <DialogContent
        className="max-h-[90vh] overflow-y-auto sm:max-w-lg"
        onEscapeKeyDown={(e) => {
          if (submitting) e.preventDefault();
        }}
        onInteractOutside={(e) => {
          if (submitting) e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>Edit monitor</DialogTitle>
          <DialogDescription>Update your API endpoint configuration.</DialogDescription>
        </DialogHeader>

        <MonitorForm
          key={monitor._id}
          mode="edit"
          initialData={monitor}
          onSubmit={handleSubmit}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
