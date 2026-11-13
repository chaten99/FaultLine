import { useState } from "react";
import { Mail, RefreshCw, XCircle } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useInvitations, useResendInvitation, useRevokeInvitation } from "../hooks/use-workspaces";
import {
  canResendInvitation,
  canRevokeInvitation,
  describeExpiry,
  effectiveInvitationStatus,
  invitationStatusLabels,
} from "../lib/invitations";
import { workspaceErrorMessage } from "../lib/messages";
import { roleLabels } from "../lib/permissions";
import type { Invitation } from "../types/workspace.types";

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

export function InvitationsSection({
  workspaceId,
  canManage,
}: {
  workspaceId: string;
  canManage: boolean;
}) {
  const invitations = useInvitations(workspaceId, canManage);
  const resend = useResendInvitation(workspaceId);
  const revoke = useRevokeInvitation(workspaceId);
  const [revoking, setRevoking] = useState<Invitation | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const visible = (invitations.data ?? []).filter((invitation) => {
    const status = effectiveInvitationStatus(invitation);
    return status === "pending" || status === "expired";
  });

  const doResend = async (invitation: Invitation) => {
    setBusyId(invitation.id);
    try {
      await resend.mutateAsync(invitation.id);
      toast.success(`Invitation resent to ${invitation.email}.`);
    } catch (error) {
      toast.error(workspaceErrorMessage(error));
    } finally {
      setBusyId(null);
    }
  };

  const doRevoke = async () => {
    if (!revoking) return;
    try {
      await revoke.mutateAsync(revoking.id);
      toast.success(`Invitation for ${revoking.email} was revoked.`);
      setRevoking(null);
    } catch (error) {
      toast.error(workspaceErrorMessage(error));
    }
  };

  if (invitations.isLoading) {
    return (
      <div className="space-y-3 p-4" aria-busy="true">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }
  if (invitations.isError) {
    return (
      <div className="p-6 text-center text-sm">
        <p className="text-muted-foreground">We couldn't load invitations.</p>
        <Button className="mt-3" variant="outline" onClick={() => void invitations.refetch()}>
          Try again
        </Button>
      </div>
    );
  }
  if (visible.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 p-8 text-center">
        <Mail className="size-6 text-muted-foreground" aria-hidden="true" />
        <p className="text-sm font-medium">No pending invitations</p>
        <p className="text-sm text-muted-foreground">
          Invited teammates will appear here until they join.
        </p>
      </div>
    );
  }

  return (
    <>
      <ul className="divide-y divide-border">
        {visible.map((invitation) => {
          const status = effectiveInvitationStatus(invitation);
          const busy = busyId === invitation.id;
          return (
            <li key={invitation.id} className="flex flex-col gap-3 p-4 md:flex-row md:items-center">
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-sm font-medium">{invitation.email}</p>
                  <Badge variant="outline">{roleLabels[invitation.role]}</Badge>
                  <Badge
                    variant="outline"
                    className={cn(status === "expired" && "border-destructive/40 text-destructive")}
                  >
                    {invitationStatusLabels[status]}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Invited by {invitation.invitedBy.name} · Sent{" "}
                  {dateFormat.format(new Date(invitation.lastSentAt))} ·{" "}
                  {describeExpiry(invitation.expiresAt)}
                </p>
              </div>
              {canManage ? (
                <div className="flex shrink-0 gap-2">
                  {canResendInvitation(status) ? (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() => void doResend(invitation)}
                      className="gap-2"
                    >
                      {busy ? (
                        <SpinnerCustom>Sending…</SpinnerCustom>
                      ) : (
                        <>
                          <RefreshCw className="size-4" /> Resend
                        </>
                      )}
                    </Button>
                  ) : null}
                  {canRevokeInvitation(status) ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setRevoking(invitation)}
                      className="gap-2 text-destructive"
                    >
                      <XCircle className="size-4" /> Revoke
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      <AlertDialog
        open={revoking !== null}
        onOpenChange={(next) => (!next && !revoke.isPending ? setRevoking(null) : undefined)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke this invitation?</AlertDialogTitle>
            <AlertDialogDescription>
              The link sent to {revoking?.email} will stop working immediately. You can send a new
              invitation later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revoke.isPending}>Keep invitation</AlertDialogCancel>
            <AlertDialogAction
              disabled={revoke.isPending}
              onClick={(event) => {
                event.preventDefault();
                void doRevoke();
              }}
            >
              {revoke.isPending ? <SpinnerCustom>Revoking…</SpinnerCustom> : "Revoke invitation"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
