import http from "node:http";
import https from "node:https";
import dns from "node:dns/promises";
import net from "node:net";
import { isBlockedHostname, isPrivateAddress } from "./monitor-url.service.js";
import { createApiError } from "../../lib/errors/create-api-error.js";

export type ProbeOptions = {
  timeoutMs?: number;
  maxRedirects?: number;
  expectedStatusCodes?: number[];
  maxBodyBytes?: number;
};

export type ProbeResult = {
  url: string;
  finalUrl: string;
  statusCode: number;
  durationMs: number;
  success: boolean;
  redirectsFollowed: number;
  resolvedIp?: string;
  error?: string;
};

const resolveSafeIp = async (hostname: string): Promise<string> => {
  if (isBlockedHostname(hostname)) {
    throw createApiError(
      "Destination hostname is not permitted.",
      400,
      "SSRF_PROHIBITED_DESTINATION",
    );
  }
  const addresses = await dns.lookup(hostname, { all: true });
  if (addresses.length === 0) {
    throw createApiError(`Could not resolve host ${hostname}.`, 400, "DNS_RESOLUTION_FAILED");
  }
  for (const { address } of addresses) {
    if (isPrivateAddress(address)) {
      throw createApiError(
        `Destination IP ${address} is not permitted.`,
        400,
        "SSRF_PROHIBITED_DESTINATION",
      );
    }
  }
  const first = addresses[0];
  if (!first) {
    throw createApiError(`Could not resolve host ${hostname}.`, 400, "DNS_RESOLUTION_FAILED");
  }
  return first.address;
};

const executeSingleHop = async (
  targetUrl: string,
  timeoutMs: number,
  maxBodyBytes: number,
): Promise<{
  statusCode: number;
  headers: http.IncomingHttpHeaders;
  resolvedIp: string;
  durationMs: number;
}> => {
  const parsed = new URL(targetUrl);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw createApiError(
      "Only HTTP and HTTPS protocols are supported.",
      400,
      "UNSUPPORTED_PROTOCOL",
    );
  }
  if (parsed.username || parsed.password) {
    throw createApiError("Credentials in URLs are not permitted.", 400, "CREDENTIALS_PROHIBITED");
  }

  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const safeIp = await resolveSafeIp(hostname);

  const isHttps = parsed.protocol === "https:";
  const port = parsed.port ? Number(parsed.port) : isHttps ? 443 : 80;

  const transport = isHttps ? https : http;

  return new Promise((resolve, reject) => {
    const startTime = performance.now();

    const requestOptions: https.RequestOptions = {
      method: "GET",
      host: safeIp,
      port,
      path: parsed.pathname + parsed.search,
      headers: {
        Host: parsed.host,
        "User-Agent": "FaultLine-Probe/1.0 (+https://faultline.io)",
        Accept: "*/*",
        Connection: "close",
      },
      servername: net.isIP(hostname) === 0 ? hostname : undefined,
      timeout: timeoutMs,
      lookup: (_hostname, _options, callback) => {
        callback(null, safeIp, net.isIPv6(safeIp) ? 6 : 4);
      },
    };

    const req = transport.request(requestOptions, (res) => {
      let bytesRead = 0;
      res.on("data", (chunk: Buffer) => {
        bytesRead += chunk.length;
        if (bytesRead > maxBodyBytes) {
          req.destroy(createApiError("Response body exceeded limit.", 413, "RESPONSE_TOO_LARGE"));
        }
      });

      res.on("end", () => {
        const durationMs = Math.round(performance.now() - startTime);
        resolve({
          statusCode: res.statusCode ?? 0,
          headers: res.headers,
          resolvedIp: safeIp,
          durationMs,
        });
      });
    });

    req.on("timeout", () => {
      req.destroy(createApiError(`Request timed out after ${timeoutMs}ms.`, 504, "PROBE_TIMEOUT"));
    });

    req.on("error", (err) => {
      reject(err);
    });

    req.end();
  });
};

export const executeSafeProbe = async (
  initialUrl: string,
  options: ProbeOptions = {},
): Promise<ProbeResult> => {
  const timeoutMs = options.timeoutMs ?? 10000;
  const maxRedirects = options.maxRedirects ?? 3;
  const expectedCodes = options.expectedStatusCodes ?? [200];
  const maxBodyBytes = options.maxBodyBytes ?? 65536;

  let currentUrl = initialUrl;
  let redirectsFollowed = 0;
  let totalDuration = 0;
  let lastResolvedIp: string | undefined;

  while (true) {
    const hop = await executeSingleHop(currentUrl, timeoutMs, maxBodyBytes);
    totalDuration += hop.durationMs;
    lastResolvedIp = hop.resolvedIp;

    const isRedirect = [301, 302, 303, 307, 308].includes(hop.statusCode) && hop.headers.location;

    if (isRedirect && redirectsFollowed < maxRedirects) {
      redirectsFollowed++;
      const redirectLocation = hop.headers.location as string;
      const nextUrl = new URL(redirectLocation, currentUrl).toString();
      currentUrl = nextUrl;
      continue;
    }

    if (isRedirect && redirectsFollowed >= maxRedirects) {
      throw createApiError(
        `Exceeded maximum redirect limit of ${maxRedirects}.`,
        400,
        "TOO_MANY_REDIRECTS",
      );
    }

    const success = expectedCodes.includes(hop.statusCode);

    return {
      url: initialUrl,
      finalUrl: currentUrl,
      statusCode: hop.statusCode,
      durationMs: totalDuration,
      success,
      redirectsFollowed,
      resolvedIp: lastResolvedIp,
    };
  }
};
