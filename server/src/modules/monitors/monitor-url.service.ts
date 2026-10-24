import dns from "node:dns/promises";
import net from "node:net";
import { createApiError } from "../../lib/errors/create-api-error.js";

const blockedHostnames = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata.google.internal",
  "metadata.google",
]);

const isPrivateIpv4 = (address: string) => {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return false;
  const first = parts[0] ?? -1;
  const second = parts[1] ?? -1;
  return (
    first === 10 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    first === 127 ||
    (first === 169 && second === 254) ||
    first === 0
  );
};

const isPrivateAddress = (address: string) => {
  if (net.isIPv4(address)) return isPrivateIpv4(address);
  if (!net.isIPv6(address)) return false;
  const normalized = address.toLowerCase();
  return (
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb")
  );
};

export const validateMonitorUrl = async (value: string) => {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw createApiError("Enter a valid monitor URL.", 400, "INVALID_MONITOR_URL");
  }
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password)
    throw createApiError(
      "Monitor URLs must use HTTP or HTTPS without credentials.",
      400,
      "INVALID_MONITOR_URL",
    );
  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    blockedHostnames.has(hostname) ||
    hostname.endsWith(".localhost") ||
    isPrivateAddress(hostname)
  )
    throw createApiError(
      "Monitor URLs cannot target private or local addresses.",
      400,
      "INVALID_MONITOR_URL",
    );
  try {
    const addresses = await dns.lookup(hostname, { all: true });
    if (addresses.some(({ address }) => isPrivateAddress(address)))
      throw createApiError(
        "Monitor URLs cannot target private or local addresses.",
        400,
        "INVALID_MONITOR_URL",
      );
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      error.code !== "ENOTFOUND" &&
      error.code !== "EAI_AGAIN"
    )
      throw error;
  }
};
