import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { UserPlus } from "lucide-react";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { Button } from "@/components/ui/button";
import { ProfileSection } from "@/features/profile/components/profile-section";
import { InvitationsSection } from "../components/invitations-section";
import { InviteMemberDialog } from "../components/invite-member-dialog";
import { ChangeRoleDialog, RemoveMemberDialog } from "../components/member-dialogs";
import { MembersTable } from "../components/members-table";
import { ReadOnlyBadge } from "../components/read-only-badge";
import { useActiveRole, useActiveWorkspace, useCan, useMembers } from "../hooks/use-workspaces";
import type { WorkspaceMember } from "../types/workspace.types";

export function MembersPage() {
  const workspace = useActiveWorkspace();
  const role = useActiveRole();
  const canInvite = useCan("members:invite");
  const members = useMembers(workspace?.id ?? null);
  const [params, setParams] = useSearchParams();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [changing, setChanging] = useState<WorkspaceMember | null>(null);
  const [removing, setRemoving] = useState<WorkspaceMember | null>(null);

  useEffect(() => {
    if (params.get("invite") === "1" && canInvite) {
      setInviteOpen(true);
      const next = new URLSearchParams(params);
      next.delete("invite");
      setParams(next, { replace: true });
    }
  }, [canInvite, params, setParams]);

  return (
    <DashboardLayout>
      <div className="mx-auto min-w-0 max-w-4xl space-y-10">
        <div className="pf-rise flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-semibold tracking-tight">Members</h1>
              {!canInvite ? (
                <ReadOnlyBadge reason="Only owners and admins can manage members." />
              ) : null}
            </div>
            <p className="text-muted-foreground">
              People who can access {workspace?.name ?? "this workspace"} and what they can do.
            </p>
          </div>
          {canInvite && workspace ? (
            <Button className="shrink-0 gap-2" onClick={() => setInviteOpen(true)}>
              <UserPlus className="size-4" /> Invite member
            </Button>
          ) : null}
        </div>

        {members.isError ? (
          <div className="rounded-lg border border-border p-6 text-center text-sm">
            <p className="text-muted-foreground">We couldn't load the member list.</p>
            <Button className="mt-3" variant="outline" onClick={() => void members.refetch()}>
              Try again
            </Button>
          </div>
        ) : (
          <ProfileSection
            title="Team members"
            description="Roles control what each person can change."
            index={1}
          >
            <MembersTable
              members={members.data}
              isLoading={members.isLoading}
              actorRole={role}
              onChangeRole={setChanging}
              onRemove={setRemoving}
            />
          </ProfileSection>
        )}

        {workspace && canInvite ? (
          <ProfileSection
            title="Invitations"
            description="Pending and expired invitations that haven't been accepted."
            index={2}
          >
            <InvitationsSection workspaceId={workspace.id} canManage={canInvite} />
          </ProfileSection>
        ) : null}
      </div>

      {workspace ? (
        <>
          <InviteMemberDialog
            workspaceId={workspace.id}
            open={inviteOpen}
            onOpenChange={setInviteOpen}
          />
          <ChangeRoleDialog
            workspaceId={workspace.id}
            member={changing}
            onClose={() => setChanging(null)}
          />
          <RemoveMemberDialog
            workspaceId={workspace.id}
            member={removing}
            onClose={() => setRemoving(null)}
          />
        </>
      ) : null}
    </DashboardLayout>
  );
}
