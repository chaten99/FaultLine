import type { Monitor, MonitorCheck } from "../api/monitors.api";
import { formatStatusCodes } from "../schemas/monitor.schema";

export type CheckPresentation = {
  resultLabel: "Up" | "Down" | "Timeout" | "Error" | "Checking" | "Queued";
  badgeVariant: "default" | "outline" | "destructive" | "muted";
  httpResponseDisplay: string;
  durationDisplay: string;
  summary: string;
  detailedExplanation: string;
  guidance?: string;
  expectedVsActual: {
    expectedStatusCodes: string;
    actualStatusCode: string;
    configuredTimeout: string;
    actualDuration: string;
  };
  diagnostics: {
    errorCode?: string;
    classification: string;
    statusCode?: number;
    safeErrorSummary?: string;
    runId: string;
    checkId: string;
  };
};

export const getHttpStatusName = (code?: number): string => {
  if (!code) return "";
  switch (code) {
    case 200:
      return "OK";
    case 201:
      return "Created";
    case 202:
      return "Accepted";
    case 204:
      return "No Content";
    case 301:
      return "Moved Permanently";
    case 302:
      return "Found";
    case 304:
      return "Not Modified";
    case 307:
      return "Temporary Redirect";
    case 308:
      return "Permanent Redirect";
    case 400:
      return "Bad Request";
    case 401:
      return "Unauthorized";
    case 403:
      return "Forbidden";
    case 404:
      return "Not Found";
    case 405:
      return "Method Not Allowed";
    case 408:
      return "Request Timeout";
    case 429:
      return "Too Many Requests";
    case 500:
      return "Internal Server Error";
    case 502:
      return "Bad Gateway";
    case 503:
      return "Service Unavailable";
    case 504:
      return "Gateway Timeout";
    default:
      if (code >= 200 && code < 300) return "Success";
      if (code >= 300 && code < 400) return "Redirect";
      if (code >= 400 && code < 500) return "Client Error";
      if (code >= 500 && code < 600) return "Server Error";
      return "";
  }
};

export const presentCheck = (
  check: MonitorCheck,
  monitor?: Pick<Monitor, "expectedStatusCodes" | "timeoutMs"> | null,
): CheckPresentation => {
  const statusCode = check.statusCode;
  const statusName = getHttpStatusName(statusCode);
  const failureCategory = check.failureCategory;
  const durationMs = check.responseDurationMs;

  const expectedCodesFormatted = monitor?.expectedStatusCodes?.length
    ? formatStatusCodes(monitor.expectedStatusCodes)
    : "200";

  const configuredTimeoutFormatted = monitor?.timeoutMs
    ? `${Math.round(monitor.timeoutMs / 1000)}s (${monitor.timeoutMs.toLocaleString()}ms)`
    : "10s (10,000ms)";

  const actualDurationFormatted =
    typeof durationMs === "number" ? `${durationMs.toLocaleString()}ms` : "—";

  const actualStatusFormatted = statusCode
    ? `${statusCode}${statusName ? ` ${statusName}` : ""}`
    : "No response";

  let resultLabel: CheckPresentation["resultLabel"] = "Down";
  let badgeVariant: CheckPresentation["badgeVariant"] = "destructive";
  let summary = "The check failed to complete.";
  let detailedExplanation = "The probe encountered an error while contacting the endpoint.";
  let guidance: string | undefined = undefined;
  let classification = "Target endpoint health failure";

  switch (check.status) {
    case "success":
      resultLabel = "Up";
      badgeVariant = "outline";
      summary = `Healthy response (HTTP ${statusCode || 200}).`;
      detailedExplanation = `FaultLine successfully connected to the endpoint and received HTTP ${
        statusCode || 200
      } in ${actualDurationFormatted}, matching the configured success criteria.`;
      classification = "Successful probe";
      break;

    case "timeout":
      resultLabel = "Timeout";
      badgeVariant = "destructive";
      summary = "The endpoint did not respond within the configured timeout.";
      detailedExplanation = `FaultLine attempted to connect to the endpoint, but the request timed out after waiting for the configured threshold of ${configuredTimeoutFormatted}.`;
      guidance =
        "The server may be overloaded, experiencing severe latency, or hanging before returning HTTP headers. Consider optimizing backend response times or adjusting the timeout setting.";
      classification = "Timeout";
      break;

    case "error":
      resultLabel = "Error";
      badgeVariant = "destructive";
      break;

    case "running":
      resultLabel = "Checking";
      badgeVariant = "outline";
      summary = "Probe is actively executing.";
      detailedExplanation = "FaultLine is currently probing this endpoint.";
      classification = "In progress";
      break;

    case "queued":
      resultLabel = "Queued";
      badgeVariant = "muted";
      summary = "Probe is queued for execution.";
      detailedExplanation =
        "The check has been placed in the job queue and is waiting for an available worker.";
      classification = "Pending execution";
      break;

    case "failure":
    default:
      resultLabel = "Down";
      badgeVariant = "destructive";
      break;
  }

  // Handle specific failure categories and HTTP status codes
  if (check.status === "failure" || check.status === "error") {
    if (statusCode === 401) {
      summary = "The endpoint rejected the request.";
      detailedExplanation = `FaultLine successfully connected to the endpoint, but the server returned HTTP 401 Unauthorized. The configured expected status was [${expectedCodesFormatted}], so this check was marked as failed.`;
      guidance =
        "The endpoint may require authentication or access permissions. FaultLine currently uses standard GET requests without custom authentication headers. Verify whether a public health check URL is available, or add 401 to the expected status codes if this response is intentional.";
      classification = "Target endpoint health failure (HTTP 401)";
    } else if (statusCode === 403) {
      summary = "The server understood the request but denied access.";
      detailedExplanation = `FaultLine successfully reached the endpoint, but the server returned HTTP 403 Forbidden. The expected status was [${expectedCodesFormatted}].`;
      guidance =
        "The endpoint may have IP allowlisting, firewall rules, or security policies preventing automated probes from accessing the route.";
      classification = "Target endpoint health failure (HTTP 403)";
    } else if (statusCode === 404) {
      summary = "The requested endpoint was not found.";
      detailedExplanation = `FaultLine reached the server, but the requested URL returned HTTP 404 Not Found.`;
      guidance =
        "Verify that the endpoint path exists and that the route is correctly configured on your server.";
      classification = "Target endpoint health failure (HTTP 404)";
    } else if (statusCode === 500) {
      summary = "The endpoint returned an internal server error.";
      detailedExplanation = `The server encountered an unhandled exception or crash while processing the probe (HTTP 500).`;
      guidance =
        "Inspect your application server logs to diagnose and fix the internal server error.";
      classification = "Target server error (HTTP 500)";
    } else if (statusCode === 502) {
      summary = "The endpoint returned a bad gateway error.";
      detailedExplanation = `A reverse proxy, load balancer, or gateway received an invalid response from upstream (HTTP 502).`;
      guidance =
        "Verify that your upstream application process is running and reachable by your reverse proxy / ingress.";
      classification = "Gateway / Proxy failure (HTTP 502)";
    } else if (statusCode === 503) {
      summary = "The service is temporarily unavailable.";
      detailedExplanation = `The server returned HTTP 503 Service Unavailable, indicating it is currently unable to handle the request.`;
      guidance =
        "The service may be down for maintenance, rebooting, or temporarily overwhelmed by traffic.";
      classification = "Service unavailable (HTTP 503)";
    } else if (statusCode === 504) {
      summary = "The gateway timed out contacting upstream.";
      detailedExplanation = `A reverse proxy or gateway timed out while waiting for a response from the upstream application server (HTTP 504).`;
      guidance = "Check upstream server health and response time performance.";
      classification = "Gateway timeout (HTTP 504)";
    } else if (failureCategory === "UNEXPECTED_STATUS" && statusCode) {
      summary = `The endpoint returned HTTP ${statusCode}, but FaultLine expected ${expectedCodesFormatted}.`;
      detailedExplanation = `FaultLine successfully connected to the endpoint, but the server returned HTTP ${statusCode}${
        statusName ? ` ${statusName}` : ""
      }. The configured expected status was [${expectedCodesFormatted}], so this check was marked as failed.`;
      guidance =
        "Check whether your endpoint returned an unexpected error code or if your expected status code configuration needs to be updated.";
      classification = `Unexpected HTTP status (${statusCode})`;
    } else if (failureCategory === "TIMEOUT") {
      summary = "The endpoint did not respond within the configured timeout.";
      detailedExplanation = `The endpoint did not return headers within ${configuredTimeoutFormatted}.`;
      guidance =
        "Check server resource utilization, latency, and ensure network firewalls allow probe traffic.";
      classification = "Timeout";
    } else if (failureCategory === "DNS_FAILURE") {
      summary = "FaultLine could not resolve the endpoint hostname.";
      detailedExplanation = `DNS resolution failed for the endpoint hostname. FaultLine could not determine an IP address.`;
      guidance =
        "Verify domain spelling, DNS registrar configuration, and public nameserver records.";
      classification = "DNS resolution failure";
    } else if (failureCategory === "NETWORK_ERROR") {
      summary = "FaultLine could not establish a connection to the endpoint.";
      detailedExplanation = `FaultLine could not establish a TCP or TLS connection to the remote endpoint.`;
      guidance =
        "Verify that the host is online, the port is open and accessible from the public internet, and SSL/TLS certificates are valid.";
      classification = "Network connection failure";
    } else if (failureCategory === "SSRF_PROHIBITED") {
      summary = "Destination address is prohibited by security policy.";
      detailedExplanation = `FaultLine security policy blocked this request because the destination resolves to a private, loopback, or reserved address.`;
      guidance =
        "FaultLine requires endpoints to have public IP addresses accessible over the public internet.";
      classification = "Security policy restriction";
    } else if (failureCategory === "RESPONSE_TOO_LARGE") {
      summary = "Response payload exceeded maximum allowed threshold.";
      detailedExplanation = `The server returned a response body larger than the 64KB safety limit for health probes.`;
      guidance = "Health check endpoints should return lightweight JSON or empty response bodies.";
      classification = "Response size limit exceeded";
    } else if (check.errorMessage) {
      summary = check.errorMessage.replace(/^\[[A-Z_]+\]\s*/, "");
      detailedExplanation = check.errorMessage;
    }
  }

  // Sanitize any raw error message for safe display in diagnostics
  const sanitizedErrorSummary = check.errorMessage
    ? check.errorMessage
        .replace(/authorization:\s*[^\s,]+/gi, "Authorization: [REDACTED]")
        .replace(/bearer\s+[a-zA-Z0-9._-]+/gi, "Bearer [REDACTED]")
        .replace(/([?&](?:key|token|secret|password|auth)=)[^&]+/gi, "$1[REDACTED]")
    : undefined;

  return {
    resultLabel,
    badgeVariant,
    httpResponseDisplay: statusCode ? String(statusCode) : "—",
    durationDisplay: typeof durationMs === "number" ? `${durationMs}ms` : "—",
    summary,
    detailedExplanation,
    guidance,
    expectedVsActual: {
      expectedStatusCodes: expectedCodesFormatted,
      actualStatusCode: actualStatusFormatted,
      configuredTimeout: configuredTimeoutFormatted,
      actualDuration: actualDurationFormatted,
    },
    diagnostics: {
      errorCode: failureCategory,
      classification,
      statusCode,
      safeErrorSummary: sanitizedErrorSummary,
      runId: check.runId,
      checkId: check._id,
    },
  };
};
