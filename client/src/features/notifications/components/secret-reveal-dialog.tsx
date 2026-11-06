import { useState } from "react";
import { toast } from "sonner";
import { Check, Copy, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type SecretReveal = { name: string; secret: string; rotated: boolean };

interface SecretRevealDialogProps {
  reveal: SecretReveal | null;
  onClose: () => void;
}

export function SecretRevealDialog({ reveal, onClose }: SecretRevealDialogProps) {
  const [copied, setCopied] = useState(false);

  const close = () => {
    setCopied(false);
    onClose();
  };

  const copy = async () => {
    if (!reveal) return;
    try {
      await navigator.clipboard.writeText(reveal.secret);
      setCopied(true);
      toast.success("Signing secret copied to clipboard.");
    } catch {
      toast.error("Couldn't copy automatically. Select the secret and copy it manually.");
    }
  };

  return (
    <Dialog open={Boolean(reveal)} onOpenChange={(next) => (!next ? close() : undefined)}>
      <DialogContent
        onInteractOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>
            {reveal?.rotated ? "New signing secret" : "Webhook signing secret"}
          </DialogTitle>
          <DialogDescription>
            Use this secret to verify the X-FaultLine-Signature header on requests sent to{" "}
            <span className="font-medium break-all text-foreground">{reveal?.name}</span>.
          </DialogDescription>
        </DialogHeader>
        {reveal ? (
          <div className="space-y-4">
            <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-800">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              <p>
                Copy this secret now and store it securely. You won't be able to see it again. If
                you lose it, rotate the secret to generate a new one.
              </p>
            </div>
            <div
              className="rounded-md border border-border bg-muted p-3 font-mono text-xs break-all select-all"
              data-testid="signing-secret"
            >
              {reveal.secret}
            </div>
            <Button variant="outline" size="sm" onClick={() => void copy()}>
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              {copied ? "Copied" : "Copy secret"}
            </Button>
          </div>
        ) : null}
        <DialogFooter>
          <Button onClick={close}>I've saved this secret</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
