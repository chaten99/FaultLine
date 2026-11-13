import type { AssignableRole, WorkspaceRole } from "../types/workspace.types";

export const permissions = [
  "workspace:view",
  "monitors:view",
  "monitors:write",
  "incidents:view",
  "incidents:acknowledge",
  "analytics:view",
  "status_pages:view",
  "status_pages:manage",
  "notifications:manage",
  "notifications:preferences",
  "workspace:manage_settings",
  "members:view",
  "members:invite",
  "members:change_role",
  "members:remove",
  "audit:view",
  "workspace:transfer",
  "workspace:delete",
] as const;

export type Permission = (typeof permissions)[number];

const viewer: Permission[] = [
  "workspace:view",
  "monitors:view",
  "incidents:view",
  "analytics:view",
  "status_pages:view",
  "members:view",
  "notifications:preferences",
];

const member: Permission[] = [
  ...viewer,
  "monitors:write",
  "incidents:acknowledge",
  "status_pages:manage",
];

const admin: Permission[] = [
  ...member,
  "notifications:manage",
  "workspace:manage_settings",
  "members:invite",
  "members:change_role",
  "members:remove",
  "audit:view",
];

const owner: Permission[] = [...admin, "workspace:transfer", "workspace:delete"];

export const rolePermissions: Record<WorkspaceRole, readonly Permission[]> = {
  owner,
  admin,
  member,
  viewer,
};

export const roleRank: Record<WorkspaceRole, number> = { viewer: 0, member: 1, admin: 2, owner: 3 };

export const roleLabels: Record<WorkspaceRole, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
  viewer: "Viewer",
};

export const roleDescriptions: Record<WorkspaceRole, string> = {
  owner: "Full control, including transferring ownership and deleting the workspace.",
  admin: "Manage members, invitations, settings and notification integrations.",
  member: "Create and manage monitors, acknowledge incidents and manage status pages.",
  viewer: "Read-only access to monitors, incidents, analytics and status pages.",
};

export const assignableRoles: AssignableRole[] = ["admin", "member", "viewer"];

export const can = (role: WorkspaceRole | null | undefined, permission: Permission): boolean =>
  role ? rolePermissions[role].includes(permission) : false;

export const rolesAssignableBy = (actor: WorkspaceRole | null | undefined): AssignableRole[] =>
  can(actor, "members:invite") || can(actor, "members:change_role") ? assignableRoles : [];

type MemberLike = { role: WorkspaceRole; isOwner: boolean; isSelf: boolean };

export const canChangeMemberRole = (
  actor: WorkspaceRole | null | undefined,
  target: MemberLike,
): boolean => {
  if (!can(actor, "members:change_role")) return false;
  if (target.isOwner || target.role === "owner" || target.isSelf) return false;
  return true;
};

export const canRemoveMember = (
  actor: WorkspaceRole | null | undefined,
  target: MemberLike,
): boolean => {
  if (!can(actor, "members:remove")) return false;
  if (target.isOwner || target.role === "owner" || target.isSelf) return false;
  return true;
};

export const memberActionBlockedReason = (
  actor: WorkspaceRole | null | undefined,
  target: MemberLike,
): string | null => {
  if (target.isOwner || target.role === "owner")
    return "The workspace owner can only be changed by transferring ownership.";
  if (target.isSelf) return "You can't change your own membership here.";
  if (!can(actor, "members:change_role") && !can(actor, "members:remove"))
    return "Only owners and admins can manage members.";
  return null;
};

export const canLeaveWorkspace = (
  role: WorkspaceRole | null | undefined,
  type: "personal" | "team" | undefined,
): boolean => role !== null && role !== undefined && role !== "owner" && type !== "personal";
