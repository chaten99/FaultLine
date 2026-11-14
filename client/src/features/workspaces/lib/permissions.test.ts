import { describe, expect, it } from "vitest";
import {
  assignableRoles,
  can,
  canChangeMemberRole,
  canLeaveWorkspace,
  canRemoveMember,
  memberActionBlockedReason,
  permissions,
  rolePermissions,
  rolesAssignableBy,
  type Permission,
} from "./permissions";
import type { WorkspaceRole } from "../types/workspace.types";

const matrix: Record<
  Permission,
  { owner: boolean; admin: boolean; member: boolean; viewer: boolean }
> = {
  "workspace:view": { owner: true, admin: true, member: true, viewer: true },
  "monitors:view": { owner: true, admin: true, member: true, viewer: true },
  "monitors:write": { owner: true, admin: true, member: true, viewer: false },
  "incidents:view": { owner: true, admin: true, member: true, viewer: true },
  "incidents:acknowledge": { owner: true, admin: true, member: true, viewer: false },
  "analytics:view": { owner: true, admin: true, member: true, viewer: true },
  "status_pages:view": { owner: true, admin: true, member: true, viewer: true },
  "status_pages:manage": { owner: true, admin: true, member: true, viewer: false },
  "notifications:manage": { owner: true, admin: true, member: false, viewer: false },
  "notifications:preferences": { owner: true, admin: true, member: true, viewer: true },
  "workspace:manage_settings": { owner: true, admin: true, member: false, viewer: false },
  "members:view": { owner: true, admin: true, member: true, viewer: true },
  "members:invite": { owner: true, admin: true, member: false, viewer: false },
  "members:change_role": { owner: true, admin: true, member: false, viewer: false },
  "members:remove": { owner: true, admin: true, member: false, viewer: false },
  "audit:view": { owner: true, admin: true, member: false, viewer: false },
  "workspace:transfer": { owner: true, admin: false, member: false, viewer: false },
  "workspace:delete": { owner: true, admin: false, member: false, viewer: false },
};

describe("permission matrix", () => {
  it("covers every permission in the table", () => {
    expect(Object.keys(matrix).sort()).toEqual([...permissions].sort());
  });

  it.each(permissions)("matches the documented role table for %s", (permission) => {
    for (const role of ["owner", "admin", "member", "viewer"] as WorkspaceRole[]) {
      expect(can(role, permission), `${role} ${permission}`).toBe(matrix[permission][role]);
    }
  });

  it("keeps viewers read-only", () => {
    const writes = rolePermissions.viewer.filter(
      (permission) => !/:view$|notifications:preferences/.test(permission),
    );
    expect(writes).toEqual([]);
  });

  it("denies everything when there is no role", () => {
    expect(can(null, "workspace:view")).toBe(false);
    expect(can(undefined, "monitors:write")).toBe(false);
  });

  it("never lets owner-only powers leak to admins", () => {
    expect(can("admin", "workspace:transfer")).toBe(false);
    expect(can("admin", "workspace:delete")).toBe(false);
  });
});

describe("role assignment rules", () => {
  it("never offers the owner role", () => {
    expect(assignableRoles).toEqual(["admin", "member", "viewer"]);
    expect(rolesAssignableBy("owner")).not.toContain("owner" as never);
    expect(rolesAssignableBy("admin")).not.toContain("owner" as never);
  });

  it("offers no roles to members and viewers", () => {
    expect(rolesAssignableBy("member")).toEqual([]);
    expect(rolesAssignableBy("viewer")).toEqual([]);
  });
});

describe("member management rules", () => {
  const target = (role: WorkspaceRole, overrides = {}) => ({
    role,
    isOwner: role === "owner",
    isSelf: false,
    ...overrides,
  });

  it("lets owners and admins manage non-owner members", () => {
    for (const actor of ["owner", "admin"] as const) {
      expect(canChangeMemberRole(actor, target("member"))).toBe(true);
      expect(canRemoveMember(actor, target("viewer"))).toBe(true);
    }
  });

  it("never allows touching the owner", () => {
    for (const actor of ["owner", "admin"] as const) {
      expect(canChangeMemberRole(actor, target("owner"))).toBe(false);
      expect(canRemoveMember(actor, target("owner"))).toBe(false);
    }
    expect(memberActionBlockedReason("admin", target("owner"))).toMatch(/transferring ownership/);
  });

  it("blocks self-service changes and unauthorized roles", () => {
    expect(canChangeMemberRole("admin", target("member", { isSelf: true }))).toBe(false);
    expect(canRemoveMember("admin", target("member", { isSelf: true }))).toBe(false);
    expect(canChangeMemberRole("member", target("viewer"))).toBe(false);
    expect(canRemoveMember("viewer", target("viewer"))).toBe(false);
    expect(memberActionBlockedReason("member", target("viewer"))).toMatch(/owners and admins/);
  });

  it("returns no blocked reason for allowed targets", () => {
    expect(memberActionBlockedReason("owner", target("admin"))).toBeNull();
  });
});

describe("leaving a workspace", () => {
  it("is available to non-owners of team workspaces only", () => {
    expect(canLeaveWorkspace("member", "team")).toBe(true);
    expect(canLeaveWorkspace("admin", "team")).toBe(true);
    expect(canLeaveWorkspace("owner", "team")).toBe(false);
    expect(canLeaveWorkspace("member", "personal")).toBe(false);
    expect(canLeaveWorkspace(null, "team")).toBe(false);
  });
});
