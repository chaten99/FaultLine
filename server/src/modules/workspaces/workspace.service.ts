import argon2 from "argon2";
import { Types } from "mongoose";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { createApiError } from "../../lib/errors/create-api-error.js";
import { publishDomainEvent } from "../../lib/redis/redis.service.js";
import { unscheduleMonitor } from "../../queues/monitor-scheduler.service.js";
import { User } from "../auth/user.model.js";
import { Monitor } from "../monitors/monitor.model.js";
import { PublicStatusPage } from "../status-pages/status-page.model.js";
import { WorkspaceInvitation } from "./workspace-invitation.model.js";
import { WorkspaceMember } from "./workspace-member.model.js";
import { rolePermissions } from "./workspace-permissions.js";
import {
  createWorkspaceWithOwner,
  effectiveRole,
  listUserWorkspaces,
  recordAudit,
} from "./workspace-core.service.js";
import { Workspace, type IWorkspace } from "./workspace.model.js";
import {
  maxWorkspacesPerUser,
  type WorkspaceContext,
  type WorkspaceRole,
} from "./workspace.types.js";

const iso = (value: Date) => new Date(value).toISOString();

export const verifyPassword = async (userId: string, password: string): Promise<void> => {
  const user = await User.findById(userId).select("+passwordHash");
  if (!user || !(await argon2.verify(user.passwordHash, password))) {
    throw createApiError("Incorrect password.", 400, "REAUTHENTICATION_REQUIRED", {
      password: "Incorrect password.",
    });
  }
};

const loadOwners = async (ownerIds: unknown[]) => {
  const owners = await User.find({
    _id: { $in: ownerIds.map((id) => new Types.ObjectId(String(id))) },
  })
    .select("name email")
    .lean();
  return new Map(owners.map((owner) => [String(owner._id), owner]));
};

const memberCount = (workspaceId: unknown) =>
  WorkspaceMember.countDocuments({ workspaceId, status: "active" });

export const listWorkspaces = async (userId: string) => {
  const entries = await listUserWorkspaces(userId);
  const owners = await loadOwners(entries.map((entry) => entry.workspace.ownerId));
  const items = await Promise.all(
    entries.map(async ({ workspace, role }) => ({
      id: String(workspace._id),
      name: workspace.name,
      slug: workspace.slug,
      type: workspace.type,
      role,
      ownerId: String(workspace.ownerId),
      ownerName: owners.get(String(workspace.ownerId))?.name ?? "Unknown",
      memberCount: await memberCount(workspace._id),
      createdAt: iso(workspace.createdAt),
    })),
  );
  items.sort(
    (a, b) =>
      Number(b.type === "personal") - Number(a.type === "personal") || a.name.localeCompare(b.name),
  );
  return { items };
};

export const createWorkspace = async (userId: string, input: { name: string }) => {
  const existing = await listUserWorkspaces(userId);
  if (existing.length >= maxWorkspacesPerUser) {
    throw createApiError(
      `You can belong to up to ${maxWorkspacesPerUser} workspaces.`,
      409,
      "WORKSPACE_LIMIT_REACHED",
    );
  }
  const workspace = await createWorkspaceWithOwner({ name: input.name, type: "team", userId });
  await recordAudit({
    workspaceId: String(workspace._id),
    actorId: userId,
    type: "workspace.created",
    metadata: { name: workspace.name },
  });
  const owner = await User.findById(userId).select("name").lean();
  return {
    workspace: {
      id: String(workspace._id),
      name: workspace.name,
      slug: workspace.slug,
      type: workspace.type,
      role: "owner" as WorkspaceRole,
      ownerId: userId,
      ownerName: owner?.name ?? "Unknown",
      memberCount: 1,
      createdAt: iso(workspace.createdAt),
    },
  };
};

const loadWorkspace = async (workspaceId: string): Promise<IWorkspace> => {
  const workspace = await Workspace.findOne({ _id: workspaceId, status: "active" }).lean();
  if (!workspace) throw createApiError("Workspace not found.", 404, "WORKSPACE_NOT_FOUND");
  return workspace as unknown as IWorkspace;
};

export const getWorkspace = async (ctx: WorkspaceContext) => {
  const workspace = await loadWorkspace(ctx.workspaceId);
  const owner = await User.findById(workspace.ownerId).select("name email").lean();
  const [members, pending] = await Promise.all([
    memberCount(workspace._id),
    WorkspaceInvitation.countDocuments({
      workspaceId: workspace._id,
      status: "pending",
      expiresAt: { $gt: new Date() },
    }),
  ]);
  return {
    workspace: {
      id: String(workspace._id),
      name: workspace.name,
      slug: workspace.slug,
      type: workspace.type,
      role: ctx.role,
      owner: {
        id: String(workspace.ownerId),
        name: owner?.name ?? "Unknown",
        email: owner?.email ?? "",
      },
      createdAt: iso(workspace.createdAt),
      updatedAt: iso(workspace.updatedAt),
      memberCount: members,
      pendingInvitationCount: pending,
    },
    permissions: [...rolePermissions[ctx.role]],
  };
};

export const updateWorkspace = async (ctx: WorkspaceContext, input: { name: string }) => {
  const before = await loadWorkspace(ctx.workspaceId);
  const updated = await Workspace.findOneAndUpdate(
    { _id: ctx.workspaceId, status: "active" },
    { $set: { name: input.name } },
    { new: true },
  );
  if (!updated) throw createApiError("Workspace not found.", 404, "WORKSPACE_NOT_FOUND");
  if (before.name !== input.name) {
    await recordAudit({
      workspaceId: ctx.workspaceId,
      actorId: ctx.userId,
      type: "workspace.settings_updated",
      metadata: { field: "name", from: before.name, to: input.name },
    });
    await publishDomainEvent("workspace.settings_updated", {
      workspaceId: ctx.workspaceId,
      payload: { workspaceId: ctx.workspaceId, name: input.name },
    });
  }
  return getWorkspace(ctx);
};

export const transferOwnership = async (
  ctx: WorkspaceContext,
  input: { userId: string; password: string },
) => {
  const workspace = await loadWorkspace(ctx.workspaceId);
  if (workspace.type === "personal") {
    throw createApiError(
      "Ownership of a personal workspace can't be transferred.",
      409,
      "PERSONAL_WORKSPACE",
    );
  }
  if (input.userId === ctx.userId) {
    throw createApiError("Choose another member to become the owner.", 400, "INVALID_REQUEST", {
      userId: "Choose another member.",
    });
  }
  await verifyPassword(ctx.userId, input.password);
  const target = await WorkspaceMember.findOne({
    workspaceId: workspace._id,
    userId: new Types.ObjectId(input.userId),
    status: "active",
  }).lean();
  if (!target) {
    throw createApiError("That person is not a member of this workspace.", 404, "MEMBER_NOT_FOUND");
  }
  const swapped = await Workspace.findOneAndUpdate(
    { _id: workspace._id, ownerId: new Types.ObjectId(ctx.userId), status: "active" },
    { $set: { ownerId: new Types.ObjectId(input.userId) } },
    { new: true },
  );
  if (!swapped) {
    throw createApiError(
      "Ownership changed while you were working. Refresh and try again.",
      409,
      "OWNER_PROTECTED",
    );
  }
  await WorkspaceMember.updateOne(
    { workspaceId: workspace._id, userId: new Types.ObjectId(input.userId) },
    { $set: { role: "owner" } },
  );
  await WorkspaceMember.updateOne(
    { workspaceId: workspace._id, userId: new Types.ObjectId(ctx.userId) },
    { $set: { role: "admin" } },
  );
  await recordAudit({
    workspaceId: ctx.workspaceId,
    actorId: ctx.userId,
    type: "workspace.ownership_transferred",
    targetUserId: input.userId,
    metadata: { previousOwner: ctx.userId },
  });
  await publishDomainEvent("workspace.member.role_changed", {
    workspaceId: ctx.workspaceId,
    payload: { workspaceId: ctx.workspaceId, userId: input.userId, role: "owner" },
  });
  await publishDomainEvent("workspace.role_changed", {
    userId: input.userId,
    payload: { workspaceId: ctx.workspaceId, role: "owner" },
  });
  await publishDomainEvent("workspace.role_changed", {
    userId: ctx.userId,
    payload: { workspaceId: ctx.workspaceId, role: "admin" },
  });
  return getWorkspace({ ...ctx, role: "admin" });
};

export const leaveWorkspace = async (ctx: WorkspaceContext) => {
  const workspace = await loadWorkspace(ctx.workspaceId);
  if (workspace.type === "personal") {
    throw createApiError("You can't leave your personal workspace.", 409, "PERSONAL_WORKSPACE");
  }
  if (ctx.role === "owner") {
    throw createApiError(
      "Transfer ownership to another member before leaving.",
      409,
      "OWNER_PROTECTED",
    );
  }
  await WorkspaceMember.updateOne(
    { workspaceId: workspace._id, userId: new Types.ObjectId(ctx.userId) },
    { $set: { status: "removed", removedAt: new Date() } },
  );
  await recordAudit({
    workspaceId: ctx.workspaceId,
    actorId: ctx.userId,
    type: "member.left",
    targetUserId: ctx.userId,
  });
  await publishDomainEvent("workspace.member.removed", {
    workspaceId: ctx.workspaceId,
    payload: { workspaceId: ctx.workspaceId, userId: ctx.userId },
  });
  await publishDomainEvent("workspace.access_revoked", {
    userId: ctx.userId,
    payload: { workspaceId: ctx.workspaceId },
  });
  return { status: "ok" as const };
};

export const deleteWorkspace = async (
  ctx: WorkspaceContext,
  input: { confirmName: string; password: string },
) => {
  const workspace = await loadWorkspace(ctx.workspaceId);
  if (workspace.type === "personal") {
    throw createApiError("You can't delete your personal workspace.", 409, "PERSONAL_WORKSPACE");
  }
  if (input.confirmName !== workspace.name) {
    throw createApiError("The workspace name doesn't match.", 400, "INVALID_REQUEST", {
      confirmName: "Type the workspace name exactly.",
    });
  }
  await verifyPassword(ctx.userId, input.password);
  const purgeAfter = new Date(Date.now() + env.WORKSPACE_RETENTION_DAYS * 86_400_000);
  const marked = await Workspace.findOneAndUpdate(
    { _id: workspace._id, ownerId: new Types.ObjectId(ctx.userId), status: "active" },
    {
      $set: {
        status: "deleted",
        deletedAt: new Date(),
        deletedBy: new Types.ObjectId(ctx.userId),
        purgeAfter,
      },
    },
    { new: true },
  );
  if (!marked) throw createApiError("Workspace not found.", 404, "WORKSPACE_NOT_FOUND");
  await recordAudit({
    workspaceId: ctx.workspaceId,
    actorId: ctx.userId,
    type: "workspace.deleted",
    metadata: { name: workspace.name, purgeAfter: purgeAfter.toISOString() },
  });
  await quiesceWorkspace(ctx.workspaceId);
  await publishDomainEvent("workspace.deleted", {
    workspaceId: ctx.workspaceId,
    payload: { workspaceId: ctx.workspaceId },
  });
  return { status: "deleted" as const, purgeAfter: purgeAfter.toISOString() };
};

export const quiesceWorkspace = async (workspaceId: string): Promise<void> => {
  const id = new Types.ObjectId(workspaceId);
  const active = await Monitor.find({ workspaceId: id, active: true }).select("_id").lean();
  await Monitor.updateMany({ workspaceId: id }, { $set: { active: false } });
  for (const monitor of active) {
    try {
      await unscheduleMonitor(String(monitor._id));
    } catch (error) {
      logger.warn({ err: error, monitorId: String(monitor._id) }, "Failed to unschedule monitor");
    }
  }
  await PublicStatusPage.updateMany(
    { workspaceId: id, status: "published" },
    { $set: { status: "unpublished" } },
  );
  await WorkspaceInvitation.updateMany(
    { workspaceId: id, status: "pending" },
    { $set: { status: "revoked", revokedAt: new Date() } },
  );
};

export { effectiveRole };
