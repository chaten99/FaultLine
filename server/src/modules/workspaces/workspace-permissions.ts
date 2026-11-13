import type { WorkspaceRole } from "./workspace.types.js";

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

export const can = (role: WorkspaceRole, permission: Permission): boolean =>
  rolePermissions[role].includes(permission);

export const roleRank: Record<WorkspaceRole, number> = { viewer: 0, member: 1, admin: 2, owner: 3 };

export const roleDescriptions: Record<WorkspaceRole, string> = {
  owner: "Full control, including transferring ownership and deleting the workspace.",
  admin: "Manage members, invitations, settings and notification integrations.",
  member: "Create and manage monitors, acknowledge incidents and manage status pages.",
  viewer: "Read-only access to monitors, incidents, analytics and status pages.",
};
