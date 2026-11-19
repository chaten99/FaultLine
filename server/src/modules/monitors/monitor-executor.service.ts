import http from "node:http";
import https from "node:https";
import dns from "node:dns/promises";
import net from "node:net";
import tls from "node:tls";
import zlib from "node:zlib";
import { buildRequest, type MonitorSecrets } from "./monitor-credentials.service.js";
import type { HttpConfig } from "./advanced.validation.js";
import { evaluateAssertions } from "./response-assertions.js";
import { isBlockedHostname, isPrivateAddress } from "./monitor-url.service.js";
import { createApiError } from "../../lib/errors/create-api-error.js";

const permittedPorts = new Set([80, 443, 8080, 8443]);

export type ProbeOptions = {
  timeoutMs?: number;
  followRedirects?: boolean;
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

export type CheckExecutionOutcome = {
  success: boolean;
  statusCode?: number;
  durationMs: number;
  failureCategory?: string;
  errorMessage?: string;
  resolvedIp?: string;
  nonQualifying?: boolean;
  details?: ProtocolDetails;
};

export const resolveSafeIp = async (hostname: string): Promise<string> => {
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

export const executeSingleHop = async (
  targetUrl: string,
  timeoutMs: number,
  maxBodyBytes: number,
  settings: { method?: string; headers?: Record<string, string>; body?: string } = {},
): Promise<{
  statusCode: number;
  headers: http.IncomingHttpHeaders;
  resolvedIp: string;
  durationMs: number;
  body: string;
}> => {
  const hopStarted = performance.now();
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

  const isHttps = parsed.protocol === "https:";
  const port = parsed.port ? Number(parsed.port) : isHttps ? 443 : 80;

  if (!permittedPorts.has(port)) {
    throw createApiError(
      `Port ${port} is not permitted for monitoring.`,
      400,
      "PORT_NOT_PERMITTED",
    );
  }

  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const safeIp = await boundedLookup(hostname, timeoutMs);

  timeoutMs = Math.max(1, timeoutMs - (performance.now() - hopStarted));
  const transport = isHttps ? https : http;

  return new Promise((resolve, reject) => {
    const startTime = performance.now();

    const requestOptions: https.RequestOptions = {
      method: settings.method ?? "GET",
      host: safeIp,
      port,
      path: parsed.pathname + parsed.search,
      headers: {
        ...settings.headers,
        Host: parsed.host,
        "Accept-Encoding": "gzip, deflate, br",
        "User-Agent": "FaultLine-Probe/1.0 (+https://faultline.io)",
        Accept: "*/*",
        Connection: "close",
      },
      servername: net.isIP(hostname) === 0 ? hostname : undefined,
      timeout: timeoutMs,
      checkServerIdentity: (_host, cert) => tls.checkServerIdentity(hostname, cert),
      lookup: (_hostname, _options, callback) => {
        callback(null, safeIp, net.isIPv6(safeIp) ? 6 : 4);
      },
    };

    const timer = setTimeout(
      () => req.destroy(createApiError("Request timed out.", 504, "PROBE_TIMEOUT")),
      timeoutMs,
    );
    const req = transport.request(requestOptions, (res) => {
      const encoding = res.headers["content-encoding"];
      const stream =
        encoding === "gzip"
          ? res.pipe(zlib.createGunzip())
          : encoding === "deflate"
            ? res.pipe(zlib.createInflate())
            : encoding === "br"
              ? res.pipe(zlib.createBrotliDecompress())
              : res;
      const chunks: Buffer[] = [];
      stream.on("error", () =>
        req.destroy(createApiError("Invalid compressed response.", 400, "INVALID_MONITOR_CONFIG")),
      );
      res.on("aborted", () =>
        req.destroy(createApiError("Response interrupted.", 400, "INVALID_MONITOR_CONFIG")),
      );
      let bytesRead = 0;
      stream.on("data", (chunk: Buffer) => {
        bytesRead += chunk.length;
        if (bytesRead <= maxBodyBytes) chunks.push(chunk);
        if (bytesRead > maxBodyBytes) {
          req.destroy(createApiError("Response body exceeded limit.", 413, "RESPONSE_TOO_LARGE"));
        }
      });

      stream.on("end", () => {
        clearTimeout(timer);
        const durationMs = Math.max(1, Math.round(performance.now() - startTime));
        resolve({
          body: Buffer.concat(chunks).toString("utf8"),
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

    req.once("close", () => clearTimeout(timer));
    req.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });

    req.end(settings.body);
  });
};

export const executeSafeProbe = async (
  initialUrl: string,
  options: ProbeOptions = {},
): Promise<ProbeResult> => {
  const timeoutMs = options.timeoutMs ?? 10000;
  const shouldFollow = options.followRedirects !== false;
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

    if (isRedirect && shouldFollow && redirectsFollowed < maxRedirects) {
      redirectsFollowed++;
      const redirectLocation = hop.headers.location as string;
      const nextUrl = new URL(redirectLocation, currentUrl).toString();
      currentUrl = nextUrl;
      continue;
    }

    if (isRedirect && shouldFollow && redirectsFollowed >= maxRedirects) {
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

export const executeMonitorHttpCheck = async (monitor: {
  url: string;
  timeoutMs: number;
  expectedStatusCodes: number[];
  method?: string;
  httpConfig?: HttpConfig;
  secrets?: MonitorSecrets;
}): Promise<CheckExecutionOutcome> => {
  const startTime = performance.now();
  try {
    const hop = await executeSingleHop(monitor.url, monitor.timeoutMs, 65536, {
      method: monitor.method,
      ...buildRequest(monitor.httpConfig, monitor.secrets ?? {}),
    });
    const durationMs = hop.durationMs;
    const isSuccess = monitor.expectedStatusCodes.includes(hop.statusCode);

    const assertionResults = evaluateAssertions(hop.body, monitor.httpConfig);
    const details = {
      method: monitor.method ?? "GET",
      destination: new URL(monitor.url).origin,
      authType: monitor.httpConfig?.authType ?? "none",
      expectedStatusCodes: monitor.expectedStatusCodes,
      assertionResults,
    };
    if (isSuccess && assertionResults.some((r) => !r.passed))
      return {
        success: false,
        statusCode: hop.statusCode,
        durationMs,
        failureCategory: "RESPONSE_ASSERTION_FAILED",
        errorMessage: "Response assertions failed.",
        details,
      };
    if (isSuccess) {
      return {
        success: true,
        details,
        statusCode: hop.statusCode,
        durationMs,
        resolvedIp: hop.resolvedIp,
      };
    }

    return {
      success: false,
      details,
      statusCode: hop.statusCode,
      durationMs,
      failureCategory: "UNEXPECTED_STATUS",
      errorMessage: `Endpoint returned HTTP status ${hop.statusCode}, expected [${monitor.expectedStatusCodes.join(", ")}].`,
      resolvedIp: hop.resolvedIp,
    };
  } catch (error: unknown) {
    const durationMs = Math.max(1, Math.round(performance.now() - startTime));
    let failureCategory = "NETWORK_ERROR";
    let errorMessage = "An error occurred while executing the HTTP check.";

    if (error && typeof error === "object") {
      const err = error as { code?: string; message?: string };
      if (err.code === "PROBE_TIMEOUT") {
        failureCategory = "TIMEOUT";
        errorMessage = `Request timed out after ${monitor.timeoutMs}ms.`;
      } else if (
        err.code === "SSRF_PROHIBITED_DESTINATION" ||
        err.code === "CREDENTIALS_PROHIBITED" ||
        err.code === "UNSUPPORTED_PROTOCOL" ||
        err.code === "PORT_NOT_PERMITTED"
      ) {
        failureCategory = "SSRF_PROHIBITED";
        errorMessage = "Destination address is prohibited by security policy.";
      } else if (
        ["DNS_RESOLUTION_FAILED", "ENOTFOUND", "EAI_AGAIN", "ENODATA"].includes(err.code ?? "")
      ) {
        failureCategory = "DNS_FAILURE";
        errorMessage = "Could not resolve hostname.";
      } else if (err.code === "RESPONSE_TOO_LARGE") {
        failureCategory = "RESPONSE_TOO_LARGE";
        errorMessage = "Response payload exceeded maximum allowed threshold (64KB).";
      } else if (
        err.code?.startsWith("ERR_TLS") ||
        err.code?.includes("CERT") ||
        err.code?.includes("VERIFY")
      ) {
        failureCategory = "TLS_INVALID";
        errorMessage = "TLS certificate verification failed.";
      }
    }

    return {
      success: false,
      durationMs,
      failureCategory,
      nonQualifying: failureCategory === "SSRF_PROHIBITED",
      errorMessage,
    };
  }
};

export const boundedLookup = async (hostname: string, timeoutMs: number): Promise<string> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      resolveSafeIp(hostname),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(createApiError("DNS lookup timed out.", 504, "PROBE_TIMEOUT")),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
};

export type ProtocolDetails = {
  method?: string;
  destination?: string;
  authType?: string;
  expectedStatusCodes?: number[];
  assertionResults?: Array<{ index: number; passed: boolean; message: string }>;
  certificateExpiresAt?: Date;
  validFrom?: Date;
  daysRemaining?: number;
  issuer?: string;
  subject?: string;
  subjectAltNames?: string[];
  hostnameValid?: boolean;
  certificateValid?: boolean;
  hostname?: string;
  recordType?: string;
  values?: string[];
  expectedValues?: string[];
  classification?: string;
  provider?: string;
  lastSuccessfulLookup?: Date;
  expiryDate?: Date;
};
