import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { Button } from "@/components/ui/button";
import { ProfileSection } from "@/features/profile/components/profile-section";
import { ReadOnlyBadge } from "../components/read-only-badge";
import { WorkspaceDangerZone } from "../components/workspace-danger-zone";
import { WorkspaceDetails } from "../components/workspace-details";
import { useActiveWorkspace, useCan, useWorkspaceDetail } from "../hooks/use-workspaces";
import { canLeaveWorkspace } from "../lib/permissions";

export function WorkspaceSettingsPage() {
  const active = useActiveWorkspace();
  const detail = useWorkspaceDetail(active?.id ?? null);
  const canEdit = useCan("workspace:manage_settings");
  const canTransfer = useCan("workspace:transfer");
  const canDelete = useCan("workspace:delete");
  const workspace = detail.data?.workspace;

  return (
    <DashboardLayout>
      <div className="mx-auto min-w-0 max-w-4xl space-y-10">
        <div className="pf-rise space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-semibold tracking-tight">Workspace</h1>
            {!canEdit ? (
              <ReadOnlyBadge reason="Only owners and admins can change workspace settings." />
            ) : null}
          </div>
          <p className="text-muted-foreground">
            Manage the details of the workspace you are currently working in.
          </p>
        </div>

        {detail.isError ? (
          <div className="rounded-lg border border-border p-6 text-center text-sm">
            <p className="text-muted-foreground">We couldn't load this workspace.</p>
            <Button className="mt-3" variant="outline" onClick={() => void detail.refetch()}>
              Try again
            </Button>
          </div>
        ) : (
          <ProfileSection
            title="General"
            description="Name, ownership and membership summary."
            index={1}
          >
            <WorkspaceDetails
              workspace={workspace}
              canEdit={canEdit}
              isLoading={detail.isLoading}
            />
          </ProfileSection>
        )}

        {workspace ? (
          <ProfileSection
            title="Danger zone"
            description="Actions here affect everyone in the workspace."
            index={2}
          >
            <WorkspaceDangerZone
              workspace={workspace}
              canTransfer={canTransfer}
              canDelete={canDelete}
              canLeave={canLeaveWorkspace(workspace.role, workspace.type)}
            />
          </ProfileSection>
        ) : null}
      </div>
    </DashboardLayout>
  );
}
