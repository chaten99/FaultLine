import { Link } from "react-router-dom";
import { BadgeCheck, CalendarDays, Mail, ShieldAlert } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { buildStatLinks, formatDate } from "../lib/profile-presentation";
import type { ProfileResponse } from "../types/profile.types";
import { ProfileAvatar } from "./profile-avatar";

const statusPagesRouteAvailable = false;

interface IdentityCardProps {
  profile: ProfileResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}

function IdentitySkeleton() {
  return (
    <div className="space-y-6 p-5 sm:p-6" aria-busy="true" aria-label="Loading profile">
      <div className="flex items-center gap-4">
        <Skeleton className="size-20 rounded-full sm:size-24" />
        <div className="min-w-0 flex-1 space-y-3">
          <Skeleton className="h-6 w-48 max-w-full" />
          <Skeleton className="h-4 w-64 max-w-full" />
          <Skeleton className="h-4 w-40 max-w-full" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-20" />
        ))}
      </div>
    </div>
  );
}

export function IdentityCard({ profile, isLoading, isError, onRetry }: IdentityCardProps) {
  if (isLoading) {
    return (
      <div className="rounded-lg border border-border bg-background">
        <IdentitySkeleton />
      </div>
    );
  }

  if (isError || !profile) {
    return (
      <Alert className="flex flex-wrap items-center justify-between gap-3">
        <span>We couldn't load your profile.</span>
        <Button variant="outline" size="sm" onClick={onRetry}>
          Retry
        </Button>
      </Alert>
    );
  }

  const { user, stats } = profile;
  const links = buildStatLinks({ statusPages: statusPagesRouteAvailable });

  return (
    <div className="pf-rise overflow-hidden rounded-lg border border-border bg-background">
      <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:p-6">
        <ProfileAvatar name={user.name} size="lg" />
        <div className="min-w-0 space-y-2">
          <h2 className="truncate text-2xl font-semibold tracking-tight">{user.name}</h2>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <Mail className="size-4 shrink-0" aria-hidden="true" />
              <span className="truncate">{user.email}</span>
            </span>
            {user.emailVerified ? (
              <Badge variant="outline" className="border-emerald-600/30 text-emerald-700">
                <BadgeCheck className="size-3.5" aria-hidden="true" /> Verified
              </Badge>
            ) : (
              <Badge variant="outline" className="border-amber-600/30 text-amber-700">
                <ShieldAlert className="size-3.5" aria-hidden="true" /> Unverified
              </Badge>
            )}
            {!user.emailVerified ? (
              <Link
                to="/verify-email"
                className="font-medium text-foreground underline-offset-4 hover:underline"
              >
                Verify your email
              </Link>
            ) : null}
          </div>
          <p className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
            <CalendarDays className="size-4" aria-hidden="true" />
            Member since {formatDate(user.createdAt)}
          </p>
        </div>
      </div>

      <ul
        aria-label="Account overview"
        className="grid grid-cols-2 gap-px border-t border-border bg-border lg:grid-cols-4"
      >
        {links.map((item) => {
          const value = stats[item.key];
          const content = (
            <>
              <span className="block text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {item.label}
              </span>
              <span className="mt-1 block text-2xl font-semibold tabular-nums">{value}</span>
            </>
          );
          const classes = "block min-h-20 bg-background p-4";
          return (
            <li key={item.key}>
              {item.to ? (
                <Link
                  to={item.to}
                  className={cn(
                    classes,
                    "pf-lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  )}
                >
                  {content}
                </Link>
              ) : (
                <div className={classes}>{content}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
