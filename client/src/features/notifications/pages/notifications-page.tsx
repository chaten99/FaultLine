import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { DeliveryHistorySection } from "../components/delivery-history-section";
import { EmailSection } from "../components/email-section";
import { GeneralPreferencesSection } from "../components/general-preferences-section";
import { IntegrationsSection } from "../components/integrations-section";
import { useIntegrations, usePreferences } from "../hooks/use-notifications";
import { useNotificationSocket } from "../realtime/use-notification-socket";

export function NotificationsPage() {
  useNotificationSocket();
  const preferences = usePreferences();
  const integrations = useIntegrations();

  return (
    <DashboardLayout>
      <div className="min-w-0 space-y-10">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">Notifications</h1>
          <p className="text-muted-foreground">
            Choose how FaultLine keeps you informed about incidents and service recovery.
          </p>
        </div>

        <GeneralPreferencesSection
          preferences={preferences.data}
          isLoading={preferences.isLoading}
          isError={preferences.isError}
        />
        <EmailSection preferences={preferences.data} isLoading={preferences.isLoading} />
        <IntegrationsSection
          type="slack"
          integrations={integrations.data}
          isLoading={integrations.isLoading}
          isError={integrations.isError}
          channelEnabled={preferences.data?.channels.slack}
        />
        <IntegrationsSection
          type="webhook"
          integrations={integrations.data}
          isLoading={integrations.isLoading}
          isError={integrations.isError}
          channelEnabled={preferences.data?.channels.webhook}
        />
        <DeliveryHistorySection />
      </div>
    </DashboardLayout>
  );
}
