import crypto from "node:crypto";
import { RefreshTokenFamily } from "./refresh-token-family.model.js";
import { createRefreshToken, verifyRefreshToken } from "./auth-token.service.js";
import { env } from "../../config/env.js";
import { createApiError } from "../../lib/errors/create-api-error.js";

const hashToken = (token: string) => crypto.createHash("sha256").update(token).digest("hex");

export const issueRefreshToken = async (userId: string) => {
  const familyId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + env.JWT_REFRESH_ABSOLUTE_TTL_DAYS * 86_400_000);
  const token = createRefreshToken(userId, familyId, env.JWT_REFRESH_ABSOLUTE_TTL_DAYS * 86_400);
  await RefreshTokenFamily.create({ familyId, userId, tokenHash: hashToken(token), expiresAt });
  return token;
};

export const rotateRefreshToken = async (token: string) => {
  let claims;
  try {
    claims = verifyRefreshToken(token);
  } catch {
    throw createApiError(
      "Your session has expired. Please sign in again.",
      401,
      "INVALID_REFRESH_TOKEN",
    );
  }
  const family = await RefreshTokenFamily.findOne({
    familyId: claims.familyId,
    userId: claims.sub,
    revokedAt: null,
  });
  if (
    !family ||
    family.expiresAt.getTime() <= Date.now() ||
    family.tokenHash !== hashToken(token)
  ) {
    throw createApiError(
      "Your session has expired. Please sign in again.",
      401,
      "INVALID_REFRESH_TOKEN",
    );
  }
  const next = createRefreshToken(
    claims.sub as string,
    claims.familyId as string,
    env.JWT_REFRESH_IDLE_TTL_DAYS * 86_400,
  );
  family.tokenHash = hashToken(next);
  await family.save();
  return { token: next, userId: claims.sub as string };
};

export const revokeRefreshToken = async (token: string | undefined) => {
  if (!token) return;
  try {
    const claims = verifyRefreshToken(token);
    await RefreshTokenFamily.updateOne(
      { familyId: claims.familyId, userId: claims.sub },
      { revokedAt: new Date() },
    );
  } catch {
    return;
  }
};
