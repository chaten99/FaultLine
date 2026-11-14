import { MoreHorizontal, ShieldCheck, Trash2, UserCog } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ProfileAvatar } from "@/features/profile/components/profile-avatar";
import {
  canChangeMemberRole,
  canRemoveMember,
  memberActionBlockedReason,
} from "../lib/permissions";
import type { WorkspaceMember, WorkspaceRole } from "../types/workspace.types";
import { RoleBadge } from "./role-badge";

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

function MemberActions({
  member,
  actorRole,
  onChangeRole,
  onRemove,
}: {
  member: WorkspaceMember;
  actorRole: WorkspaceRole | null;
  onChangeRole: (member: WorkspaceMember) => void;
  onRemove: (member: WorkspaceMember) => void;
}) {
  const canChange = canChangeMemberRole(actorRole, member);
  const canRemove = canRemoveMember(actorRole, member);
  const reason = memberActionBlockedReason(actorRole, member);

  if (!canChange && !canRemove) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex size-9 items-center justify-center text-muted-foreground">
            <ShieldCheck className="size-4" aria-label={reason ?? "No actions available"} />
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-60">{reason ?? "No actions available."}</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-9 text-muted-foreground"
          aria-label={`Actions for ${member.name}`}
        >
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {canChange ? (
          <DropdownMenuItem
            className="min-h-10 cursor-pointer gap-2"
            onSelect={() => onChangeRole(member)}
          >
            <UserCog className="size-4" aria-hidden="true" /> Change role
          </DropdownMenuItem>
        ) : null}
        {canChange && canRemove ? <DropdownMenuSeparator /> : null}
        {canRemove ? (
          <DropdownMenuItem
            className="min-h-10 cursor-pointer gap-2 text-destructive focus:text-destructive"
            onSelect={() => onRemove(member)}
          >
            <Trash2 className="size-4" aria-hidden="true" /> Remove member
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function MembersTable({
  members,
  isLoading,
  actorRole,
  onChangeRole,
  onRemove,
}: {
  members: WorkspaceMember[] | undefined;
  isLoading: boolean;
  actorRole: WorkspaceRole | null;
  onChangeRole: (member: WorkspaceMember) => void;
  onRemove: (member: WorkspaceMember) => void;
}) {
  if (isLoading) {
    return (
      <div className="space-y-3 p-4" aria-busy="true">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-14 w-full" />
        ))}
      </div>
    );
  }
  if (!members || members.length === 0) {
    return <p className="p-6 text-center text-sm text-muted-foreground">No members yet.</p>;
  }

  return (
    <>
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Member</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-16 text-right">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((member) => (
              <TableRow key={member.id}>
                <TableCell>
                  <div className="flex min-w-0 items-center gap-3">
                    <ProfileAvatar name={member.name} size="sm" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {member.name}
                        {member.isSelf ? (
                          <span className="ml-2 text-xs font-normal text-muted-foreground">
                            (you)
                          </span>
                        ) : null}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">{member.email}</p>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <RoleBadge role={member.role} />
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {dateFormat.format(new Date(member.joinedAt))}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="capitalize">
                    {member.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <MemberActions
                    member={member}
                    actorRole={actorRole}
                    onChangeRole={onChangeRole}
                    onRemove={onRemove}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ul className="divide-y divide-border md:hidden">
        {members.map((member) => (
          <li key={member.id} className="flex items-center gap-3 p-4">
            <ProfileAvatar name={member.name} size="md" />
            <div className="min-w-0 flex-1 space-y-1">
              <p className="truncate text-sm font-medium">
                {member.name}
                {member.isSelf ? (
                  <span className="ml-2 text-xs font-normal text-muted-foreground">(you)</span>
                ) : null}
              </p>
              <p className="truncate text-xs text-muted-foreground">{member.email}</p>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <RoleBadge role={member.role} />
                <span className="text-xs text-muted-foreground">
                  Joined {dateFormat.format(new Date(member.joinedAt))}
                </span>
              </div>
            </div>
            <MemberActions
              member={member}
              actorRole={actorRole}
              onChangeRole={onChangeRole}
              onRemove={onRemove}
            />
          </li>
        ))}
      </ul>
    </>
  );
}
