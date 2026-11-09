import { useState } from "react";
import { toast } from "sonner";
import { Info } from "lucide-react";
import { SpinnerCustom } from "@/components/common/loading-spinner";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getApiErrorMessage } from "@/lib/api-error";
import { useUpdatePreferences } from "../hooks/use-notifications";
import type { NotificationPreferences, PreferencesPatch } from "../types/notification.types";
import { NotificationSection, SettingRow } from "./notification-section";

type PreferenceKey = "enabled" | "opened" | "acknowledged" | "resolved";

interface GeneralPreferencesSectionProps {
  preferences: NotificationPreferences | undefined;
  isLoading: boolean;
  isError: boolean;
}

export function GeneralPreferencesSection({
  preferences,
  isLoading,
  isError,
}: GeneralPreferencesSectionProps) {
  const update = useUpdatePreferences();
  const [pendingKey, setPendingKey] = useState<PreferenceKey | null>(null);

  const save = (key: PreferenceKey, patch: PreferencesPatch) => {
    setPendingKey(key);
    update.mutate(patch, {
      onSuccess: () => toast.success("Notification preferences saved."),
      onError: (error) => toast.error(getApiErrorMessage(error)),
      onSettled: () => setPendingKey(null),
    });
  };

  const control = (
    key: PreferenceKey,
    checked: boolean,
    patch: (next: boolean) => PreferencesPatch,
    label: string,
    disabled = false,
  ) => (
    <>
      {pendingKey === key ? <SpinnerCustom /> : null}
      <Switch
        id={`pref-${key}`}
        aria-label={label}
        checked={checked}
        disabled={disabled || pendingKey !== null}
        onCheckedChange={(next) => save(key, patch(next))}
      />
    </>
  );

  return (
    <NotificationSection
      title="General"
      description="Control which incident events FaultLine notifies you about."
    >
      {isLoading ? (
        <div className="space-y-4 p-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-12 w-full" />
          ))}
        </div>
      ) : isError || !preferences ? (
        <p className="p-4 text-sm text-destructive">
          We couldn't load your notification preferences. Refresh the page to try again.
        </p>
      ) : (
        <div className="divide-y divide-border">
          <SettingRow
            htmlFor="pref-enabled"
            title="Enable notifications"
            description="Master switch. When off, FaultLine sends no incident alerts on any channel."
            control={control(
              "enabled",
              preferences.enabled,
              (next) => ({ enabled: next }),
              "Enable notifications",
            )}
          />
          <SettingRow
            htmlFor="pref-opened"
            title="Incident opened"
            description="Alert me when repeated failures open a new incident."
            control={control(
              "opened",
              preferences.events.opened,
              (next) => ({ events: { opened: next } }),
              "Incident opened notifications",
              !preferences.enabled,
            )}
          />
          <SettingRow
            htmlFor="pref-acknowledged"
            title="Incident acknowledged"
            description="Alert me when an incident is acknowledged."
            control={control(
              "acknowledged",
              preferences.events.acknowledged,
              (next) => ({ events: { acknowledged: next } }),
              "Incident acknowledged notifications",
              !preferences.enabled,
            )}
          />
          <SettingRow
            htmlFor="pref-resolved"
            title="Incident resolved"
            description="Alert me when a service recovers or an incident is resolved."
            control={control(
              "resolved",
              preferences.events.resolved,
              (next) => ({ events: { resolved: next } }),
              "Incident resolved notifications",
              !preferences.enabled,
            )}
          />
          <div className="flex items-center gap-2 p-4 text-xs text-muted-foreground">
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" aria-label="About notification events" className="shrink-0">
                  <Info className="size-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-64">
                Alerts are based on incident changes, not on every failed check.
              </TooltipContent>
            </Tooltip>
            <span>
              {preferences.enabled
                ? "Individual integrations can narrow these events further."
                : "Notifications are paused. Event settings are kept for when you turn them back on."}
            </span>
          </div>
        </div>
      )}
    </NotificationSection>
  );
}
