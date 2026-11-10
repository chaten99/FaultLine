import { useState } from "react";
import { CheckCircle2, Laptop, LogOut, Smartphone } from "lucide-react";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getApiErrorMessage } from "@/lib/api-error";
import {
  countOtherSessions,
  formatDateTime,
  formatRelativeTime,
  sessionLabel,
  sortSessions,
} from "../lib/profile-presentation";
import {
  profileKeys,
  useLocalSignOut,
  useRevokeOtherSessions,
  useRevokeSession,
  useSessions,
} from "../hooks/use-profile";
import { useQueryClient } from "@tanstack/react-query";
import type { AccountSession } from "../types/profile.types";
import { ProfileSection } from "./profile-section";

const leaveDurationMs = 260;

const isMobileDevice = (device: string) => /mobile|iphone|android|ipad/i.test(device);

function SessionsSkeleton() {
  return (
    <div className="divide-y divide-border" aria-busy="true" aria-label="Loading sessions">
      {Array.from({ length: 2 }, (_, index) => (
        <div key={index} className="flex items-center gap-4 p-4 sm:p-5">
          <Skeleton className="size-10 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-48 max-w-full" />
            <Skeleton className="h-3 w-64 max-w-full" />
          </div>
          <Skeleton className="h-9 w-20" />
        </div>
      ))}
    </div>
  );
}

interface SessionRowProps {
  session: AccountSession;
  leaving: boolean;
  pending: boolean;
  onRevoke: (session: AccountSession) => void;
}

function SessionRow({ session, leaving, pending, onRevoke }: SessionRowProps) {
  const Icon = isMobileDevice(session.device) ? Smartphone : Laptop;
  return (
    <li className="pf-collapse" data-leaving={leaving}>
      <div>
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-4 sm:p-5">
          <div className="flex min-w-0 flex-1 items-start gap-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
              <Icon className="size-5" aria-hidden="true" />
            </span>
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate font-medium">{session.device || "Unknown device"}</p>
                {session.current ? (
                  <Badge variant="outline" className="border-emerald-600/30 text-emerald-700">
                    <CheckCircle2 className="size-3.5" aria-hidden="true" /> This device
                  </Badge>
                ) : null}
              </div>
              <p className="text-sm text-muted-foreground">
                <span title={formatDateTime(session.createdAt)}>
                  Signed in {formatRelativeTime(session.createdAt)}
                </span>
                <span aria-hidden="true"> · </span>
                <span title={formatDateTime(session.lastActiveAt)}>
                  Last active {formatRelativeTime(session.lastActiveAt)}
                </span>
              </p>
            </div>
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="min-h-10 self-start sm:self-center"
                disabled={pending}
                aria-label={`${session.current ? "Sign out of" : "Revoke"} ${sessionLabel(session)}`}
              >
                {pending ? (
                  <SpinnerCustom>Revoking…</SpinnerCustom>
                ) : session.current ? (
                  "Sign out"
                ) : (
                  "Revoke"
                )}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {session.current ? "Sign out of this device?" : "Revoke this session?"}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {session.current
                    ? "You will be signed out of FaultLine on this device and returned to the sign-in page."
                    : `${session.device || "This device"} will be signed out and must sign in again to continue.`}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => onRevoke(session)}>
                  {session.current ? "Sign out" : "Revoke session"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </li>
  );
}

export function SessionsSection({ index = 0 }: { index?: number }) {
  const queryClient = useQueryClient();
  const sessions = useSessions();
  const revoke = useRevokeSession();
  const revokeOthers = useRevokeOtherSessions();
  const signOutLocally = useLocalSignOut();
  const [leaving, setLeaving] = useState<string[]>([]);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const items = sortSessions(sessions.data ?? []);
  const others = countOtherSessions(items);

  const handleRevoke = async (session: AccountSession) => {
    setPendingId(session.id);
    try {
      const result = await revoke.mutateAsync(session.id);
      if (result.current || session.current) {
        toast.success("Signed out of this device.");
        signOutLocally();
        return;
      }
      setLeaving((previous) => [...previous, session.id]);
      toast.success("Session revoked.");
      window.setTimeout(() => {
        setLeaving((previous) => previous.filter((id) => id !== session.id));
        void queryClient.invalidateQueries({ queryKey: profileKeys.sessions });
      }, leaveDurationMs);
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setPendingId(null);
    }
  };

  const handleRevokeOthers = async () => {
    try {
      const result = await revokeOthers.mutateAsync();
      toast.success(
        result.revoked === 1
          ? "Signed out 1 other device."
          : `Signed out ${result.revoked} other devices.`,
      );
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    }
  };

  return (
    <ProfileSection
      title="Active sessions"
      description="Devices where you're currently signed in to FaultLine."
      index={index}
      action={
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="outline"
              className="min-h-10"
              disabled={others === 0 || revokeOthers.isPending}
            >
              {revokeOthers.isPending ? (
                <SpinnerCustom>Signing out…</SpinnerCustom>
              ) : (
                <>
                  <LogOut className="size-4" aria-hidden="true" /> Sign out other devices
                </>
              )}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Sign out other devices?</AlertDialogTitle>
              <AlertDialogDescription>
                {others === 1 ? "1 other device" : `${others} other devices`} will be signed out
                immediately. This device stays signed in.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => void handleRevokeOthers()}>
                Sign out other devices
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      }
    >
      {sessions.isLoading ? (
        <SessionsSkeleton />
      ) : sessions.isError ? (
        <div className="p-4 sm:p-5">
          <Alert className="flex flex-wrap items-center justify-between gap-3">
            <span>We couldn't load your sessions.</span>
            <Button variant="outline" size="sm" onClick={() => void sessions.refetch()}>
              Retry
            </Button>
          </Alert>
        </div>
      ) : items.length === 0 ? (
        <p className="p-5 text-sm text-muted-foreground">No active sessions found.</p>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((session) => (
            <SessionRow
              key={session.id}
              session={session}
              leaving={leaving.includes(session.id)}
              pending={pendingId === session.id}
              onRevoke={(target) => void handleRevoke(target)}
            />
          ))}
        </ul>
      )}
    </ProfileSection>
  );
}
