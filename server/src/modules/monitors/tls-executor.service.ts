import tls from "node:tls";
import net from "node:net";
import { boundedLookup } from "./monitor-executor.service.js";
import type { CheckExecutionOutcome } from "./monitor-executor.service.js";
export const certificateOutcome = (
  cert: tls.PeerCertificate,
  hostname: string,
  warningDays: number,
  now = Date.now(),
): CheckExecutionOutcome => {
  const expires = Date.parse(cert.valid_to),
    starts = Date.parse(cert.valid_from);
  if (!Number.isFinite(expires) || !Number.isFinite(starts))
    return {
      success: false,
      durationMs: 0,
      nonQualifying: true,
      failureCategory: "TLS_DATA_UNAVAILABLE",
      errorMessage: "Certificate dates are unavailable.",
    };
  const hostnameValid = !tls.checkServerIdentity(hostname, cert);
  const daysRemaining = Math.floor((expires - now) / 86400000);
  const valid = hostnameValid && expires > now && starts <= now;
  return {
    success: valid && daysRemaining > warningDays,
    durationMs: 0,
    failureCategory: !valid
      ? "TLS_INVALID"
      : daysRemaining <= warningDays
        ? "TLS_EXPIRING"
        : undefined,
    errorMessage: !valid
      ? "Certificate validity or hostname verification failed."
      : daysRemaining <= warningDays
        ? "Certificate has reached its expiry warning threshold."
        : undefined,
    details: {
      certificateExpiresAt: new Date(expires),
      validFrom: new Date(starts),
      daysRemaining,
      issuer: String(cert.issuer?.O ?? cert.issuer?.CN ?? "Unknown").slice(0, 200),
      subject: String(cert.subject?.CN ?? "").slice(0, 253),
      subjectAltNames: (cert.subjectaltname ?? "")
        .split(", ")
        .filter((v) => v.startsWith("DNS:"))
        .slice(0, 30)
        .map((v) => v.slice(0, 260)),
      hostnameValid,
      certificateValid: valid,
    },
  };
};
export const executeTlsCheck = async (
  url: string,
  timeoutMs: number,
  warningDays: number,
): Promise<CheckExecutionOutcome> => {
  const start = performance.now();
  try {
    const parsed = new URL(url);
    if (
      parsed.protocol !== "https:" ||
      parsed.username ||
      parsed.password ||
      (parsed.port && !["443", "8443"].includes(parsed.port))
    )
      throw Object.assign(new Error(), { code: "SSRF_PROHIBITED_DESTINATION" });
    const hostname = parsed.hostname.replace(/^\[|\]$/g, "");
    const ip = await boundedLookup(hostname, timeoutMs);
    return await new Promise((resolve) => {
      const socket = tls.connect({
        host: ip,
        port: Number(parsed.port || 443),
        servername: net.isIP(hostname) ? undefined : hostname,
        rejectUnauthorized: true,
        checkServerIdentity: (_host, cert) => tls.checkServerIdentity(hostname, cert),
      });
      const timer = setTimeout(
        () => socket.destroy(Object.assign(new Error(), { code: "PROBE_TIMEOUT" })),
        Math.max(1, timeoutMs - (performance.now() - start)),
      );
      const finish = (result: CheckExecutionOutcome) => {
        clearTimeout(timer);
        socket.destroy();
        resolve({ ...result, durationMs: Math.max(1, Math.round(performance.now() - start)) });
      };
      socket.once("secureConnect", () =>
        finish(certificateOutcome(socket.getPeerCertificate(), hostname, warningDays)),
      );
      socket.once("error", (err: NodeJS.ErrnoException) =>
        finish({
          success: false,
          durationMs: 0,
          failureCategory:
            err.code === "PROBE_TIMEOUT"
              ? "TIMEOUT"
              : err.code === "ERR_TLS_CERT_ALTNAME_INVALID"
                ? "TLS_HOSTNAME_MISMATCH"
                : err.code?.includes("CERT") || err.code?.includes("VERIFY")
                  ? "TLS_INVALID"
                  : "TLS_HANDSHAKE_FAILED",
          errorMessage: "TLS connection or certificate verification failed.",
          details: { hostnameValid: false, certificateValid: false },
        }),
      );
    });
  } catch {
    return {
      success: false,
      durationMs: Math.max(1, Math.round(performance.now() - start)),
      nonQualifying: true,
      failureCategory: "TLS_DESTINATION_UNAVAILABLE",
      errorMessage: "TLS destination could not be safely resolved.",
    };
  }
};
