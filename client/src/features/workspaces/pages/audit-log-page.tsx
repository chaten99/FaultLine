import { useState } from "react";
import { ChevronLeft, ChevronRight, ScrollText } from "lucide-react";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ProfileSection } from "@/features/profile/components/profile-section";
import { useActiveWorkspace, useAuditLog, useCan } from "../hooks/use-workspaces";
import { auditEventLabels, auditEventTypes, describeAuditEvent } from "../lib/audit";
import type { AuditEventType } from "../types/workspace.types";

const timeFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

export function AuditLogPage() {
  const workspace = useActiveWorkspace();
  const allowed = useCan("audit:view");
  const [page, setPage] = useState(1);
  const [type, setType] = useState("all");
  const audit = useAuditLog(allowed ? (workspace?.id ?? null) : null, page, type);

  if (!allowed) {
    return (
      <DashboardLayout>
        <div className="mx-auto max-w-2xl rounded-lg border border-border p-8 text-center">
          <ScrollText className="mx-auto size-6 text-muted-foreground" aria-hidden="true" />
          <h1 className="mt-3 text-lg font-semibold">Audit log</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Only workspace owners and admins can view the audit log.
          </p>
        </div>
      </DashboardLayout>
    );
  }

  const data = audit.data;

  return (
    <DashboardLayout>
      <div className="mx-auto min-w-0 max-w-4xl space-y-10">
        <div className="pf-rise space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">Audit log</h1>
          <p className="text-muted-foreground">
            A permanent record of team and permission changes in{" "}
            {workspace?.name ?? "this workspace"}.
          </p>
        </div>

        <ProfileSection
          title="Activity"
          description="Newest events first. Entries can't be edited or deleted."
          index={1}
          action={
            <Select
              value={type}
              onValueChange={(value) => {
                setType(value);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-full sm:w-56" aria-label="Filter by event type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All events</SelectItem>
                {auditEventTypes.map((option) => (
                  <SelectItem key={option} value={option}>
                    {auditEventLabels[option]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
        >
          {audit.isLoading ? (
            <div className="space-y-3 p-4" aria-busy="true">
              {Array.from({ length: 5 }, (_, index) => (
                <Skeleton key={index} className="h-12 w-full" />
              ))}
            </div>
          ) : audit.isError ? (
            <div className="p-6 text-center text-sm">
              <p className="text-muted-foreground">We couldn't load the audit log.</p>
              <Button className="mt-3" variant="outline" onClick={() => void audit.refetch()}>
                Try again
              </Button>
            </div>
          ) : !data || data.items.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">No events recorded yet.</p>
          ) : (
            <>
              <ol className="divide-y divide-border">
                {data.items.map((event) => (
                  <li
                    key={event.id}
                    className="flex flex-col gap-1 p-4 sm:flex-row sm:items-center sm:gap-4"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="text-sm">{describeAuditEvent(event)}</p>
                      <Badge variant="outline" className="text-muted-foreground">
                        {auditEventLabels[event.type as AuditEventType]}
                      </Badge>
                    </div>
                    <time
                      dateTime={event.createdAt}
                      className="shrink-0 text-xs text-muted-foreground"
                    >
                      {timeFormat.format(new Date(event.createdAt))}
                    </time>
                  </li>
                ))}
              </ol>
              <div className="flex items-center justify-between border-t border-border p-3">
                <p className="text-xs text-muted-foreground">
                  Page {data.page} of {data.totalPages} · {data.total} events
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1 || audit.isFetching}
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                    aria-label="Previous page"
                  >
                    <ChevronLeft className="size-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= data.totalPages || audit.isFetching}
                    onClick={() => setPage((current) => current + 1)}
                    aria-label="Next page"
                  >
                    <ChevronRight className="size-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </ProfileSection>
      </div>
    </DashboardLayout>
  );
}
