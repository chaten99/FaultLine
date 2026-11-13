import { Types } from "mongoose";
import { createApiError } from "../../lib/errors/create-api-error.js";
import { publishDomainEvent } from "../../lib/redis/redis.service.js";
import { User } from "../auth/user.model.js";
import { recordAudit, effectiveRole } from "./workspace-core.service.js";
import { WorkspaceMember, type IWorkspaceMember } from "./workspace-member.model.js";
import { Workspace, type IWorkspace } from "./workspace.model.js";
import type { AssignableRole, WorkspaceContext } from "./workspace.types.js";

const loadWorkspace = async (workspaceId: string) => {
  const workspace = await Workspace.findOne({ _id: workspaceId, status: "active" }).lean();
  if (!workspace) throw createApiError("Workspace not found.", 404, "WORKSPACE_NOT_FOUND");
  return workspace as unknown as IWorkspace;
};

const loadMember = async (workspaceId: string, memberId: string) => {
  if (!Types.ObjectId.isValid(memberId)) {
    throw createApiError("Member not found.", 404, "MEMBER_NOT_FOUND");
  }
  const member = await WorkspaceMember.findOne({
    _id: memberId,
    workspaceId: new Types.ObjectId(workspaceId),
    status: "active",
  }).lean();
  if (!member) throw createApiError("Member not found.", 404, "MEMBER_NOT_FOUND");
  return member as unknown as IWorkspaceMember;
};

export const listMembers = async (ctx: WorkspaceContext) => {
  const workspace = await loadWorkspace(ctx.workspaceId);
  const members = (await WorkspaceMember.find({
    workspaceId: workspace._id,
    status: "active",
  })
    .sort({ joinedAt: 1 })
    .lean()) as unknown as IWorkspaceMember[];
  const users = await User.find({ _id: { $in: members.map((member) => member.userId) } })
    .select("name email")
    .lean();
  const byId = new Map(users.map((user) => [String(user._id), user]));
  return {
    items: members.map((member) => {
      const user = byId.get(String(member.userId));
      const role = effectiveRole(workspace, member);
      return {
        id: String(member._id),
        userId: String(member.userId),
        name: user?.name ?? "Unknown user",
        email: user?.email ?? "",
        role,
        status: member.status,
        joinedAt: new Date(member.joinedAt).toISOString(),
        isOwner: role === "owner",
        isSelf: String(member.userId) === ctx.userId,
      };
    }),
  };
};

export const changeMemberRole = async (
  ctx: WorkspaceContext,
  memberId: string,
  input: { role: AssignableRole },
) => {
  const workspace = await loadWorkspace(ctx.workspaceId);
  const member = await loadMember(ctx.workspaceId, memberId);
  const targetRole = effectiveRole(workspace, member);
  if (targetRole === "owner") {
    throw createApiError("The workspace owner's role can't be changed.", 403, "OWNER_PROTECTED");
  }
  if (String(member.userId) === ctx.userId) {
    throw createApiError("You can't change your own role.", 400, "INVALID_ROLE");
  }
  if (targetRole === input.role) {
    throw createApiError("That is already this member's role.", 400, "INVALID_ROLE");
  }
  const updated = await WorkspaceMember.findOneAndUpdate(
    {
      _id: member._id,
      workspaceId: workspace._id,
      status: "active",
      userId: { $ne: workspace.ownerId },
    },
    { $set: { role: input.role } },
    { new: true },
  );
  if (!updated) throw createApiError("Member not found.", 404, "MEMBER_NOT_FOUND");
  await recordAudit({
    workspaceId: ctx.workspaceId,
    actorId: ctx.userId,
    type: "member.role_changed",
    targetUserId: String(member.userId),
    metadata: { from: targetRole, to: input.role },
  });
  await publishDomainEvent("workspace.member.role_changed", {
    workspaceId: ctx.workspaceId,
    payload: { workspaceId: ctx.workspaceId, userId: String(member.userId), role: input.role },
  });
  await publishDomainEvent("workspace.role_changed", {
    userId: String(member.userId),
    payload: { workspaceId: ctx.workspaceId, role: input.role },
  });
  const users = await User.findById(member.userId).select("name email").lean();
  return {
    member: {
      id: String(member._id),
      userId: String(member.userId),
      name: users?.name ?? "Unknown user",
      email: users?.email ?? "",
      role: input.role,
      status: "active" as const,
      joinedAt: new Date(member.joinedAt).toISOString(),
      isOwner: false,
      isSelf: false,
    },
  };
};

export const removeMember = async (ctx: WorkspaceContext, memberId: string) => {
  const workspace = await loadWorkspace(ctx.workspaceId);
  const member = await loadMember(ctx.workspaceId, memberId);
  if (effectiveRole(workspace, member) === "owner") {
    throw createApiError("The workspace owner can't be removed.", 403, "OWNER_PROTECTED");
  }
  if (String(member.userId) === ctx.userId) {
    throw createApiError("Use leave workspace to remove yourself.", 400, "INVALID_ROLE");
  }
  const removed = await WorkspaceMember.findOneAndUpdate(
    {
      _id: member._id,
      workspaceId: workspace._id,
      status: "active",
      userId: { $ne: workspace.ownerId },
    },
    { $set: { status: "removed", removedAt: new Date() } },
    { new: true },
  );
  if (!removed) throw createApiError("Member not found.", 404, "MEMBER_NOT_FOUND");
  await recordAudit({
    workspaceId: ctx.workspaceId,
    actorId: ctx.userId,
    type: "member.removed",
    targetUserId: String(member.userId),
    metadata: { role: effectiveRole(workspace, member) },
  });
  await publishDomainEvent("workspace.member.removed", {
    workspaceId: ctx.workspaceId,
    payload: { workspaceId: ctx.workspaceId, userId: String(member.userId) },
  });
  await publishDomainEvent("workspace.access_revoked", {
    userId: String(member.userId),
    payload: { workspaceId: ctx.workspaceId },
  });
  return { status: "ok" as const };
};
