import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MonitorForm } from "./monitor-form";
import type { MonitorInput } from "../api/monitors.api";

interface AddMonitorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (input: MonitorInput) => Promise<void>;
}

export function AddMonitorDialog({ open, onOpenChange, onCreate }: AddMonitorDialogProps) {
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (data: MonitorInput) => {
    setSubmitting(true);
    try {
      await onCreate(data);
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
          <DialogTitle>Add monitor</DialogTitle>
          <DialogDescription>
            Configure an API endpoint to manage it in FaultLine.
          </DialogDescription>
        </DialogHeader>

        {open && (
          <MonitorForm
            key={`add-monitor-${open}`}
            mode="create"
            onSubmit={handleSubmit}
            onCancel={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
