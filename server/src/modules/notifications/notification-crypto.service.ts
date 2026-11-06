import crypto from "node:crypto";
import { env } from "../../config/env.js";
import { createApiError } from "../../lib/errors/create-api-error.js";

const version = "v1";

const getKey = (): Buffer => {
  if (!env.NOTIFICATION_ENCRYPTION_KEY) {
    throw createApiError(
      "Notification integrations are not configured on this server.",
      503,
      "NOTIFICATION_NOT_CONFIGURED",
    );
  }
  return Buffer.from(env.NOTIFICATION_ENCRYPTION_KEY, "hex");
};

export const isEncryptionConfigured = (): boolean => Boolean(env.NOTIFICATION_ENCRYPTION_KEY);

export const encryptSecret = (plaintext: string, context: string): string => {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(context, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    version,
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
};

export const decryptSecret = (payload: string, context: string): string => {
  const key = getKey();
  const [tagVersion, iv, tag, ciphertext] = payload.split(".");
  if (tagVersion !== version || !iv || !tag || !ciphertext) {
    throw new Error("Malformed encrypted payload");
  }
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  decipher.setAAD(Buffer.from(context, "utf8"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
};

export const generateSigningSecret = (): string =>
  `whsec_${crypto.randomBytes(32).toString("base64url")}`;
