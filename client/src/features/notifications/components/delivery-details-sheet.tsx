import { toast } from "sonner";
import { SpinnerCustom } from "@/components/common/loading-spinner";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { getApiErrorMessage } from "@/lib/api-error";
import { useDeliveryDetail, useRetryDelivery } from "../hooks/use-notifications";
import {
  channelLabels,
  eventLabels,
  failureCategoryLabel,
  formatDateTime,
  formatDurationMs,
  isDeliveryRetryable,
} from "../lib/notification-presentation";
import { DeliveryStatusBadge } from "./delivery-status-badge";

interface DeliveryDetailsSheetProps {
  deliveryId: string | null;
  onClose: () => void;
}

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="space-y-1">
    <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</dt>
    <dd className="text-sm break-words">{children}</dd>
  </div>
);

export function DeliveryDetailsSheet({ deliveryId, onClose }: DeliveryDetailsSheetProps) {
  const { data: delivery, isLoading, isError } = useDeliveryDetail(deliveryId);
  const retry = useRetryDelivery();

  const handleRetry = () => {
    if (!delivery) return;
    retry.mutate(delivery.id, {
      onSuccess: () => toast.success("Retry queued. Status will update when it completes."),
      onError: (error) => toast.error(getApiErrorMessage(error)),
    });
  };

  return (
    <Sheet open={Boolean(deliveryId)} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <SheetContent className="w-full overflow-x-hidden sm:max-w-xl">
        <SheetHeader className="pr-8">
          <SheetTitle>Delivery details</SheetTitle>
          <SheetDescription>Safe diagnostics for this notification delivery.</SheetDescription>
        </SheetHeader>

        {isLoading ? (
          <div className="mt-6 space-y-4">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : isError || !delivery ? (
          <p className="mt-6 text-sm text-destructive">We couldn't load this delivery.</p>
        ) : (
          <div className="mt-6 min-w-0 space-y-6">
            <div className="flex flex-wrap items-center gap-2">
              <DeliveryStatusBadge status={delivery.status} />
              <span className="text-sm text-muted-foreground">
                {eventLabels[delivery.eventType]} via {channelLabels[delivery.channel]}
              </span>
            </div>

            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Destination">
                {delivery.integrationName ?? channelLabels[delivery.channel]}
              </Field>
              <Field label="Type">{delivery.kind === "test" ? "Test" : "Incident alert"}</Field>
              <Field label="Incident">{delivery.incidentTitle ?? "—"}</Field>
              <Field label="Monitor">{delivery.monitorName ?? "—"}</Field>
              <Field label="Attempts">
                {delivery.attempts} of {delivery.maxAttempts}
              </Field>
              <Field label="Response code">{delivery.responseCode ?? "—"}</Field>
              <Field label="Created">{formatDateTime(delivery.createdAt)}</Field>
              <Field label="Last attempt">{formatDateTime(delivery.lastAttemptAt)}</Field>
              <Field label="Delivered">{formatDateTime(delivery.deliveredAt)}</Field>
              <Field label="Next retry">{formatDateTime(delivery.nextRetryAt)}</Field>
              <Field label="Failure">{failureCategoryLabel(delivery.failureCategory)}</Field>
              <Field label="Delivery ID">
                <span className="font-mono text-xs break-all">{delivery.id}</span>
              </Field>
            </dl>

            {delivery.message ? (
              <div className="rounded-md border border-border bg-muted p-3 text-sm break-words">
                {delivery.message}
              </div>
            ) : null}

            <div className="space-y-3">
              <h3 className="text-sm font-semibold">Attempt history</h3>
              {delivery.attemptHistory.length === 0 ? (
                <p className="text-sm text-muted-foreground">No attempts have been made yet.</p>
              ) : (
                <ol className="space-y-2">
                  {delivery.attemptHistory.map((attempt) => (
                    <li
                      key={attempt.attempt}
                      className="rounded-md border border-border p-3 text-sm"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium">Attempt {attempt.attempt}</span>
                        <DeliveryStatusBadge
                          status={
                            attempt.outcome === "delivered"
                              ? "delivered"
                              : attempt.willRetry
                                ? "retrying"
                                : "failed"
                          }
                        />
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatDateTime(attempt.at)} · {formatDurationMs(attempt.durationMs)}
                        {attempt.responseCode ? ` · HTTP ${attempt.responseCode}` : ""}
                        {attempt.failureCategory
                          ? ` · ${failureCategoryLabel(attempt.failureCategory)}`
                          : ""}
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </div>

            {isDeliveryRetryable(delivery) ? (
              <Button onClick={handleRetry} disabled={retry.isPending}>
                {retry.isPending ? <SpinnerCustom>Retrying…</SpinnerCustom> : "Retry delivery"}
              </Button>
            ) : null}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
