import { useState } from "react";
import { toast } from "sonner";
import { SpinnerCustom } from "@/components/common/loading-spinner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useSubscribers, useUpdateStatusPage } from "../hooks/use-status-pages";
import { managementErrorMessage } from "../lib/errors";
import { formatDate } from "../lib/status-presentation";
import type {
  StatusPageDetail,
  SubscriberEvents,
  SubscriberQuery,
  SubscriberStatus,
} from "../types/status-page.types";
import { EditorSection } from "./editor-section";
import { ToneBadge } from "./status-badges";

const eventOptions: { key: keyof SubscriberEvents; label: string; description: string }[] = [
  { key: "opened", label: "Incident opened", description: "When an incident begins." },
  { key: "resolved", label: "Incident resolved", description: "When service is restored." },
  {
    key: "acknowledged",
    label: "Incident acknowledged",
    description: "When your team acknowledges an incident.",
  },
];

const statusTone = { pending: "warn", active: "good", unsubscribed: "neutral" } as const;

export function SubscriberSettingsSection({ page }: { page: StatusPageDetail }) {
  const update = useUpdateStatusPage();
  const [query, setQuery] = useState<SubscriberQuery>({ page: 1, pageSize: 10, status: "all" });
  const subscribers = useSubscribers(page.id, query);

  const save = (payload: Parameters<typeof update.mutate>[0]["payload"], message: string) => {
    update.mutate(
      { id: page.id, payload },
      {
        onSuccess: () => toast.success(message),
        onError: (error) => toast.error(managementErrorMessage(error)),
      },
    );
  };

  const counts = subscribers.data?.counts;

  return (
    <EditorSection
      title="Subscriber settings"
      description="Let visitors subscribe to verified email updates about incidents."
      defaultOpen={false}
    >
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <Label htmlFor="subscribers-enabled" className="text-sm font-medium">
              Allow email subscriptions
            </Label>
            <p className="text-sm text-muted-foreground">
              Visitors confirm their address by email before receiving anything. They can
              unsubscribe at any time.
            </p>
          </div>
          <div className="flex items-center gap-2 pt-0.5">
            {update.isPending ? <SpinnerCustom /> : null}
            <Switch
              id="subscribers-enabled"
              checked={page.subscribersEnabled}
              disabled={update.isPending}
              onCheckedChange={(checked) =>
                save(
                  { subscribersEnabled: checked },
                  checked ? "Subscriptions enabled." : "Subscriptions disabled.",
                )
              }
            />
          </div>
        </div>

        <fieldset className="space-y-3" disabled={update.isPending}>
          <legend className="text-sm font-medium">Events visitors can choose</legend>
          {eventOptions.map((option) => (
            <label key={option.key} className="flex items-start gap-3">
              <Checkbox
                className="mt-1"
                checked={page.subscriberEvents[option.key]}
                onCheckedChange={(checked) =>
                  save(
                    { subscriberEvents: { [option.key]: checked } },
                    `${option.label} ${checked ? "offered" : "no longer offered"}.`,
                  )
                }
              />
              <span className="space-y-0.5">
                <span className="block text-sm font-medium">{option.label}</span>
                <span className="block text-xs text-muted-foreground">{option.description}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <p className="text-sm font-medium">Subscribers</p>
              <p className="text-xs text-muted-foreground" aria-live="polite">
                {counts
                  ? `${counts.active} active, ${counts.pending} pending, ${counts.unsubscribed} unsubscribed`
                  : "Loading counts…"}
              </p>
            </div>
            <div className="w-40">
              <Select
                value={query.status}
                onValueChange={(value) =>
                  setQuery({ ...query, page: 1, status: value as SubscriberQuery["status"] })
                }
              >
                <SelectTrigger aria-label="Filter subscribers by status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="unsubscribed">Unsubscribed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {subscribers.isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : subscribers.isError ? (
            <p role="alert" className="text-sm text-destructive">
              Couldn&apos;t load subscribers.
            </p>
          ) : (subscribers.data?.items ?? []).length === 0 ? (
            <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              No subscribers yet.
            </p>
          ) : (
            <ul className="divide-y divide-border rounded-md border border-border">
              {subscribers.data?.items.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm"
                >
                  <span className="min-w-0 font-medium break-all">{item.emailMasked}</span>
                  <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <ToneBadge tone={statusTone[item.status as SubscriberStatus]}>
                      {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
                    </ToneBadge>
                    <span>
                      {[
                        item.events.opened ? "opened" : null,
                        item.events.acknowledged ? "acknowledged" : null,
                        item.events.resolved ? "resolved" : null,
                      ]
                        .filter(Boolean)
                        .join(", ") || "no events"}
                    </span>
                    <span>{formatDate(item.createdAt)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}

          {subscribers.data && subscribers.data.totalPages > 1 ? (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                Page {subscribers.data.page} of {subscribers.data.totalPages}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={query.page <= 1}
                  onClick={() => setQuery({ ...query, page: query.page - 1 })}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={query.page >= subscribers.data.totalPages}
                  onClick={() => setQuery({ ...query, page: query.page + 1 })}
                >
                  Next
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </EditorSection>
  );
}
