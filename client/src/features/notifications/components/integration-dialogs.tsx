import { useMemo } from "react";
import { Controller, useForm, type UseFormSetError } from "react-hook-form";
import { toast } from "sonner";
import { SpinnerCustom } from "@/components/common/loading-spinner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SlackWebhookHelp } from "./slack-webhook-help";
import { getApiErrorMessage, getApiFieldErrors } from "@/lib/api-error";
import {
  useCreateSlackIntegration,
  useCreateWebhookIntegration,
  useUpdateIntegration,
} from "../hooks/use-notifications";
import { createMappedResolver, toFormField } from "../lib/form-resolver";
import {
  editIntegrationSchema,
  replaceSlackUrlSchema,
  replaceWebhookUrlSchema,
  slackIntegrationSchema,
  webhookIntegrationSchema,
} from "../schemas/notification.schema";
import type { IncidentEventType, Integration, IntegrationType } from "../types/notification.types";
import { EventCheckboxes } from "./event-checkboxes";

type FieldName = "name" | "endpoint" | "events";

const applyServerErrors = (
  error: unknown,
  setError: UseFormSetError<{ name: string; endpoint: string; events: IncidentEventType[] }>,
) => {
  const fieldErrors = getApiFieldErrors(error);
  const entries = Object.entries(fieldErrors);
  if (entries.length === 0) {
    toast.error(getApiErrorMessage(error));
    return;
  }
  for (const [key, message] of entries) {
    const field = toFormField(key);
    if (field === "name" || field === "endpoint" || field === "events") {
      setError(field as FieldName, { type: "server", message });
    }
  }
};

const FieldError = ({ id, message }: { id: string; message?: string }) =>
  message ? (
    <p id={id} className="text-xs text-destructive">
      {message}
    </p>
  ) : null;

interface DialogShellProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  busy: boolean;
  title: string;
  description: string;
  children: React.ReactNode;
}

function DialogShell({ open, onOpenChange, busy, title, description, children }: DialogShellProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => (!busy ? onOpenChange(next) : undefined)}>
      <DialogContent
        onEscapeKeyDown={(event) => busy && event.preventDefault()}
        onInteractOutside={(event) => busy && event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {open ? children : null}
      </DialogContent>
    </Dialog>
  );
}

interface CreateIntegrationDialogProps {
  type: IntegrationType;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSecret: (reveal: { name: string; secret: string; rotated: boolean }) => void;
}

const defaultEvents: IncidentEventType[] = ["incident.opened", "incident.resolved"];

export function CreateIntegrationDialog({
  type,
  open,
  onOpenChange,
  onSecret,
}: CreateIntegrationDialogProps) {
  const createSlack = useCreateSlackIntegration();
  const createWebhook = useCreateWebhookIntegration();
  const busy = createSlack.isPending || createWebhook.isPending;
  const isSlack = type === "slack";

  return (
    <DialogShell
      open={open}
      onOpenChange={onOpenChange}
      busy={busy}
      title={isSlack ? "Add Slack integration" : "Add webhook"}
      description={
        isSlack
          ? "Post incident alerts to a Slack channel using an Incoming Webhook URL."
          : "Send signed incident events to your own HTTPS endpoint."
      }
    >
      <CreateForm
        type={type}
        busy={busy}
        onCancel={() => onOpenChange(false)}
        onSubmit={async (values, setError) => {
          try {
            if (isSlack) {
              await createSlack.mutateAsync({
                name: values.name,
                webhookUrl: values.endpoint,
                events: values.events,
              });
              toast.success("Slack integration added.");
            } else {
              const result = await createWebhook.run({
                name: values.name,
                url: values.endpoint,
                events: values.events,
              });
              toast.success("Webhook added.");
              onSecret({
                name: result.integration.name,
                secret: result.signingSecret,
                rotated: false,
              });
            }
            onOpenChange(false);
          } catch (error) {
            applyServerErrors(error, setError);
          }
        }}
      />
    </DialogShell>
  );
}

type CreateValues = { name: string; endpoint: string; events: IncidentEventType[] };

function CreateForm({
  type,
  busy,
  onCancel,
  onSubmit,
}: {
  type: IntegrationType;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (values: CreateValues, setError: UseFormSetError<CreateValues>) => Promise<void>;
}) {
  const isSlack = type === "slack";
  const resolver = useMemo(
    () =>
      createMappedResolver<CreateValues>((values) =>
        isSlack
          ? slackIntegrationSchema.safeParse({
              name: values.name,
              webhookUrl: values.endpoint,
              events: values.events,
            })
          : webhookIntegrationSchema.safeParse({
              name: values.name,
              url: values.endpoint,
              events: values.events,
            }),
      ),
    [isSlack],
  );
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<CreateValues>({
    resolver,
    defaultValues: { name: "", endpoint: "", events: defaultEvents },
  });

  return (
    <form
      className="space-y-4"
      noValidate
      onSubmit={(event) => void handleSubmit((values) => onSubmit(values, setError))(event)}
    >
      <div className="space-y-2">
        <Label htmlFor={`${type}-name`}>Name</Label>
        <Input
          id={`${type}-name`}
          placeholder={isSlack ? "#ops-alerts" : "Pager integration"}
          autoComplete="off"
          aria-invalid={Boolean(errors.name)}
          {...register("name")}
        />
        <FieldError id={`${type}-name-error`} message={errors.name?.message} />
      </div>
      <div className="space-y-2">
        <div className="flex items-center gap-1.5">
          <Label htmlFor={`${type}-endpoint`}>
            {isSlack ? "Incoming webhook URL" : "Endpoint URL"}
          </Label>
          {isSlack ? <SlackWebhookHelp /> : null}
        </div>
        <Input
          id={`${type}-endpoint`}
          type={isSlack ? "password" : "url"}
          placeholder={
            isSlack ? "https://hooks.slack.com/services/…" : "https://example.com/hooks/faultline"
          }
          autoComplete="off"
          spellCheck={false}
          aria-invalid={Boolean(errors.endpoint)}
          {...register("endpoint")}
        />
        <FieldError id={`${type}-endpoint-error`} message={errors.endpoint?.message} />
        <p className="text-xs text-muted-foreground">
          {isSlack
            ? "This URL is a secret. FaultLine stores it encrypted and never shows it again."
            : "Must be a public HTTPS endpoint. Private and local addresses are rejected."}
        </p>
      </div>
      <div className="space-y-2">
        <Label>Events</Label>
        <Controller
          control={control}
          name="events"
          render={({ field }) => (
            <EventCheckboxes
              idPrefix={`${type}-create`}
              value={field.value}
              onChange={field.onChange}
            />
          )}
        />
        <FieldError id={`${type}-events-error`} message={errors.events?.message} />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy}>
          {busy ? <SpinnerCustom>Saving…</SpinnerCustom> : "Add integration"}
        </Button>
      </DialogFooter>
    </form>
  );
}

interface IntegrationDialogProps {
  integration: Integration | null;
  onOpenChange: (open: boolean) => void;
}

export function EditIntegrationDialog({ integration, onOpenChange }: IntegrationDialogProps) {
  const update = useUpdateIntegration();
  return (
    <DialogShell
      open={Boolean(integration)}
      onOpenChange={onOpenChange}
      busy={update.isPending}
      title="Edit integration"
      description="Change the display name or the events this integration receives."
    >
      {integration ? (
        <EditForm
          integration={integration}
          busy={update.isPending}
          onCancel={() => onOpenChange(false)}
          onSubmit={async (values, setError) => {
            try {
              await update.mutateAsync({
                id: integration.id,
                payload: { name: values.name, events: values.events },
              });
              toast.success("Integration updated.");
              onOpenChange(false);
            } catch (error) {
              applyServerErrors(error, setError as UseFormSetError<CreateValues>);
            }
          }}
        />
      ) : null}
    </DialogShell>
  );
}

type EditValues = { name: string; endpoint: string; events: IncidentEventType[] };

function EditForm({
  integration,
  busy,
  onCancel,
  onSubmit,
}: {
  integration: Integration;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (values: EditValues, setError: UseFormSetError<EditValues>) => Promise<void>;
}) {
  const resolver = useMemo(
    () =>
      createMappedResolver<EditValues>((values) =>
        editIntegrationSchema.safeParse({ name: values.name, events: values.events }),
      ),
    [],
  );
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<EditValues>({
    resolver,
    defaultValues: { name: integration.name, endpoint: "", events: integration.events },
  });
  return (
    <form
      className="space-y-4"
      noValidate
      onSubmit={(event) => void handleSubmit((values) => onSubmit(values, setError))(event)}
    >
      <div className="space-y-2">
        <Label htmlFor="edit-integration-name">Name</Label>
        <Input
          id="edit-integration-name"
          autoComplete="off"
          aria-invalid={Boolean(errors.name)}
          {...register("name")}
        />
        <FieldError id="edit-integration-name-error" message={errors.name?.message} />
      </div>
      <div className="space-y-2">
        <Label>Events</Label>
        <Controller
          control={control}
          name="events"
          render={({ field }) => (
            <EventCheckboxes idPrefix="edit" value={field.value} onChange={field.onChange} />
          )}
        />
        <FieldError id="edit-integration-events-error" message={errors.events?.message} />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy}>
          {busy ? <SpinnerCustom>Saving…</SpinnerCustom> : "Save changes"}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function ReplaceUrlDialog({ integration, onOpenChange }: IntegrationDialogProps) {
  const update = useUpdateIntegration();
  const isSlack = integration?.type === "slack";
  return (
    <DialogShell
      open={Boolean(integration)}
      onOpenChange={onOpenChange}
      busy={update.isPending}
      title={isSlack ? "Replace webhook URL" : "Replace endpoint URL"}
      description="The new URL replaces the stored one. The current URL is never displayed."
    >
      {integration ? (
        <ReplaceUrlForm
          integration={integration}
          busy={update.isPending}
          onCancel={() => onOpenChange(false)}
          onSubmit={async (endpoint, setError) => {
            try {
              await update.mutateAsync({
                id: integration.id,
                payload: isSlack ? { webhookUrl: endpoint } : { url: endpoint },
              });
              toast.success("URL replaced.");
              onOpenChange(false);
            } catch (error) {
              applyServerErrors(error, setError as UseFormSetError<CreateValues>);
            }
          }}
        />
      ) : null}
    </DialogShell>
  );
}

type ReplaceValues = { name: string; endpoint: string; events: IncidentEventType[] };

function ReplaceUrlForm({
  integration,
  busy,
  onCancel,
  onSubmit,
}: {
  integration: Integration;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (endpoint: string, setError: UseFormSetError<ReplaceValues>) => Promise<void>;
}) {
  const isSlack = integration.type === "slack";
  const resolver = useMemo(
    () =>
      createMappedResolver<ReplaceValues>((values) =>
        isSlack
          ? replaceSlackUrlSchema.safeParse({ webhookUrl: values.endpoint })
          : replaceWebhookUrlSchema.safeParse({ url: values.endpoint }),
      ),
    [isSlack],
  );
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<ReplaceValues>({
    resolver,
    defaultValues: { name: integration.name, endpoint: "", events: integration.events },
  });
  return (
    <form
      className="space-y-4"
      noValidate
      onSubmit={(event) =>
        void handleSubmit((values) => onSubmit(values.endpoint, setError))(event)
      }
    >
      <div className="space-y-2">
        <div className="flex items-center gap-1.5">
          <Label htmlFor="replace-url">
            {isSlack ? "New Incoming webhook URL" : "New endpoint URL"}
          </Label>
          {isSlack ? <SlackWebhookHelp /> : null}
        </div>
        <Input
          id="replace-url"
          type={isSlack ? "password" : "url"}
          autoComplete="off"
          spellCheck={false}
          placeholder={
            isSlack ? "https://hooks.slack.com/services/…" : "https://example.com/hooks/faultline"
          }
          aria-invalid={Boolean(errors.endpoint)}
          {...register("endpoint")}
        />
        <FieldError id="replace-url-error" message={errors.endpoint?.message} />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy}>
          {busy ? <SpinnerCustom>Saving…</SpinnerCustom> : "Replace URL"}
        </Button>
      </DialogFooter>
    </form>
  );
}
