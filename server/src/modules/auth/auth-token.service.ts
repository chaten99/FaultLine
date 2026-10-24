import crypto from "node:crypto";
import jwt, { type JwtPayload } from "jsonwebtoken";
import { env } from "../../config/env.js";

type TokenClaims = JwtPayload & { tokenUse?: string };

export const createAccessToken = (userId: string): string =>
  jwt.sign({ tokenUse: "access", jti: crypto.randomUUID() }, env.JWT_ACCESS_SECRET, {
    algorithm: "HS256",
    subject: userId,
    issuer: env.JWT_ISSUER,
    audience: env.JWT_ACCESS_AUDIENCE,
    expiresIn: env.JWT_ACCESS_TTL_SECONDS,
  });

export const createRefreshToken = (
  userId: string,
  familyId: string,
  expiresInSeconds: number,
): string =>
  jwt.sign({ tokenUse: "refresh", familyId, jti: crypto.randomUUID() }, env.JWT_REFRESH_SECRET, {
    algorithm: "HS256",
    subject: userId,
    issuer: env.JWT_ISSUER,
    audience: env.JWT_REFRESH_AUDIENCE,
    expiresIn: expiresInSeconds,
  });

const verify = (token: string, secret: string, audience: string, use: string): TokenClaims => {
  const payload = jwt.verify(token, secret, {
    algorithms: ["HS256"],
    issuer: env.JWT_ISSUER,
    audience,
  }) as TokenClaims;
  if (payload.tokenUse !== use || typeof payload.sub !== "string") throw new Error("Invalid token");
  return payload;
};

export const verifyAccessToken = (token: string): string =>
  verify(token, env.JWT_ACCESS_SECRET, env.JWT_ACCESS_AUDIENCE, "access").sub as string;
export const verifyRefreshToken = (token: string): TokenClaims =>
  verify(token, env.JWT_REFRESH_SECRET, env.JWT_REFRESH_AUDIENCE, "refresh");
