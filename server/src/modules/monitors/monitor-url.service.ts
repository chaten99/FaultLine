import dns from "node:dns/promises";
import net from "node:net";
import { createApiError } from "../../lib/errors/create-api-error.js";

const blockedHostnames = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata.google.internal",
  "metadata.google",
  "instance-data",
  "metadata",
]);

export const isPrivateIpv4 = (address: string): boolean => {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) {
    return false;
  }
  const first = parts[0] ?? -1;
  const second = parts[1] ?? -1;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 169 && second === 254) ||
    (first === 192 && second === 168) ||
    first >= 224
  );
};

export const isPrivateIpv6 = (address: string): boolean => {
  const normalized = address.toLowerCase().replace(/^\[|\]$/g, "");
  if (normalized === "::" || normalized === "::1") return true;
  if (normalized.startsWith("::ffff:")) {
    const mapped = normalized.slice(7);
    if (net.isIPv4(mapped)) return isPrivateIpv4(mapped);
  }
  return (
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb")
  );
};

export const isPrivateAddress = (address: string): boolean => {
  const cleaned = address.toLowerCase().replace(/^\[|\]$/g, "");
  if (net.isIPv4(cleaned)) return isPrivateIpv4(cleaned);
  if (net.isIPv6(cleaned)) return isPrivateIpv6(cleaned);
  return false;
};

export const isBlockedHostname = (hostname: string): boolean => {
  const lower = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (blockedHostnames.has(lower)) return true;
  if (
    lower.endsWith(".localhost") ||
    lower.endsWith(".local") ||
    lower.endsWith(".internal") ||
    lower.endsWith(".cluster.local")
  ) {
    return true;
  }
  return isPrivateAddress(lower);
};

export const validateMonitorUrl = async (value: string) => {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw createApiError("Enter a valid monitor URL.", 400, "INVALID_MONITOR_URL");
  }
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw createApiError(
      "Monitor URLs must use HTTP or HTTPS without credentials.",
      400,
      "INVALID_MONITOR_URL",
    );
  }
  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (isBlockedHostname(hostname)) {
    throw createApiError(
      "Monitor URLs cannot target private or local addresses.",
      400,
      "INVALID_MONITOR_URL",
    );
  }
  try {
    const addresses = await dns.lookup(hostname, { all: true });
    if (addresses.some(({ address }) => isPrivateAddress(address))) {
      throw createApiError(
        "Monitor URLs cannot target private or local addresses.",
        400,
        "INVALID_MONITOR_URL",
      );
    }
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      error.code !== "ENOTFOUND" &&
      error.code !== "EAI_AGAIN"
    ) {
      throw error;
    }
  }
};
