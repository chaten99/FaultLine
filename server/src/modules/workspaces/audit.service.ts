import { Types } from "mongoose";
import { User } from "../auth/user.model.js";
import { WorkspaceAuditEvent, auditEventTypes } from "./workspace-audit.model.js";
import type { WorkspaceContext } from "./workspace.types.js";

export const listAuditEvents = async (
  ctx: WorkspaceContext,
  query: { page: number; pageSize: number; type?: string },
) => {
  const filter: Record<string, unknown> = { workspaceId: new Types.ObjectId(ctx.workspaceId) };
  if (query.type && (auditEventTypes as readonly string[]).includes(query.type)) {
    filter.type = query.type;
  }
  const [rows, total] = await Promise.all([
    WorkspaceAuditEvent.find(filter)
      .sort({ createdAt: -1 })
      .skip((query.page - 1) * query.pageSize)
      .limit(query.pageSize)
      .lean(),
    WorkspaceAuditEvent.countDocuments(filter),
  ]);
  const userIds = [
    ...new Set(
      rows.flatMap((row) => [
        String(row.actorId),
        ...(row.targetUserId ? [String(row.targetUserId)] : []),
      ]),
    ),
  ];
  const users = await User.find({ _id: { $in: userIds.map((id) => new Types.ObjectId(id)) } })
    .select("name")
    .lean();
  const names = new Map(users.map((user) => [String(user._id), user.name]));
  return {
    items: rows.map((row) => ({
      id: String(row._id),
      type: row.type,
      actor: { id: String(row.actorId), name: names.get(String(row.actorId)) ?? "Unknown user" },
      target: row.targetUserId
        ? {
            id: String(row.targetUserId),
            name: names.get(String(row.targetUserId)) ?? "Unknown user",
          }
        : null,
      targetId: row.targetId ?? null,
      metadata: row.metadata ?? {},
      createdAt: new Date(row.createdAt).toISOString(),
    })),
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.ceil(total / query.pageSize) || 1,
  };
};
