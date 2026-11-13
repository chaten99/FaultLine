import { useState } from "react";
import { toast } from "sonner";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useChangeMemberRole, useRemoveMember } from "../hooks/use-workspaces";
import { workspaceErrorMessage } from "../lib/messages";
import { assignableRoles, roleDescriptions, roleLabels } from "../lib/permissions";
import type { AssignableRole, WorkspaceMember } from "../types/workspace.types";
import { RoleBadge } from "./role-badge";

export function ChangeRoleDialog({
  workspaceId,
  member,
  onClose,
}: {
  workspaceId: string;
  member: WorkspaceMember | null;
  onClose: () => void;
}) {
  const change = useChangeMemberRole(workspaceId);
  const [selected, setSelected] = useState<AssignableRole | null>(null);
  const current = member?.role === "owner" ? null : (member?.role as AssignableRole | undefined);
  const role = selected ?? current ?? "member";

  const close = () => {
    if (change.isPending) return;
    setSelected(null);
    onClose();
  };

  const save = async () => {
    if (!member) return;
    try {
      await change.mutateAsync({ memberId: member.id, role });
      toast.success(`${member.name} is now ${roleLabels[role]}.`);
      setSelected(null);
      onClose();
    } catch (error) {
      toast.error(workspaceErrorMessage(error));
    }
  };

  return (
    <Dialog open={member !== null} onOpenChange={(next) => (!next ? close() : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change role</DialogTitle>
          <DialogDescription>
            Update what {member?.name ?? "this member"} can do in this workspace. The change applies
            immediately.
          </DialogDescription>
        </DialogHeader>
        {member ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{member.name}</p>
                <p className="truncate text-xs text-muted-foreground">{member.email}</p>
              </div>
              <RoleBadge role={member.role} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="change-role">New role</Label>
              <Select value={role} onValueChange={(value) => setSelected(value as AssignableRole)}>
                <SelectTrigger id="change-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {assignableRoles.map((option) => (
                    <SelectItem key={option} value={option}>
                      {roleLabels[option]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{roleDescriptions[role]}</p>
              <p className="text-xs text-muted-foreground">
                Only the owner can transfer ownership; it can't be granted from here.
              </p>
            </div>
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="outline" disabled={change.isPending} onClick={close}>
            Cancel
          </Button>
          <Button disabled={change.isPending || role === current} onClick={() => void save()}>
            {change.isPending ? <SpinnerCustom>Saving…</SpinnerCustom> : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RemoveMemberDialog({
  workspaceId,
  member,
  onClose,
}: {
  workspaceId: string;
  member: WorkspaceMember | null;
  onClose: () => void;
}) {
  const remove = useRemoveMember(workspaceId);

  const confirm = async () => {
    if (!member) return;
    try {
      await remove.mutateAsync(member.id);
      toast.success(`${member.name} was removed from the workspace.`);
      onClose();
    } catch (error) {
      toast.error(workspaceErrorMessage(error));
    }
  };

  return (
    <AlertDialog
      open={member !== null}
      onOpenChange={(next) => (!next && !remove.isPending ? onClose() : undefined)}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove {member?.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            They will immediately lose access to this workspace's monitors, incidents and settings,
            including in any open sessions. Their past activity stays in the audit log. You can
            invite them again later.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={remove.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={remove.isPending}
            onClick={(event) => {
              event.preventDefault();
              void confirm();
            }}
          >
            {remove.isPending ? <SpinnerCustom>Removing…</SpinnerCustom> : "Remove member"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
