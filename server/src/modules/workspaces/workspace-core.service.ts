import crypto from "node:crypto";
import { Types } from "mongoose";
import { logger } from "../../config/logger.js";
import { User } from "../auth/user.model.js";
import { WorkspaceAuditEvent, type AuditEventType } from "./workspace-audit.model.js";
import { WorkspaceMember, type IWorkspaceMember } from "./workspace-member.model.js";
import { Workspace, type IWorkspace } from "./workspace.model.js";
import type { WorkspaceContext, WorkspaceRole } from "./workspace.types.js";

export const slugify = (value: string): string =>
  value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "workspace";

export const generateWorkspaceSlug = (name: string): string =>
  `${slugify(name)}-${crypto.randomBytes(3).toString("hex")}`;

export const effectiveRole = (
  workspace: Pick<IWorkspace, "ownerId">,
  member: Pick<IWorkspaceMember, "userId" | "role">,
): WorkspaceRole => {
  if (String(workspace.ownerId) === String(member.userId)) return "owner";
  return member.role === "owner" ? "admin" : member.role;
};

export const resolveWorkspaceContext = async (
  userId: string,
  workspaceId: string,
): Promise<WorkspaceContext | null> => {
  if (!Types.ObjectId.isValid(workspaceId) || !/^[a-f\d]{24}$/i.test(workspaceId)) return null;
  const [workspace, member] = await Promise.all([
    Workspace.findOne({ _id: workspaceId, status: "active" }).lean(),
    WorkspaceMember.findOne({
      workspaceId: new Types.ObjectId(workspaceId),
      userId: new Types.ObjectId(userId),
      status: "active",
    }).lean(),
  ]);
  if (!workspace || !member) return null;
  return {
    workspaceId,
    userId,
    role: effectiveRole(workspace as unknown as IWorkspace, member as unknown as IWorkspaceMember),
  };
};

export const createWorkspaceWithOwner = async (input: {
  name: string;
  type: "personal" | "team";
  userId: string;
}): Promise<IWorkspace> => {
  const userObjectId = new Types.ObjectId(input.userId);
  const workspace = await Workspace.create({
    name: input.name,
    slug: generateWorkspaceSlug(input.name),
    type: input.type,
    createdBy: userObjectId,
    ownerId: userObjectId,
    status: "active",
  });
  try {
    await WorkspaceMember.create({
      workspaceId: workspace._id,
      userId: userObjectId,
      role: "owner",
      status: "active",
      joinedAt: new Date(),
    });
  } catch (error) {
    await Workspace.deleteOne({ _id: workspace._id });
    throw error;
  }
  return workspace as unknown as IWorkspace;
};

export const ensurePersonalWorkspace = async (userId: string): Promise<IWorkspace> => {
  const existing = await Workspace.findOne({
    type: "personal",
    createdBy: new Types.ObjectId(userId),
  });
  if (existing) {
    await ensureOwnerMembership(existing as unknown as IWorkspace);
    return existing as unknown as IWorkspace;
  }
  const user = await User.findById(userId).select("name").lean();
  const name = `${(user?.name ?? "My").slice(0, 40)}'s Workspace`;
  try {
    return await createWorkspaceWithOwner({ name, type: "personal", userId });
  } catch (error) {
    if ((error as { code?: number }).code !== 11000) throw error;
    const winner = await Workspace.findOne({
      type: "personal",
      createdBy: new Types.ObjectId(userId),
    });
    if (!winner) throw error;
    await ensureOwnerMembership(winner as unknown as IWorkspace);
    return winner as unknown as IWorkspace;
  }
};

const ensureOwnerMembership = async (workspace: IWorkspace): Promise<void> => {
  await WorkspaceMember.updateOne(
    { workspaceId: workspace._id, userId: workspace.ownerId },
    {
      $setOnInsert: { joinedAt: new Date() },
      $set: { role: "owner", status: "active" },
    },
    { upsert: true },
  );
};

export const listUserWorkspaces = async (userId: string) => {
  const memberships = await WorkspaceMember.find({
    userId: new Types.ObjectId(userId),
    status: "active",
  }).lean();
  if (memberships.length === 0) return [];
  const workspaces = await Workspace.find({
    _id: { $in: memberships.map((member) => member.workspaceId) },
    status: "active",
  }).lean();
  const byId = new Map(workspaces.map((workspace) => [String(workspace._id), workspace]));
  return memberships
    .map((member) => {
      const workspace = byId.get(String(member.workspaceId));
      if (!workspace) return null;
      return {
        workspace: workspace as unknown as IWorkspace,
        role: effectiveRole(
          workspace as unknown as IWorkspace,
          member as unknown as IWorkspaceMember,
        ),
        joinedAt: member.joinedAt,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
};

export const listActiveMemberIds = async (workspaceId: string): Promise<string[]> => {
  const members = await WorkspaceMember.find({
    workspaceId: new Types.ObjectId(workspaceId),
    status: "active",
  })
    .select("userId")
    .lean();
  return members.map((member) => String(member.userId));
};

export const listUserWorkspaceIds = async (userId: string): Promise<string[]> =>
  (await listUserWorkspaces(userId)).map((entry) => String(entry.workspace._id));

export const recordAudit = async (input: {
  workspaceId: string;
  actorId: string;
  type: AuditEventType;
  targetUserId?: string;
  targetId?: string;
  metadata?: Record<string, string | number | boolean | null>;
}): Promise<void> => {
  try {
    await WorkspaceAuditEvent.create({
      workspaceId: new Types.ObjectId(input.workspaceId),
      actorId: new Types.ObjectId(input.actorId),
      type: input.type,
      ...(input.targetUserId ? { targetUserId: new Types.ObjectId(input.targetUserId) } : {}),
      ...(input.targetId ? { targetId: input.targetId } : {}),
      metadata: input.metadata ?? {},
    });
  } catch (error) {
    logger.error({ err: error, type: input.type }, "Failed to persist workspace audit event");
  }
};
