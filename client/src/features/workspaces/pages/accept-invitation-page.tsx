import { useEffect, useMemo } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Check, MailWarning, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { PageLoader } from "@/components/common/page-loader";
import { SpinnerCustom } from "@/components/common/loading-spinner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { logout } from "@/features/auth/api/auth.api";
import { useAuthStore } from "@/features/auth/store/auth.store";
import { disconnectMonitorSocket } from "@/features/monitors/realtime/monitor-socket";
import { RoleBadge } from "../components/role-badge";
import { useAcceptInvitation, useInvitationPreview } from "../hooks/use-workspaces";
import {
  buildTokenlessReplacement,
  describeExpiry,
  extractInvitationToken,
  loginRedirectState,
} from "../lib/invitations";
import {
  expectedEmailFromError,
  getWorkspaceErrorCode,
  workspaceErrorMessage,
} from "../lib/messages";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-screen place-items-center bg-muted/30 px-4 py-10">
      <div className="pf-rise w-full max-w-md space-y-6 rounded-xl border border-border bg-background p-6 shadow-sm sm:p-8">
        <p className="text-sm font-semibold tracking-wide">
          FaultLine<span className="text-muted-foreground">.</span>
        </p>
        {children}
      </div>
    </main>
  );
}

function Notice({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3 text-center">
      <div className="mx-auto grid size-12 place-items-center rounded-full bg-muted">{icon}</div>
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      <div className="space-y-4 text-sm text-muted-foreground">{children}</div>
    </div>
  );
}

export function AcceptInvitationPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const status = useAuthStore((state) => state.status);
  const user = useAuthStore((state) => state.user);
  const clearSession = useAuthStore((state) => state.clearSession);
  const accept = useAcceptInvitation();

  const { token, shouldStrip } = useMemo(
    () => extractInvitationToken(location.search, location.state),
    [location.search, location.state],
  );

  useEffect(() => {
    if (token && shouldStrip) {
      const replacement = buildTokenlessReplacement(token);
      navigate(replacement.to, { replace: true, state: replacement.state });
    }
  }, [navigate, shouldStrip, token]);

  const preview = useInvitationPreview(token);

  if (status === "loading") return <PageLoader />;

  if (!token) {
    return (
      <Shell>
        <Notice
          icon={<MailWarning className="size-5" aria-hidden="true" />}
          title="Open your invitation link"
        >
          <p>
            This page needs the link from your invitation email. Open the email and select "Accept
            invitation" again.
          </p>
          <Button asChild variant="outline">
            <Link to="/login">Go to sign in</Link>
          </Button>
        </Notice>
      </Shell>
    );
  }

  if (preview.isLoading) {
    return (
      <Shell>
        <div className="space-y-4" aria-busy="true">
          <Skeleton className="mx-auto size-12 rounded-full" />
          <Skeleton className="mx-auto h-6 w-48" />
          <Skeleton className="h-24 w-full" />
        </div>
      </Shell>
    );
  }

  if (preview.isError || !preview.data) {
    return (
      <Shell>
        <Notice
          icon={<ShieldAlert className="size-5" aria-hidden="true" />}
          title="Invitation unavailable"
        >
          <p>
            This invitation is invalid or has expired. Ask a workspace admin to send you a new one.
          </p>
          <Button asChild variant="outline">
            <Link to={status === "authenticated" ? "/dashboard" : "/login"}>Continue</Link>
          </Button>
        </Notice>
      </Shell>
    );
  }

  const invitation = preview.data;
  const mismatchEmail = accept.isError ? expectedEmailFromError(accept.error) : null;
  const mismatch = accept.isError && getWorkspaceErrorCode(accept.error) === "EMAIL_MISMATCH";
  const invalid = accept.isError && getWorkspaceErrorCode(accept.error) === "INVITATION_INVALID";

  const submit = async () => {
    try {
      const result = await accept.mutateAsync(token);
      toast.success(
        result.alreadyMember
          ? "You're already a member of this workspace."
          : "You joined the workspace.",
      );
      navigate("/dashboard", { replace: true });
    } catch (error) {
      if (!["EMAIL_MISMATCH", "INVITATION_INVALID"].includes(getWorkspaceErrorCode(error) ?? "")) {
        toast.error(workspaceErrorMessage(error));
      }
    }
  };

  const switchAccount = async () => {
    try {
      await logout();
    } catch {
      toast.error("We couldn't sign you out. Please try again.");
      return;
    }
    disconnectMonitorSocket();
    clearSession();
    navigate("/login", { replace: true, state: loginRedirectState(token) });
  };

  if (invalid) {
    return (
      <Shell>
        <Notice
          icon={<ShieldAlert className="size-5" aria-hidden="true" />}
          title="Invitation unavailable"
        >
          <p>
            This invitation is invalid or has expired. Ask a workspace admin to send you a new one.
          </p>
          <Button asChild variant="outline">
            <Link to="/dashboard">Continue</Link>
          </Button>
        </Notice>
      </Shell>
    );
  }

  if (mismatch) {
    return (
      <Shell>
        <Notice
          icon={<MailWarning className="size-5" aria-hidden="true" />}
          title="Different email address"
        >
          <p>
            This invitation was sent to{" "}
            <span className="font-medium text-foreground">
              {mismatchEmail ?? invitation.emailMasked}
            </span>
            , but you're signed in as{" "}
            <span className="font-medium text-foreground">{user?.email}</span>.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Button onClick={() => void switchAccount()}>Sign out and switch account</Button>
            <Button asChild variant="outline">
              <Link to="/dashboard">Not now</Link>
            </Button>
          </div>
        </Notice>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="space-y-2 text-center">
        <div className="mx-auto grid size-12 place-items-center rounded-full bg-muted">
          <Check className="size-5" aria-hidden="true" />
        </div>
        <h1 className="text-xl font-semibold tracking-tight">You're invited to join a workspace</h1>
      </div>
      <dl className="divide-y divide-border rounded-lg border border-border text-sm">
        <div className="flex items-center justify-between gap-4 px-4 py-3">
          <dt className="text-muted-foreground">Workspace</dt>
          <dd className="min-w-0 truncate font-medium">{invitation.workspaceName}</dd>
        </div>
        <div className="flex items-center justify-between gap-4 px-4 py-3">
          <dt className="text-muted-foreground">Invited by</dt>
          <dd className="min-w-0 truncate font-medium">{invitation.inviterName}</dd>
        </div>
        <div className="flex items-center justify-between gap-4 px-4 py-3">
          <dt className="text-muted-foreground">Your role</dt>
          <dd>
            <RoleBadge role={invitation.role} />
          </dd>
        </div>
        <div className="flex items-center justify-between gap-4 px-4 py-3">
          <dt className="text-muted-foreground">Sent to</dt>
          <dd className="min-w-0 truncate font-medium">{invitation.emailMasked}</dd>
        </div>
      </dl>
      <p className="text-center text-xs text-muted-foreground">
        {describeExpiry(invitation.expiresAt)}
      </p>

      {status === "authenticated" ? (
        <div className="space-y-3">
          <p className="text-center text-xs text-muted-foreground">
            Signed in as <span className="font-medium text-foreground">{user?.email}</span>
          </p>
          <Button className="w-full" disabled={accept.isPending} onClick={() => void submit()}>
            {accept.isPending ? <SpinnerCustom>Joining…</SpinnerCustom> : "Accept invitation"}
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-center text-sm text-muted-foreground">
            Sign in with the invited email address to accept.
          </p>
          <Button
            className="w-full"
            onClick={() => navigate("/login", { state: loginRedirectState(token) })}
          >
            Sign in
          </Button>
          <Button
            className="w-full"
            variant="outline"
            onClick={() => navigate("/register", { state: loginRedirectState(token) })}
          >
            Create account
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            New to FaultLine? After you verify your email, open the invitation link again to join.
          </p>
        </div>
      )}
    </Shell>
  );
}
