import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { SpinnerCustom } from "@/components/common/loading-spinner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { getApiFieldErrors } from "@/lib/api-error";
import { useUpdateWorkspace } from "../hooks/use-workspaces";
import { workspaceErrorMessage } from "../lib/messages";
import { createWorkspaceSchema, type CreateWorkspaceValues } from "../schemas/workspace.schema";
import type { WorkspaceDetail } from "../types/workspace.types";
import { RoleBadge } from "./role-badge";

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate text-right font-medium">{children}</dd>
    </div>
  );
}

export function WorkspaceDetails({
  workspace,
  canEdit,
  isLoading,
}: {
  workspace: WorkspaceDetail | undefined;
  canEdit: boolean;
  isLoading: boolean;
}) {
  if (isLoading || !workspace) {
    return (
      <div className="space-y-4 p-4" aria-busy="true">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }
  return <DetailsForm key={workspace.id} workspace={workspace} canEdit={canEdit} />;
}

function DetailsForm({ workspace, canEdit }: { workspace: WorkspaceDetail; canEdit: boolean }) {
  const update = useUpdateWorkspace(workspace.id);
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isDirty },
  } = useForm<CreateWorkspaceValues>({
    resolver: zodResolver(createWorkspaceSchema),
    defaultValues: { name: workspace.name },
  });

  const submit = async (values: CreateWorkspaceValues) => {
    try {
      const saved = await update.mutateAsync(values.name);
      reset({ name: saved.name });
      toast.success("Workspace updated.");
    } catch (error) {
      const fields = getApiFieldErrors(error);
      if (fields.name) setError("name", { type: "server", message: fields.name });
      toast.error(workspaceErrorMessage(error));
    }
  };

  return (
    <div className="divide-y divide-border">
      <form onSubmit={handleSubmit(submit)} className="space-y-3 p-4" noValidate>
        <div className="space-y-2">
          <Label htmlFor="settings-workspace-name">Workspace name</Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              id="settings-workspace-name"
              disabled={!canEdit || update.isPending}
              aria-invalid={Boolean(errors.name)}
              className="sm:max-w-sm"
              {...register("name")}
            />
            {canEdit ? (
              <Button type="submit" disabled={!isDirty || update.isPending}>
                {update.isPending ? <SpinnerCustom>Saving…</SpinnerCustom> : "Save changes"}
              </Button>
            ) : null}
          </div>
          {errors.name ? (
            <p role="alert" className="text-xs text-destructive">
              {errors.name.message}
            </p>
          ) : !canEdit ? (
            <p className="text-xs text-muted-foreground">
              Only owners and admins can rename the workspace.
            </p>
          ) : null}
        </div>
      </form>
      <dl className="divide-y divide-border">
        <InfoRow label="Type">{workspace.type === "personal" ? "Personal" : "Team"}</InfoRow>
        <InfoRow label="Owner">
          {workspace.owner.name}
          <span className="ml-2 hidden text-muted-foreground sm:inline">
            {workspace.owner.email}
          </span>
        </InfoRow>
        <InfoRow label="Your role">
          <RoleBadge role={workspace.role} />
        </InfoRow>
        <InfoRow label="Created">{dateFormat.format(new Date(workspace.createdAt))}</InfoRow>
        <InfoRow label="Members">{workspace.memberCount}</InfoRow>
        <InfoRow label="Pending invitations">{workspace.pendingInvitationCount}</InfoRow>
      </dl>
    </div>
  );
}
