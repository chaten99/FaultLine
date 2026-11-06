import dns from "node:dns";
import https from "node:https";
import net from "node:net";
import { isBlockedHostname, isPrivateAddress } from "../monitors/monitor-url.service.js";
import type { ChannelResult, FailureCategory } from "./notification.types.js";

export class DestinationBlockedError extends Error {
  constructor() {
    super("Destination is not permitted");
    this.name = "DestinationBlockedError";
  }
}

const allowedPorts = new Set([443, 8443]);

const expandIpv6 = (address: string): number[] | null => {
  let value = address.toLowerCase();
  const zoneIndex = value.indexOf("%");
  if (zoneIndex >= 0) value = value.slice(0, zoneIndex);
  const lastColon = value.lastIndexOf(":");
  const tail = value.slice(lastColon + 1);
  if (tail.includes(".")) {
    const parts = tail.split(".").map(Number);
    if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) {
      return null;
    }
    const [a = 0, b = 0, c = 0, d = 0] = parts;
    value = `${value.slice(0, lastColon + 1)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const halves = value.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const rest = halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - rest.length;
  if (halves.length === 1 ? head.length !== 8 : missing < 0) return null;
  const groups = halves.length === 1 ? head : [...head, ...Array(missing).fill("0"), ...rest];
  const numbers = groups.map((group) => Number.parseInt(group, 16));
  return numbers.length === 8 && numbers.every((n) => Number.isInteger(n) && n >= 0 && n <= 0xffff)
    ? numbers
    : null;
};

const isForbiddenIpv4 = (address: string): boolean => {
  if (isPrivateAddress(address)) return true;
  const parts = address.split(".").map(Number);
  const first = parts[0] ?? -1;
  const second = parts[1] ?? -1;
  const third = parts[2] ?? -1;
  return (
    (first === 192 && second === 0 && (third === 0 || third === 2)) ||
    (first === 198 && (second === 18 || second === 19)) ||
    (first === 198 && second === 51 && third === 100) ||
    (first === 203 && second === 0 && third === 113)
  );
};

export const isForbiddenAddress = (address: string): boolean => {
  const cleaned = address.toLowerCase().replace(/^\[|\]$/g, "");
  if (net.isIPv4(cleaned)) return isForbiddenIpv4(cleaned);
  if (!net.isIPv6(cleaned)) return true;
  const groups = expandIpv6(cleaned);
  if (!groups) return true;
  const [g0 = 0, g1 = 0, g2 = 0, g3 = 0, g4 = 0, g5 = 0, g6 = 0, g7 = 0] = groups;
  const embedded = `${g6 >> 8}.${g6 & 255}.${g7 >> 8}.${g7 & 255}`;
  if (groups.every((g) => g === 0)) return true;
  if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0) {
    return g6 === 0 && g7 <= 1 ? true : isForbiddenIpv4(embedded);
  }
  if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0xffff) {
    return isForbiddenIpv4(embedded);
  }
  if (g0 === 0x64 && g1 === 0xff9b) return isForbiddenIpv4(embedded);
  if (g0 === 0x2002) return isForbiddenIpv4(`${g1 >> 8}.${g1 & 255}.${g2 >> 8}.${g2 & 255}`);
  if (g0 === 0x2001 && (g1 === 0 || g1 === 0xdb8)) return true;
  if ((g0 & 0xff00) === 0xff00) return true;
  if ((g0 & 0xfe00) === 0xfc00) return true;
  if ((g0 & 0xffc0) === 0xfe80 || (g0 & 0xffc0) === 0xfec0) return true;
  return isPrivateAddress(cleaned);
};

export const assertPermittedUrl = (value: string): URL => {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new DestinationBlockedError();
  }
  const port = parsed.port ? Number(parsed.port) : 443;
  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    !allowedPorts.has(port) ||
    !hostname ||
    isBlockedHostname(hostname) ||
    (net.isIP(hostname) !== 0 && isForbiddenAddress(hostname))
  ) {
    throw new DestinationBlockedError();
  }
  return parsed;
};

type LookupCallback = (
  error: NodeJS.ErrnoException | null,
  address: string | dns.LookupAddress[],
  family?: number,
) => void;

export type SecureLookup = (
  hostname: string,
  options: dns.LookupOptions,
  callback: LookupCallback,
) => void;

export const validatedLookup: SecureLookup = (hostname, options, callback) => {
  dns.lookup(hostname, { all: true, verbatim: true }, (error, addresses) => {
    if (error) return callback(error, "", 0);
    if (addresses.length === 0 || addresses.some(({ address }) => isForbiddenAddress(address))) {
      return callback(new DestinationBlockedError() as NodeJS.ErrnoException, "", 0);
    }
    if (options.all) return callback(null, addresses);
    const first = addresses[0];
    if (!first) return callback(new DestinationBlockedError() as NodeJS.ErrnoException, "", 0);
    return callback(null, first.address, first.family);
  });
};

export type SecureRequest = {
  url: string;
  body: string;
  headers: Record<string, string>;
  timeoutMs: number;
  maxResponseBytes?: number;
};

export type SecureResponse = {
  statusCode: number;
  headers: Record<string, string | string[] | undefined>;
  durationMs: number;
};

export type SecureTransport = typeof https.request;

export type SecureClientDeps = {
  lookup?: SecureLookup;
  transport?: SecureTransport;
};

export class OutboundRequestError extends Error {
  constructor(
    readonly category: FailureCategory,
    readonly transient: boolean,
    readonly durationMs: number,
  ) {
    super(category);
    this.name = "OutboundRequestError";
  }
}

export const postJsonSecurely = async (
  request: SecureRequest,
  deps: SecureClientDeps = {},
): Promise<SecureResponse> => {
  const startedAt = performance.now();
  const elapsed = () => Math.max(1, Math.round(performance.now() - startedAt));
  let parsed: URL;
  try {
    parsed = assertPermittedUrl(request.url);
  } catch {
    throw new OutboundRequestError("DESTINATION_BLOCKED", false, elapsed());
  }
  const maxResponseBytes = request.maxResponseBytes ?? 16_384;
  const transport = deps.transport ?? https.request;
  const lookup = deps.lookup ?? validatedLookup;
  const hostname = parsed.hostname.replace(/^\[|\]$/g, "");

  return new Promise<SecureResponse>((resolve, reject) => {
    let settled = false;
    const deadline: { handle?: NodeJS.Timeout } = {};
    const finish = (action: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline.handle);
      action();
    };
    const fail = (category: FailureCategory, transient: boolean) =>
      finish(() => reject(new OutboundRequestError(category, transient, elapsed())));

    const req = transport(
      {
        method: "POST",
        protocol: "https:",
        hostname,
        port: parsed.port ? Number(parsed.port) : 443,
        path: `${parsed.pathname}${parsed.search}`,
        headers: {
          ...request.headers,
          Host: parsed.host,
          "Content-Type": "application/json; charset=utf-8",
          "Content-Length": String(Buffer.byteLength(request.body)),
          "User-Agent": "FaultLine-Notifications/1.0",
          Accept: "application/json, text/plain, */*",
          Connection: "close",
        },
        servername: net.isIP(hostname) === 0 ? hostname : undefined,
        lookup: lookup as unknown as https.RequestOptions["lookup"],
        agent: false,
        rejectUnauthorized: true,
      },
      (response) => {
        let received = 0;
        response.on("data", (chunk: Buffer) => {
          received += chunk.length;
          if (received > maxResponseBytes) {
            response.destroy();
            req.destroy();
            fail("RESPONSE_TOO_LARGE", false);
          }
        });
        response.on("end", () =>
          finish(() =>
            resolve({
              statusCode: response.statusCode ?? 0,
              headers: response.headers,
              durationMs: elapsed(),
            }),
          ),
        );
        response.on("error", () => fail("NETWORK_ERROR", true));
      },
    );

    deadline.handle = setTimeout(() => {
      req.destroy();
      fail("TIMEOUT", true);
    }, request.timeoutMs);

    req.on("error", (error: NodeJS.ErrnoException) => {
      if (error instanceof DestinationBlockedError || error.name === "DestinationBlockedError") {
        fail("DESTINATION_BLOCKED", false);
      } else if (error.code === "ETIMEDOUT" || error.code === "ESOCKETTIMEDOUT") {
        fail("TIMEOUT", true);
      } else {
        fail("NETWORK_ERROR", true);
      }
    });
    req.write(request.body);
    req.end();
  });
};

export const parseRetryAfterMs = (
  value: string | string[] | undefined,
  now = Date.now(),
): number | null => {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return null;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000);
  const date = Date.parse(raw);
  return Number.isNaN(date) ? null : Math.max(0, date - now);
};

export const resultFromResponse = (response: SecureResponse): ChannelResult => {
  const { statusCode, durationMs } = response;
  if (statusCode >= 200 && statusCode < 300) {
    return { ok: true, responseCode: statusCode, durationMs };
  }
  const retryAfterMs = parseRetryAfterMs(response.headers["retry-after"]);
  const failure = (category: FailureCategory, transient: boolean): ChannelResult => ({
    ok: false,
    category,
    transient,
    responseCode: statusCode,
    retryAfterMs,
    durationMs,
  });
  if (statusCode === 429) return failure("RATE_LIMITED", true);
  if (statusCode === 408) return failure("TIMEOUT", true);
  if (statusCode >= 500) return failure("PROVIDER_ERROR", true);
  if (statusCode >= 300 && statusCode < 400) return failure("REDIRECT_REJECTED", false);
  if ([401, 403, 404, 410].includes(statusCode)) return failure("INVALID_CREDENTIALS", false);
  if ([400, 413, 422].includes(statusCode)) return failure("INVALID_PAYLOAD", false);
  return failure("UNKNOWN", false);
};

export const sendJsonSecurely = async (
  request: SecureRequest,
  deps: SecureClientDeps = {},
): Promise<ChannelResult> => {
  try {
    return resultFromResponse(await postJsonSecurely(request, deps));
  } catch (error) {
    if (error instanceof OutboundRequestError) {
      return {
        ok: false,
        category: error.category,
        transient: error.transient,
        responseCode: null,
        retryAfterMs: null,
        durationMs: error.durationMs,
      };
    }
    return {
      ok: false,
      category: "NETWORK_ERROR",
      transient: true,
      responseCode: null,
      retryAfterMs: null,
      durationMs: 0,
    };
  }
};
