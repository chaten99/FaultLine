import { Types } from "mongoose";
import { beforeEach, describe, expect, it } from "vitest";
import { User } from "../src/modules/auth/user.model.js";
import {
  can,
  permissions,
  roleRank,
  rolePermissions,
  type Permission,
} from "../src/modules/workspaces/workspace-permissions.js";
import {
  effectiveRole,
  ensurePersonalWorkspace,
  listUserWorkspaces,
  resolveWorkspaceContext,
  slugify,
} from "../src/modules/workspaces/workspace-core.service.js";
import type { WorkspaceRole } from "../src/modules/workspaces/workspace.types.js";
import { bindMemoryModel } from "./helpers/memory-model.js";
import {
  bindWorkspaceModels,
  resetWorkspaceModels,
  seedWorkspace,
} from "./helpers/workspace-fixtures.js";

const specTable: Record<string, Record<WorkspaceRole, boolean>> = {
  "workspace:view": { owner: true, admin: true, member: true, viewer: true },
  "monitors:view": { owner: true, admin: true, member: true, viewer: true },
  "monitors:write": { owner: true, admin: true, member: true, viewer: false },
  "incidents:view": { owner: true, admin: true, member: true, viewer: true },
  "incidents:acknowledge": { owner: true, admin: true, member: true, viewer: false },
  "notifications:manage": { owner: true, admin: true, member: false, viewer: false },
  "status_pages:manage": { owner: true, admin: true, member: true, viewer: false },
  "workspace:manage_settings": { owner: true, admin: true, member: false, viewer: false },
  "members:invite": { owner: true, admin: true, member: false, viewer: false },
  "members:change_role": { owner: true, admin: true, member: false, viewer: false },
  "members:remove": { owner: true, admin: true, member: false, viewer: false },
  "workspace:transfer": { owner: true, admin: false, member: false, viewer: false },
  "workspace:delete": { owner: true, admin: false, member: false, viewer: false },
};

const stores = bindWorkspaceModels();

describe("permission matrix", () => {
  const roles: WorkspaceRole[] = ["owner", "admin", "member", "viewer"];

  it.each(Object.entries(specTable))("matches the spec for %s", (permission, expected) => {
    for (const role of roles) {
      expect(can(role, permission as Permission), `${role} ${permission}`).toBe(expected[role]);
    }
  });

  it("keeps viewers strictly read-only", () => {
    const writes = permissions.filter((permission) => !/(:view|:preferences)$/.test(permission));
    for (const permission of writes) expect(can("viewer", permission), permission).toBe(false);
  });

  it("grants each higher role a superset of the lower role", () => {
    const order: WorkspaceRole[] = ["viewer", "member", "admin", "owner"];
    for (let index = 1; index < order.length; index += 1) {
      const lower = new Set(rolePermissions[order[index - 1] as WorkspaceRole]);
      for (const permission of lower) {
        expect(can(order[index] as WorkspaceRole, permission)).toBe(true);
      }
    }
    expect(roleRank.owner).toBeGreaterThan(roleRank.admin);
  });

  it("reserves ownership operations to the owner", () => {
    for (const role of ["admin", "member", "viewer"] as const) {
      expect(can(role, "workspace:transfer")).toBe(false);
      expect(can(role, "workspace:delete")).toBe(false);
    }
  });

  it("only owners and admins can see the audit log and manage integrations", () => {
    expect(can("member", "audit:view")).toBe(false);
    expect(can("viewer", "audit:view")).toBe(false);
    expect(can("admin", "audit:view")).toBe(true);
    expect(can("member", "notifications:manage")).toBe(false);
  });
});

describe("effective roles", () => {
  const ownerId = new Types.ObjectId();
  const other = new Types.ObjectId();

  it("treats workspace.ownerId as the single source of truth", () => {
    expect(effectiveRole({ ownerId }, { userId: ownerId, role: "admin" })).toBe("owner");
    expect(effectiveRole({ ownerId }, { userId: other, role: "owner" })).toBe("admin");
    expect(effectiveRole({ ownerId }, { userId: other, role: "viewer" })).toBe("viewer");
  });
});

describe("membership resolution", () => {
  const owner = new Types.ObjectId();
  const member = new Types.ObjectId();
  const viewer = new Types.ObjectId();
  const outsider = new Types.ObjectId();

  beforeEach(() => resetWorkspaceModels(stores));

  it("returns the role only for active members of active workspaces", async () => {
    const id = seedWorkspace(stores, {
      ownerId: owner,
      members: [
        { userId: member, role: "member" },
        { userId: viewer, role: "viewer" },
      ],
    });
    expect((await resolveWorkspaceContext(String(owner), String(id)))?.role).toBe("owner");
    expect((await resolveWorkspaceContext(String(member), String(id)))?.role).toBe("member");
    expect((await resolveWorkspaceContext(String(viewer), String(id)))?.role).toBe("viewer");
    expect(await resolveWorkspaceContext(String(outsider), String(id))).toBeNull();
  });

  it("denies removed members and deleted workspaces immediately", async () => {
    const id = seedWorkspace(stores, {
      ownerId: owner,
      members: [{ userId: member, role: "member" }],
    });
    stores.members.docs.find((doc) => String(doc.userId) === String(member))!.status = "removed";
    expect(await resolveWorkspaceContext(String(member), String(id))).toBeNull();
    stores.workspaces.docs[0]!.status = "deleted";
    expect(await resolveWorkspaceContext(String(owner), String(id))).toBeNull();
  });

  it("rejects malformed workspace ids without touching the database", async () => {
    expect(await resolveWorkspaceContext(String(owner), "nope")).toBeNull();
    expect(await resolveWorkspaceContext(String(owner), "../etc")).toBeNull();
  });

  it("lists only workspaces the user actively belongs to", async () => {
    const mine = seedWorkspace(stores, { ownerId: owner });
    seedWorkspace(stores, { ownerId: outsider, members: [{ userId: owner, role: "viewer" }] });
    const removed = seedWorkspace(stores, {
      ownerId: outsider,
      members: [{ userId: owner, role: "member" }],
    });
    stores.members.docs.find(
      (doc) => String(doc.workspaceId) === String(removed) && String(doc.userId) === String(owner),
    )!.status = "removed";
    const entries = await listUserWorkspaces(String(owner));
    expect(entries).toHaveLength(2);
    expect(entries.map((entry) => entry.role).sort()).toEqual(["owner", "viewer"]);
    expect(entries.some((entry) => String(entry.workspace._id) === String(mine))).toBe(true);
  });
});

describe("personal workspace provisioning", () => {
  const users = bindMemoryModel(User);
  const userId = new Types.ObjectId();

  beforeEach(() => {
    resetWorkspaceModels(stores);
    users.reset();
    users.docs.push({ _id: userId, name: "Asha Rao", email: "asha@example.com" });
  });

  it("creates exactly one personal workspace with the user as owner", async () => {
    const first = await ensurePersonalWorkspace(String(userId));
    const second = await ensurePersonalWorkspace(String(userId));
    expect(String(second._id)).toBe(String(first._id));
    expect(stores.workspaces.docs).toHaveLength(1);
    expect(stores.workspaces.docs[0]).toMatchObject({
      type: "personal",
      name: "Asha Rao's Workspace",
    });
    expect(String(stores.workspaces.docs[0]?.ownerId)).toBe(String(userId));
    expect(stores.members.docs).toHaveLength(1);
    expect(stores.members.docs[0]).toMatchObject({ role: "owner", status: "active" });
  });

  it("repairs a missing owner membership", async () => {
    const workspace = await ensurePersonalWorkspace(String(userId));
    stores.members.reset();
    await ensurePersonalWorkspace(String(userId));
    expect(stores.members.docs).toHaveLength(1);
    expect(String(stores.members.docs[0]?.workspaceId)).toBe(String(workspace._id));
  });

  it("generates URL-safe slugs", () => {
    expect(slugify("  Acme & Co.  ")).toBe("acme-co");
    expect(slugify("日本語")).toBe("workspace");
  });
});
