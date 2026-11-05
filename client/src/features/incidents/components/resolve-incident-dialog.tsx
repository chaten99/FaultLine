import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { SpinnerCustom } from "@/components/common/loading-spinner";

interface ResolveIncidentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  incidentTitle: string;
  onResolve: (reason?: string) => Promise<void>;
}

export function ResolveIncidentDialog({
  open,
  onOpenChange,
  incidentTitle,
  onResolve,
}: ResolveIncidentDialogProps) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await onResolve(reason.trim() || undefined);
      setReason("");
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Resolve incident</DialogTitle>
            <DialogDescription>
              Mark <span className="font-medium text-foreground">{incidentTitle}</span> as manually
              resolved.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="resolve-reason">Resolution reason / notes (optional)</Label>
            <textarea
              id="resolve-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={submitting}
              placeholder="e.g. Deployed hotfix to payment database, confirmed all health checks passing."
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground shadow-xs placeholder:text-muted-foreground focus:border-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              disabled={submitting}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? <SpinnerCustom>Resolving…</SpinnerCustom> : "Resolve incident"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
