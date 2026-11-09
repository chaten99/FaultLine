import { useState } from "react";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Info } from "lucide-react";
import { SpinnerCustom } from "@/components/common/loading-spinner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getApiErrorMessage } from "@/lib/api-error";
import { useDeliveries, useRetryDelivery } from "../hooks/use-notifications";
import {
  buildDeliveryQuery,
  channelLabels,
  defaultDeliveryFilters,
  deliveryChannels,
  deliveryEventTypes,
  deliveryStatuses,
  eventLabels,
  formatRelativeTime,
  hasActiveFilters,
  isDeliveryRetryable,
  statusLabels,
} from "../lib/notification-presentation";
import type { DeliveryFilters, DeliverySummary } from "../types/notification.types";
import { DeliveryDetailsSheet } from "./delivery-details-sheet";
import { DeliveryStatusBadge } from "./delivery-status-badge";
import { NotificationSection } from "./notification-section";

const PAGE_SIZE = 10;

function FilterSelect({
  id,
  label,
  value,
  onChange,
  options,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="min-w-0 space-y-1.5">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All</SelectItem>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function DeliveryHistorySection() {
  const [filters, setFilters] = useState<DeliveryFilters>(defaultDeliveryFilters);
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const retry = useRetryDelivery();

  const { data, isLoading, isError, isFetching } = useDeliveries(
    buildDeliveryQuery(filters, page, PAGE_SIZE),
  );

  const items = data?.items ?? [];
  const totalPages = data?.totalPages ?? 1;

  const updateFilter = <K extends keyof DeliveryFilters>(key: K, value: DeliveryFilters[K]) => {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(1);
  };

  const handleRetry = (delivery: DeliverySummary) => {
    retry.mutate(delivery.id, {
      onSuccess: () => toast.success("Retry queued. Status will update when it completes."),
      onError: (error) => toast.error(getApiErrorMessage(error)),
    });
  };

  const retryButton = (delivery: DeliverySummary) =>
    isDeliveryRetryable(delivery) ? (
      <Button
        variant="outline"
        size="sm"
        disabled={retry.isPending && retry.variables === delivery.id}
        onClick={(event) => {
          event.stopPropagation();
          handleRetry(delivery);
        }}
      >
        {retry.isPending && retry.variables === delivery.id ? (
          <SpinnerCustom>Retrying…</SpinnerCustom>
        ) : (
          "Retry"
        )}
      </Button>
    ) : null;

  return (
    <NotificationSection
      title="Delivery history"
      description="Every notification FaultLine attempted, including tests and retries."
      action={
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" aria-label="About delivery statuses">
              <Info className="size-4" /> Statuses
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="max-w-[calc(100vw-2rem)] space-y-2 text-sm">
            <p>
              <strong>Delivered</strong> means the destination accepted the request.
            </p>
            <p>
              <strong>Retrying</strong> deliveries failed temporarily and will be tried again.
            </p>
            <p>
              <strong>Failed</strong> deliveries are final. Some can be retried manually.
            </p>
          </PopoverContent>
        </Popover>
      }
    >
      <div className="space-y-4 p-4">
        <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 lg:grid-cols-5">
          <FilterSelect
            id="filter-status"
            label="Status"
            value={filters.status}
            onChange={(value) => updateFilter("status", value as DeliveryFilters["status"])}
            options={deliveryStatuses.map((value) => ({ value, label: statusLabels[value] }))}
          />
          <FilterSelect
            id="filter-channel"
            label="Channel"
            value={filters.channel}
            onChange={(value) => updateFilter("channel", value as DeliveryFilters["channel"])}
            options={deliveryChannels.map((value) => ({ value, label: channelLabels[value] }))}
          />
          <FilterSelect
            id="filter-event"
            label="Event"
            value={filters.eventType}
            onChange={(value) => updateFilter("eventType", value as DeliveryFilters["eventType"])}
            options={deliveryEventTypes.map((value) => ({ value, label: eventLabels[value] }))}
          />
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="filter-from" className="text-xs text-muted-foreground">
              From
            </Label>
            <Input
              id="filter-from"
              type="date"
              value={filters.from}
              max={filters.to || undefined}
              onChange={(event) => updateFilter("from", event.target.value)}
            />
          </div>
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="filter-to" className="text-xs text-muted-foreground">
              To
            </Label>
            <Input
              id="filter-to"
              type="date"
              value={filters.to}
              min={filters.from || undefined}
              onChange={(event) => updateFilter("to", event.target.value)}
            />
          </div>
        </div>
        {hasActiveFilters(filters) ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setFilters(defaultDeliveryFilters);
              setPage(1);
            }}
          >
            Clear filters
          </Button>
        ) : null}
      </div>

      <div className="border-t border-border">
        {isLoading ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-12 w-full" />
            ))}
          </div>
        ) : isError ? (
          <p className="p-4 text-sm text-destructive">We couldn't load delivery history.</p>
        ) : items.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">
            {hasActiveFilters(filters)
              ? "No deliveries match these filters."
              : "No notifications have been delivered yet."}
          </p>
        ) : (
          <>
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Event</TableHead>
                    <TableHead>Channel</TableHead>
                    <TableHead>Incident</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Attempts</TableHead>
                    <TableHead>Last attempt</TableHead>
                    <TableHead>Delivered</TableHead>
                    <TableHead className="text-right">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((delivery) => (
                    <TableRow
                      key={delivery.id}
                      className="cursor-pointer"
                      tabIndex={0}
                      onClick={() => setSelectedId(delivery.id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") setSelectedId(delivery.id);
                      }}
                    >
                      <TableCell className="font-medium">
                        {eventLabels[delivery.eventType]}
                      </TableCell>
                      <TableCell>
                        <span>{channelLabels[delivery.channel]}</span>
                        {delivery.integrationName ? (
                          <span className="block max-w-36 truncate text-xs text-muted-foreground">
                            {delivery.integrationName}
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className="max-w-48 truncate">
                        {delivery.incidentTitle ?? "—"}
                      </TableCell>
                      <TableCell>
                        <DeliveryStatusBadge status={delivery.status} />
                      </TableCell>
                      <TableCell>
                        {delivery.attempts}/{delivery.maxAttempts}
                      </TableCell>
                      <TableCell>{formatRelativeTime(delivery.lastAttemptAt)}</TableCell>
                      <TableCell>
                        {delivery.deliveredAt ? formatRelativeTime(delivery.deliveredAt) : "—"}
                      </TableCell>
                      <TableCell className="text-right">{retryButton(delivery)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <ul className="divide-y divide-border md:hidden">
              {items.map((delivery) => (
                <li key={delivery.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(delivery.id)}
                    className="block w-full space-y-2 p-4 text-left hover:bg-accent/50"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="min-w-0 text-sm font-medium">
                        {eventLabels[delivery.eventType]}
                      </span>
                      <DeliveryStatusBadge status={delivery.status} />
                    </div>
                    <p className="text-xs break-words text-muted-foreground">
                      {channelLabels[delivery.channel]}
                      {delivery.integrationName ? ` · ${delivery.integrationName}` : ""}
                      {delivery.incidentTitle ? ` · ${delivery.incidentTitle}` : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Attempts {delivery.attempts}/{delivery.maxAttempts} · Last attempt{" "}
                      {formatRelativeTime(delivery.lastAttemptAt)}
                      {delivery.deliveredAt
                        ? ` · Delivered ${formatRelativeTime(delivery.deliveredAt)}`
                        : ""}
                    </p>
                  </button>
                  {isDeliveryRetryable(delivery) ? (
                    <div className="px-4 pb-4">{retryButton(delivery)}</div>
                  ) : null}
                </li>
              ))}
            </ul>
          </>
        )}

        {items.length > 0 ? (
          <div className="flex items-center justify-between gap-3 border-t border-border p-4">
            <p className="text-xs text-muted-foreground">
              Page {data?.page ?? page} of {totalPages}
              {data ? ` · ${data.total} total` : ""}
              {isFetching ? " · Updating…" : ""}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                aria-label="Previous page"
              >
                <ChevronLeft className="size-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((current) => current + 1)}
                aria-label="Next page"
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      <DeliveryDetailsSheet deliveryId={selectedId} onClose={() => setSelectedId(null)} />
    </NotificationSection>
  );
}
