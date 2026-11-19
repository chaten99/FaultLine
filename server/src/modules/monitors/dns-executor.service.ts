import { Resolver } from "node:dns/promises";
import net from "node:net";
import { hostnameSchema, type DnsConfig } from "./advanced.validation.js";
import type { CheckExecutionOutcome } from "./monitor-executor.service.js";
import { isPrivateAddress } from "./monitor-url.service.js";
const displayDnsValue = (value: string) =>
  isPrivateAddress(value) ? "[private address]" : value.slice(0, 1000);

export const normalizeDnsValue = (value: string, type: string): string => {
  if (type === "TXT") return value;
  if (type === "AAAA" && net.isIPv6(value))
    return new URL("http://[" + value + "]").hostname.slice(1, -1);
  if (type === "MX") {
    const [priority, ...host] = value.trim().split(/\s+/);
    return String(Number(priority)) + " " + host.join(" ").toLowerCase().replace(/\.$/, "");
  }
  return value.trim().toLowerCase().replace(/\.$/, "");
};
export const executeDnsCheck = async (
  hostname: string,
  config: DnsConfig,
  timeoutMs: number,
  resolver = new Resolver({ timeout: timeoutMs, tries: 1 }),
): Promise<CheckExecutionOutcome> => {
  const start = performance.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    hostname = hostnameSchema.parse(hostname);
    const query = async (): Promise<string[]> => {
      switch (config.recordType) {
        case "A":
          return resolver.resolve4(hostname);
        case "AAAA":
          return resolver.resolve6(hostname);
        case "CNAME":
          return resolver.resolveCname(hostname);
        case "NS":
          return resolver.resolveNs(hostname);
        case "MX":
          return (await resolver.resolveMx(hostname)).map((v) => v.priority + " " + v.exchange);
        case "TXT":
          return (await resolver.resolveTxt(hostname)).map((v) => v.join(""));
      }
    };
    const raw = await Promise.race([
      query(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          resolver.cancel();
          reject(Object.assign(new Error(), { code: "ETIMEOUT" }));
        }, timeoutMs);
      }),
    ]);
    if (raw.length > 100 || raw.some((v) => v.length > 4096))
      return {
        success: false,
        durationMs: Math.round(performance.now() - start),
        nonQualifying: true,
        failureCategory: "DNS_RESULT_LIMIT",
        errorMessage: "DNS results exceeded safe limits.",
      };
    const values = [...new Set(raw.map((v) => normalizeDnsValue(v, config.recordType)))].sort();
    const expected = [
      ...new Set(config.expectedValues.map((v) => normalizeDnsValue(v, config.recordType))),
    ].sort();
    const success =
      values.length > 0 &&
      expected.every((v) => values.includes(v)) &&
      (config.comparison !== "exact" || values.length === expected.length);
    return {
      success,
      durationMs: Math.max(1, Math.round(performance.now() - start)),
      failureCategory: success ? undefined : "DNS_UNEXPECTED_RECORDS",
      errorMessage: success ? undefined : "DNS records did not match the expected set.",
      details: {
        hostname,
        recordType: config.recordType,
        values: values.slice(0, 50).map(displayDnsValue),
        expectedValues: expected.map(displayDnsValue),
        classification: success ? "EXPECTED_RESULT_PRESENT" : "MISSING_EXPECTED_RECORD",
      },
    };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return {
      success: false,
      durationMs: Math.max(1, Math.round(performance.now() - start)),
      failureCategory:
        code === "ENOTFOUND"
          ? "DNS_NXDOMAIN"
          : code === "ETIMEOUT" || code === "ECANCELLED"
            ? "TIMEOUT"
            : "DNS_FAILURE",
      errorMessage: "DNS resolution did not complete successfully.",
      details: {
        hostname,
        recordType: config.recordType,
        classification:
          code === "ENOTFOUND" ? "NXDOMAIN" : code === "ETIMEOUT" ? "TIMEOUT" : "RESOLUTION_FAILED",
      },
    };
  } finally {
    clearTimeout(timer);
  }
};
