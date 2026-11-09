import { Types } from "mongoose";
import { createApiError } from "../../lib/errors/create-api-error.js";
import { verifyRefreshToken } from "./auth-token.service.js";
import { describeDevice } from "./device-label.js";
import { RefreshTokenFamily } from "./refresh-token-family.model.js";

export const currentFamilyId = (token: string | undefined): string | null => {
  if (!token) return null;
  try {
    const claims = verifyRefreshToken(token);
    return typeof claims.familyId === "string" ? claims.familyId : null;
  } catch {
    return null;
  }
};

export const recordSessionMeta = async (
  token: string,
  userAgent: string | undefined,
): Promise<void> => {
  const familyId = currentFamilyId(token);
  if (!familyId) return;
  await RefreshTokenFamily.updateOne(
    { familyId },
    {
      $set: {
        lastUsedAt: new Date(),
        ...(userAgent ? { userAgent: userAgent.slice(0, 256) } : {}),
      },
    },
  );
};

export const listSessions = async (userId: string, currentId: string | null) => {
  const rows = await RefreshTokenFamily.find({
    userId: new Types.ObjectId(userId),
    revokedAt: null,
    expiresAt: { $gt: new Date() },
  })
    .sort({ lastUsedAt: -1 })
    .limit(50)
    .lean();
  const items = rows.map((row) => ({
    id: row.familyId,
    current: row.familyId === currentId,
    device: describeDevice(row.userAgent),
    createdAt: new Date(row.createdAt as Date).toISOString(),
    lastActiveAt: new Date(
      (row.lastUsedAt ?? row.updatedAt ?? row.createdAt) as Date,
    ).toISOString(),
    expiresAt: new Date(row.expiresAt).toISOString(),
  }));
  items.sort((a, b) => Number(b.current) - Number(a.current));
  return { items };
};

export const revokeSession = async (
  userId: string,
  sessionId: string,
  currentId: string | null,
) => {
  const revoked = await RefreshTokenFamily.findOneAndUpdate(
    { familyId: sessionId, userId: new Types.ObjectId(userId), revokedAt: null },
    { $set: { revokedAt: new Date() } },
    { new: true },
  );
  if (!revoked) throw createApiError("Session not found.", 404, "SESSION_NOT_FOUND");
  return { status: "ok" as const, current: sessionId === currentId };
};

export const revokeOtherSessions = async (userId: string, currentId: string | null) => {
  const filter: Record<string, unknown> = {
    userId: new Types.ObjectId(userId),
    revokedAt: null,
  };
  if (currentId) filter.familyId = { $ne: currentId };
  const result = await RefreshTokenFamily.updateMany(filter, { $set: { revokedAt: new Date() } });
  return { revoked: result.modifiedCount ?? 0 };
};
