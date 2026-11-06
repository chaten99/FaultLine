import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Mail } from "lucide-react";
import { SpinnerCustom } from "@/components/common/loading-spinner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { getApiErrorMessage } from "@/lib/api-error";
import { useTestEmail, useUpdatePreferences } from "../hooks/use-notifications";
import { reportTestDelivery } from "../lib/test-feedback";
import type { NotificationPreferences } from "../types/notification.types";
import { NotificationSection } from "./notification-section";

interface EmailSectionProps {
  preferences: NotificationPreferences | undefined;
  isLoading: boolean;
}

export function EmailSection({ preferences, isLoading }: EmailSectionProps) {
  const update = useUpdatePreferences();
  const testEmail = useTestEmail();
  const [saving, setSaving] = useState(false);

  const toggle = (next: boolean) => {
    setSaving(true);
    update.mutate(
      { channels: { email: next } },
      {
        onSuccess: () => toast.success(next ? "Email alerts enabled." : "Email alerts disabled."),
        onError: (error) => toast.error(getApiErrorMessage(error)),
        onSettled: () => setSaving(false),
      },
    );
  };

  const sendTest = () => {
    testEmail.mutate(undefined, {
      onSuccess: (delivery) =>
        reportTestDelivery(delivery, preferences?.email.address ?? "your email"),
      onError: (error) => toast.error(getApiErrorMessage(error)),
    });
  };

  return (
    <NotificationSection
      title="Email"
      description="Alerts are sent only to the verified email address on your account."
    >
      {isLoading || !preferences ? (
        <div className="space-y-3 p-4">
          <Skeleton className="h-5 w-56" />
          <Skeleton className="h-9 w-40" />
        </div>
      ) : (
        <div className="space-y-4 p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <div className="grid size-9 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
                <Mail className="size-4" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium break-all">{preferences.email.address}</p>
                <p className="text-sm text-muted-foreground">
                  {preferences.email.verified ? "Verified account email" : "Email not verified"}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {saving ? <SpinnerCustom /> : null}
              <Switch
                aria-label="Email alerts"
                checked={preferences.channels.email}
                disabled={saving || !preferences.email.verified}
                onCheckedChange={toggle}
              />
            </div>
          </div>

          {!preferences.email.verified ? (
            <p className="rounded-md border border-border bg-muted p-3 text-sm text-muted-foreground">
              FaultLine only sends alerts to verified addresses. Verify your email to start
              receiving incident emails.{" "}
              <Link to="/verify-email" className="font-medium text-foreground underline">
                Verify email
              </Link>
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              disabled={testEmail.isPending || !preferences.email.verified}
              onClick={sendTest}
            >
              {testEmail.isPending ? (
                <SpinnerCustom>Sending test…</SpinnerCustom>
              ) : (
                "Send test email"
              )}
            </Button>
            {!preferences.channels.email && preferences.email.verified ? (
              <span className="text-xs text-muted-foreground">
                Email alerts are off. Test emails are still sent when requested.
              </span>
            ) : null}
          </div>
        </div>
      )}
    </NotificationSection>
  );
}
