import { executeSingleHop, type CheckExecutionOutcome } from "./monitor-executor.service.js";
import { hostnameSchema } from "./advanced.validation.js";
export type RegistrationData = {
  expiryDate?: string;
  provider: string;
  lastSuccessfulLookup: string;
  state: "known" | "unavailable" | "unsupported";
};
export interface RegistrationProvider {
  lookup(domain: string, timeoutMs: number): Promise<RegistrationData>;
}
export const readRdapExpiry = (data: unknown): string | undefined => {
  if (!data || typeof data !== "object" || !("events" in data) || !Array.isArray(data.events))
    return undefined;
  const dates = data.events
    .filter(
      (e: unknown) =>
        e &&
        typeof e === "object" &&
        "eventAction" in e &&
        e.eventAction === "expiration" &&
        "eventDate" in e &&
        typeof e.eventDate === "string",
    )
    .map((e: { eventDate: string }) => Date.parse(e.eventDate))
    .filter(Number.isFinite);
  return dates.length ? new Date(Math.min(...dates)).toISOString() : undefined;
};
type CacheEntry = { until: number; data: RegistrationData };
export class RdapProvider implements RegistrationProvider {
  private cache = new Map<string, CacheEntry>();
  private failures = new Map<string, number>();
  private bootstrap?: { until: number; services: Array<[string[], string[]]> };
  private inflight = new Map<string, Promise<RegistrationData>>();
  constructor(private readonly request = executeSingleHop) {}
  async lookup(domain: string, timeoutMs: number): Promise<RegistrationData> {
    domain = hostnameSchema.parse(domain);
    if ((this.failures.get(domain) ?? 0) > Date.now())
      throw new Error("Registration provider retry is cooling down");
    const cached = this.cache.get(domain);
    if (cached && cached.until > Date.now()) return cached.data;
    const pending = this.inflight.get(domain);
    if (pending) return pending;
    if (this.inflight.size >= 10) throw new Error("Provider concurrency limit reached");
    const task = this.retrieve(domain, timeoutMs)
      .then((data) => {
        if (this.cache.size >= 500) this.cache.delete(this.cache.keys().next().value!);
        this.cache.set(domain, {
          until: Date.now() + (data.state === "known" ? 21600000 : 3600000),
          data,
        });
        return data;
      })
      .catch((error) => {
        if (this.failures.size >= 500) this.failures.delete(this.failures.keys().next().value!);
        this.failures.set(domain, Date.now() + 300000);
        throw error;
      })
      .finally(() => this.inflight.delete(domain));
    this.inflight.set(domain, task);
    return task;
  }
  private async retrieve(domain: string, timeoutMs: number): Promise<RegistrationData> {
    const start = Date.now();
    const json = async (url: string) => {
      const remaining = timeoutMs - (Date.now() - start);
      if (remaining <= 0) throw new Error("Provider timeout");
      const result = await this.request(url, remaining, 1048576);
      if (result.statusCode !== 200) throw new Error("Provider unavailable");
      return JSON.parse(result.body) as Record<string, unknown>;
    };
    if (!this.bootstrap || this.bootstrap.until < Date.now()) {
      const data = await json("https://data.iana.org/rdap/dns.json");
      if (!Array.isArray(data.services) || data.services.length > 2000)
        throw new Error("Invalid bootstrap");
      this.bootstrap = {
        until: Date.now() + 86400000,
        services: data.services as Array<[string[], string[]]>,
      };
    }
    const tld = domain.split(".").at(-1)!;
    const base = this.bootstrap.services
      .find(([tlds]) => tlds.includes(tld))?.[1]
      .find((v) => v.startsWith("https://"));
    if (!base)
      return {
        provider: "IANA RDAP bootstrap",
        state: "unsupported",
        lastSuccessfulLookup: new Date().toISOString(),
      };
    const endpoint = new URL(base);
    const data = await json(
      new URL("domain/" + encodeURIComponent(domain), base.endsWith("/") ? base : base + "/").href,
    );
    const expiryDate = readRdapExpiry(data);
    return {
      provider: endpoint.hostname,
      expiryDate,
      state: expiryDate ? "known" : "unavailable",
      lastSuccessfulLookup: new Date().toISOString(),
    };
  }
}
const provider = new RdapProvider();
export const executeDomainCheck = async (
  domain: string,
  warningDays: number,
  timeoutMs: number,
  source: RegistrationProvider = provider,
): Promise<CheckExecutionOutcome> => {
  const start = performance.now();
  try {
    const data = await source.lookup(domain, timeoutMs);
    const daysRemaining = data.expiryDate
      ? Math.floor((Date.parse(data.expiryDate) - Date.now()) / 86400000)
      : undefined;
    const classification =
      daysRemaining === undefined
        ? data.state
        : daysRemaining < 0
          ? "expired"
          : daysRemaining <= warningDays
            ? "expiry_approaching"
            : "known";
    const known = daysRemaining !== undefined;
    const success = known && daysRemaining > warningDays;
    return {
      success,
      nonQualifying: !known,
      durationMs: Math.max(1, Math.round(performance.now() - start)),
      failureCategory: !known ? "DOMAIN_DATA_UNAVAILABLE" : success ? undefined : "DOMAIN_EXPIRING",
      errorMessage: !known
        ? "Authoritative registration expiry data is unavailable."
        : success
          ? undefined
          : "Domain registration has reached its expiry warning threshold.",
      details: {
        hostname: domain,
        provider: data.provider,
        expiryDate: data.expiryDate ? new Date(data.expiryDate) : undefined,
        lastSuccessfulLookup: new Date(data.lastSuccessfulLookup),
        daysRemaining,
        classification,
      },
    };
  } catch {
    return {
      success: false,
      nonQualifying: true,
      durationMs: Math.max(1, Math.round(performance.now() - start)),
      failureCategory: "DOMAIN_PROVIDER_UNAVAILABLE",
      errorMessage: "Registration provider is unavailable; domain expiry is unknown.",
      details: { hostname: domain, classification: "provider_unavailable" },
    };
  }
};
