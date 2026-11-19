import { encryptSecret, decryptSecret } from "../notifications/notification-crypto.service.js";
import { httpConfigSchema, type HttpConfig } from "./advanced.validation.js";
import { createApiError } from "../../lib/errors/create-api-error.js";
export type MonitorSecrets = {
  token?: string;
  username?: string;
  password?: string;
  body?: string;
  headers?: Record<string, string>;
};
export const secretContext = (workspaceId: string, monitorId: string) =>
  "monitor:" + workspaceId + ":" + monitorId;
export const decodeMonitorSecrets = (
  encrypted: string | undefined | null,
  context: string,
): MonitorSecrets =>
  encrypted ? (JSON.parse(decryptSecret(encrypted, context)) as MonitorSecrets) : {};
export const protectHttpConfig = (input: HttpConfig, previous: MonitorSecrets, context: string) => {
  const config = httpConfigSchema.parse(input);
  const secrets: MonitorSecrets = { headers: {} };
  const headers: Array<{ name: string; value?: string; secret: boolean; saved: boolean }> =
    config.headers.map((h) => {
      if (
        config.authType !== "custom" &&
        !h.secret &&
        h.name !== "authorization" &&
        !/token|key|cookie|secret/i.test(h.name)
      )
        return { ...h, saved: false, value: h.value ?? "" };
      const value = h.value ?? previous.headers?.[h.name];
      if (value === undefined)
        throw createApiError(
          "Provide a value for each new secret header.",
          400,
          "INVALID_MONITOR_CONFIG",
        );
      secrets.headers![h.name] = value;
      return { name: h.name, secret: true, saved: true };
    });
  if (config.authType === "bearer") {
    secrets.token = config.token ?? previous.token;
    if (!secrets.token)
      throw createApiError("Provide a bearer token.", 400, "INVALID_MONITOR_CONFIG");
  }
  if (config.authType === "basic") {
    secrets.username = config.username ?? previous.username;
    secrets.password = config.password ?? previous.password;
    if (secrets.username === undefined || secrets.password === undefined)
      throw createApiError("Provide both Basic credentials.", 400, "INVALID_MONITOR_CONFIG");
  }
  if (config.body !== null) secrets.body = config.body ?? previous.body;
  if (secrets.body && config.contentType === "application/json") {
    try {
      JSON.parse(secrets.body);
    } catch {
      throw createApiError("Request body must be valid JSON.", 400, "INVALID_MONITOR_CONFIG");
    }
  }
  if (secrets.body && Buffer.byteLength(secrets.body, "utf8") > 8192)
    throw createApiError("Request body exceeds 8 KB.", 400, "INVALID_MONITOR_CONFIG");
  if (
    headers.reduce(
      (size, h) =>
        size + h.name.length + (h.value?.length ?? secrets.headers?.[h.name]?.length ?? 0),
      0,
    ) > 8192
  )
    throw createApiError("Headers exceed 8 KB.", 400, "INVALID_MONITOR_CONFIG");
  const safeConfig = {
    authType: config.authType,
    credentialsSaved: ["basic", "bearer"].includes(config.authType),
    headers,
    bodySaved: Boolean(secrets.body),
    contentType: config.contentType,
    keyword: config.keyword,
    assertions: config.assertions,
  };
  const hasSecrets = Boolean(
    secrets.token ||
    secrets.username !== undefined ||
    secrets.password !== undefined ||
    secrets.body ||
    Object.keys(secrets.headers ?? {}).length,
  );
  return {
    httpConfig: safeConfig,
    encryptedSecrets: hasSecrets ? encryptSecret(JSON.stringify(secrets), context) : null,
  };
};
export const buildRequest = (config: HttpConfig | undefined, secrets: MonitorSecrets) => {
  const headers: Record<string, string> = {};
  for (const h of config?.headers ?? [])
    headers[h.name] = h.secret ? (secrets.headers?.[h.name] ?? "") : (h.value ?? "");
  if (config?.authType === "bearer") headers.authorization = "Bearer " + secrets.token;
  if (config?.authType === "basic")
    headers.authorization =
      "Basic " +
      Buffer.from((secrets.username ?? "") + ":" + (secrets.password ?? "")).toString("base64");
  if (secrets.body !== undefined)
    headers["content-type"] = config?.contentType ?? "application/json";
  return { headers, body: secrets.body };
};
