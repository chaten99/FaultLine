import { useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { SpinnerCustom } from "@/components/common/loading-spinner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getApiErrorMessage } from "@/lib/api-error";
import {
  useDeleteIntegration,
  useRotateWebhookSecret,
  useTestIntegration,
  useUpdateIntegration,
} from "../hooks/use-notifications";
import { reportTestDelivery } from "../lib/test-feedback";
import type { Integration, IntegrationType } from "../types/notification.types";
import {
  CreateIntegrationDialog,
  EditIntegrationDialog,
  ReplaceUrlDialog,
} from "./integration-dialogs";
import { IntegrationRow } from "./integration-row";
import { NotificationSection } from "./notification-section";
import { SlackWebhookHelp } from "./slack-webhook-help";
import { SecretRevealDialog, type SecretReveal } from "./secret-reveal-dialog";

interface IntegrationsSectionProps {
  type: IntegrationType;
  integrations: Integration[] | undefined;
  isLoading: boolean;
  isError: boolean;
  channelEnabled: boolean | undefined;
}

const copy = {
  slack: {
    title: "Slack",
    description: "Send incident alerts to Slack channels with Incoming Webhooks.",
    add: "Add Slack integration",
    empty: "No Slack integrations yet. Add an Incoming Webhook to post alerts to a channel.",
    noun: "Slack integration",
  },
  webhook: {
    title: "Custom webhooks",
    description: "Deliver signed JSON events to your own HTTPS endpoints.",
    add: "Add webhook",
    empty: "No webhooks yet. Add an endpoint to receive signed incident events.",
    noun: "webhook",
  },
} as const;

export function IntegrationsSection({
  type,
  integrations,
  isLoading,
  isError,
  channelEnabled,
}: IntegrationsSectionProps) {
  const text = copy[type];
  const update = useUpdateIntegration();
  const remove = useDeleteIntegration();
  const test = useTestIntegration();
  const rotate = useRotateWebhookSecret();

  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Integration | null>(null);
  const [replacing, setReplacing] = useState<Integration | null>(null);
  const [deleting, setDeleting] = useState<Integration | null>(null);
  const [rotating, setRotating] = useState<Integration | null>(null);
  const [reveal, setReveal] = useState<SecretReveal | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const items = (integrations ?? []).filter((integration) => integration.type === type);

  const toggle = (integration: Integration, enabled: boolean) => {
    setTogglingId(integration.id);
    update.mutate(
      { id: integration.id, payload: { enabled } },
      {
        onSuccess: () => toast.success(`${integration.name} ${enabled ? "enabled" : "disabled"}.`),
        onError: (error) => toast.error(getApiErrorMessage(error)),
        onSettled: () => setTogglingId(null),
      },
    );
  };

  const sendTest = (integration: Integration) => {
    test.mutate(integration.id, {
      onSuccess: (delivery) => reportTestDelivery(delivery, integration.name),
      onError: (error) => toast.error(getApiErrorMessage(error)),
    });
  };

  const confirmDelete = () => {
    if (!deleting) return;
    const target = deleting;
    remove.mutate(target.id, {
      onSuccess: () => {
        toast.success(`${target.name} deleted.`);
        setDeleting(null);
      },
      onError: (error) => toast.error(getApiErrorMessage(error)),
    });
  };

  const confirmRotate = async () => {
    if (!rotating) return;
    const target = rotating;
    try {
      const result = await rotate.run(target.id);
      setRotating(null);
      setReveal({ name: result.integration.name, secret: result.signingSecret, rotated: true });
      toast.success("Signing secret rotated.");
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    }
  };

  return (
    <NotificationSection
      title={text.title}
      description={text.description}
      titleAddon={type === "slack" ? <SlackWebhookHelp /> : undefined}
      action={
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" /> {text.add}
        </Button>
      }
    >
      {isLoading ? (
        <div className="space-y-3 p-4">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : isError ? (
        <p className="p-4 text-sm text-destructive">
          We couldn't load your integrations. Refresh the page to try again.
        </p>
      ) : items.length === 0 ? (
        <p className="p-6 text-center text-sm text-muted-foreground">{text.empty}</p>
      ) : (
        <>
          {channelEnabled === false ? (
            <p className="border-b border-border bg-muted p-3 text-xs text-muted-foreground">
              The {type} channel is turned off in your preferences, so incident alerts are not being
              delivered here. Test notifications still work.
            </p>
          ) : null}
          <ul className="divide-y divide-border">
            {items.map((integration) => (
              <IntegrationRow
                key={integration.id}
                integration={integration}
                toggling={togglingId === integration.id}
                testing={test.isPending && test.variables === integration.id}
                onToggle={(enabled) => toggle(integration, enabled)}
                onTest={() => sendTest(integration)}
                onEdit={() => setEditing(integration)}
                onReplaceUrl={() => setReplacing(integration)}
                onRotateSecret={() => setRotating(integration)}
                onDelete={() => setDeleting(integration)}
              />
            ))}
          </ul>
        </>
      )}

      <CreateIntegrationDialog
        type={type}
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSecret={setReveal}
      />
      <EditIntegrationDialog
        integration={editing}
        onOpenChange={(open) => (!open ? setEditing(null) : undefined)}
      />
      <ReplaceUrlDialog
        integration={replacing}
        onOpenChange={(open) => (!open ? setReplacing(null) : undefined)}
      />
      <SecretRevealDialog reveal={reveal} onClose={() => setReveal(null)} />

      <AlertDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => (!open && !remove.isPending ? setDeleting(null) : undefined)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {text.noun}?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting?.name} will stop receiving alerts and its stored credentials will be
              removed. Past delivery history is kept. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={remove.isPending}
              onClick={(event) => {
                event.preventDefault();
                confirmDelete();
              }}
            >
              {remove.isPending ? <SpinnerCustom>Deleting…</SpinnerCustom> : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={Boolean(rotating)}
        onOpenChange={(open) => (!open && !rotate.isPending ? setRotating(null) : undefined)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rotate signing secret?</AlertDialogTitle>
            <AlertDialogDescription>
              A new secret will be generated for {rotating?.name} and the current one stops working
              immediately. Update your receiver with the new secret to keep verifying requests.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={rotate.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={rotate.isPending}
              onClick={(event) => {
                event.preventDefault();
                void confirmRotate();
              }}
            >
              {rotate.isPending ? <SpinnerCustom>Rotating…</SpinnerCustom> : "Rotate secret"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </NotificationSection>
  );
}
