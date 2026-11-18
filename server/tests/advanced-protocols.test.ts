import { afterEach, describe, expect, it, vi } from "vitest";
import tls from "node:tls";
import dns, { Resolver } from "node:dns/promises";
import { EventEmitter } from "node:events";
import {
  certificateOutcome,
  executeTlsCheck,
} from "../src/modules/monitors/tls-executor.service.js";
import {
  executeDnsCheck,
  normalizeDnsValue,
} from "../src/modules/monitors/dns-executor.service.js";
import {
  executeDomainCheck,
  RdapProvider,
  readRdapExpiry,
} from "../src/modules/monitors/domain-executor.service.js";
import { hostnameSchema } from "../src/modules/monitors/advanced.validation.js";
import type { executeSingleHop } from "../src/modules/monitors/monitor-executor.service.js";
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});
const now = Date.parse("2026-11-17T00:00:00Z");
const cert = (days = 90) =>
  ({
    valid_from: "Jan 1 00:00:00 2026 GMT",
    valid_to: new Date(now + days * 86400000).toUTCString(),
    subject: { CN: "example.com" },
    issuer: { O: "Test CA" },
    subjectaltname: "DNS:example.com, DNS:www.example.com",
  }) as tls.PeerCertificate;
describe("TLS certificate monitoring", () => {
  it("uses actual certificate dates, issuer and hostname verification", () => {
    const result = certificateOutcome(cert(), "example.com", 30, now);
    expect(result.success).toBe(true);
    expect(result.details).toMatchObject({
      daysRemaining: 90,
      issuer: "Test CA",
      hostnameValid: true,
      certificateValid: true,
    });
  });
  it.each([-1, 0, 7, 14, 30])("fails or warns for %i days remaining", (days) => {
    const result = certificateOutcome(cert(days), "example.com", 30, now);
    expect(result.success).toBe(false);
    expect(result.failureCategory).toBe(days <= 0 ? "TLS_INVALID" : "TLS_EXPIRING");
  });
  it("detects hostname mismatch", () =>
    expect(certificateOutcome(cert(), "other.com", 30, now)).toMatchObject({
      success: false,
      details: { hostnameValid: false },
    }));
  it("treats absent certificate dates as unavailable", () =>
    expect(certificateOutcome({} as tls.PeerCertificate, "example.com", 30, now)).toMatchObject({
      nonQualifying: true,
      failureCategory: "TLS_DATA_UNAVAILABLE",
    }));
  it("rejects private destinations without opening TLS", async () => {
    vi.spyOn(dns, "lookup").mockResolvedValue([{ address: "10.0.0.1", family: 4 }] as never);
    const connect = vi.spyOn(tls, "connect");
    expect(await executeTlsCheck("https://example.com", 1000, 30)).toMatchObject({
      nonQualifying: true,
    });
    expect(connect).not.toHaveBeenCalled();
  });
  it.each([
    "CERT_HAS_EXPIRED",
    "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
    "ERR_TLS_CERT_ALTNAME_INVALID",
    "ECONNRESET",
  ])("classifies %s safely and keeps verification enabled", async (code) => {
    vi.spyOn(dns, "lookup").mockResolvedValue([{ address: "93.184.216.34", family: 4 }] as never);
    const socket = new EventEmitter() as EventEmitter & { destroy: () => void };
    socket.destroy = vi.fn();
    const connect = vi.spyOn(tls, "connect").mockImplementation(() => {
      process.nextTick(() =>
        socket.emit("error", Object.assign(new Error("private diagnostics"), { code })),
      );
      return socket as never;
    });
    const result = await executeTlsCheck("https://example.com", 1000, 30);
    expect(result.success).toBe(false);
    expect(JSON.stringify(result)).not.toContain("private diagnostics");
    expect(connect.mock.calls[0]?.[0]).toMatchObject({
      host: "93.184.216.34",
      servername: "example.com",
      rejectUnauthorized: true,
    });
  });
});
describe("bounded DNS monitoring", () => {
  const cases = [
    { type: "A", method: "resolve4", raw: ["93.184.216.34"], expected: "93.184.216.34" },
    {
      type: "AAAA",
      method: "resolve6",
      raw: ["2001:4860:4860:0:0:0:0:8888"],
      expected: "2001:4860:4860::8888",
    },
    {
      type: "CNAME",
      method: "resolveCname",
      raw: ["TARGET.Example.COM."],
      expected: "target.example.com",
    },
    { type: "NS", method: "resolveNs", raw: ["NS1.Example.COM."], expected: "ns1.example.com" },
    {
      type: "MX",
      method: "resolveMx",
      raw: [{ priority: 10, exchange: "MAIL.Example.COM." }],
      expected: "10 mail.example.com",
    },
    { type: "TXT", method: "resolveTxt", raw: [["part1", "part2"]], expected: "part1part2" },
  ] as const;
  it.each(cases)("resolves and normalizes $type", async (c) => {
    const resolver = new Resolver();
    vi.spyOn(resolver, c.method).mockResolvedValue(c.raw as never);
    const result = await executeDnsCheck(
      "example.com",
      { recordType: c.type, expectedValues: [c.expected], comparison: "includes" },
      1000,
      resolver,
    );
    expect(result.success).toBe(true);
    expect(result.details?.values).toContain(c.expected);
  });
  it("detects missing expected records and exact-set mismatches", async () => {
    const resolver = new Resolver();
    vi.spyOn(resolver, "resolve4").mockResolvedValue(["93.184.216.34", "8.8.8.8"]);
    for (const config of [
      { expectedValues: ["1.1.1.1"], comparison: "includes" },
      { expectedValues: ["8.8.8.8"], comparison: "exact" },
    ] as const) {
      expect(
        await executeDnsCheck(
          "example.com",
          { recordType: "A", ...config, expectedValues: [...config.expectedValues] },
          1000,
          resolver,
        ),
      ).toMatchObject({ success: false, failureCategory: "DNS_UNEXPECTED_RECORDS" });
    }
  });
  it.each(["ENOTFOUND", "ENODATA", "ETIMEOUT"])("classifies resolver error %s", async (code) => {
    const resolver = new Resolver();
    vi.spyOn(resolver, "resolve4").mockRejectedValue(
      Object.assign(new Error("resolver 10.0.0.2"), { code }),
    );
    const result = await executeDnsCheck(
      "example.com",
      { recordType: "A", expectedValues: [], comparison: "includes" },
      1000,
      resolver,
    );
    expect(result.success).toBe(false);
    expect(JSON.stringify(result)).not.toContain("10.0.0.2");
  });
  it("cancels a stalled resolver", async () => {
    const resolver = new Resolver();
    vi.spyOn(resolver, "resolve4").mockImplementation(() => new Promise(() => {}));
    const cancel = vi.spyOn(resolver, "cancel").mockImplementation(() => {});
    const result = await executeDnsCheck(
      "example.com",
      { recordType: "A", expectedValues: [], comparison: "includes" },
      10,
      resolver,
    );
    expect(result.failureCategory).toBe("TIMEOUT");
    expect(cancel).toHaveBeenCalled();
  });
  it("bounds record counts", async () => {
    const resolver = new Resolver();
    vi.spyOn(resolver, "resolve4").mockResolvedValue(Array.from({ length: 101 }, () => "8.8.8.8"));
    expect(
      await executeDnsCheck(
        "example.com",
        { recordType: "A", expectedValues: [], comparison: "includes" },
        1000,
        resolver,
      ),
    ).toMatchObject({ nonQualifying: true, failureCategory: "DNS_RESULT_LIMIT" });
  });
  it.each(["localhost", "bad..com", "-bad.example", "example.com;rm -rf /", "http://example.com"])(
    "rejects malformed hostname %s",
    (host) => expect(() => hostnameSchema.parse(host)).toThrow(),
  );
  it("keeps TXT case-sensitive and canonicalizes MX", () => {
    expect(normalizeDnsValue("TokenABC", "TXT")).toBe("TokenABC");
    expect(normalizeDnsValue("010 MAIL.Example.COM.", "MX")).toBe("10 mail.example.com");
  });
});
describe("authoritative registration expiry", () => {
  const mockRequest = () =>
    vi
      .fn()
      .mockResolvedValueOnce({
        statusCode: 200,
        body: JSON.stringify({ services: [[["com"], ["https://registry.example/rdap/"]]] }),
      })
      .mockResolvedValue({
        statusCode: 200,
        body: JSON.stringify({
          events: [{ eventAction: "expiration", eventDate: "2027-11-17T00:00:00Z" }],
        }),
      });
  it("reads expiration events without inventing dates from other events", () => {
    expect(
      readRdapExpiry({ events: [{ eventAction: "registration", eventDate: "2027-01-01" }] }),
    ).toBeUndefined();
    expect(
      readRdapExpiry({ events: [{ eventAction: "expiration", eventDate: "invalid" }] }),
    ).toBeUndefined();
    expect(
      readRdapExpiry({
        events: [{ eventAction: "expiration", eventDate: "2027-01-01T00:00:00Z" }],
      }),
    ).toBe("2027-01-01T00:00:00.000Z");
  });
  it("resolves the IANA provider, caches results and coalesces concurrent checks", async () => {
    const transport = mockRequest();
    const provider = new RdapProvider(transport as typeof executeSingleHop);
    const [a, b] = await Promise.all([
      provider.lookup("example.com", 1000),
      provider.lookup("example.com", 1000),
    ]);
    expect(a).toEqual(b);
    expect(a.provider).toBe("registry.example");
    await provider.lookup("example.com", 1000);
    expect(transport).toHaveBeenCalledTimes(2);
    expect(transport.mock.calls[1]?.[0]).toBe("https://registry.example/rdap/domain/example.com");
  });
  it("identifies unsupported TLDs and missing expiry information", async () => {
    const transport = mockRequest();
    const provider = new RdapProvider(transport as typeof executeSingleHop);
    expect((await provider.lookup("example.unsupported", 1000)).state).toBe("unsupported");
    transport.mockResolvedValue({ statusCode: 200, body: "{}" });
    expect((await provider.lookup("example.com", 1000)).state).toBe("unavailable");
  });
  it.each([429, 500, 503])(
    "keeps provider HTTP %i failures out of incident counters",
    async (status) => {
      const transport = mockRequest();
      transport
        .mockReset()
        .mockResolvedValueOnce({
          statusCode: 200,
          body: JSON.stringify({ services: [[["com"], ["https://registry.example/"]]] }),
        })
        .mockResolvedValue({ statusCode: status, body: "" });
      const result = await executeDomainCheck(
        "example.com",
        30,
        1000,
        new RdapProvider(transport as typeof executeSingleHop),
      );
      expect(result).toMatchObject({
        success: false,
        nonQualifying: true,
        failureCategory: "DOMAIN_PROVIDER_UNAVAILABLE",
      });
    },
  );
  it.each([-1, 7, 90])("evaluates %i days to registration expiry", async (days) => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const result = await executeDomainCheck("example.com", 30, 1000, {
      lookup: async () => ({
        state: "known",
        provider: "registry.example",
        expiryDate: new Date(now + days * 86400000).toISOString(),
        lastSuccessfulLookup: new Date(now).toISOString(),
      }),
    });
    expect(result.success).toBe(days > 30);
    expect(result.nonQualifying).toBe(false);
    expect(result.details?.daysRemaining).toBe(days);
  });
  it("reports missing authoritative data as unknown", async () =>
    expect(
      await executeDomainCheck("example.com", 30, 1000, {
        lookup: async () => ({
          state: "unavailable",
          provider: "registry.example",
          lastSuccessfulLookup: new Date().toISOString(),
        }),
      }),
    ).toMatchObject({ nonQualifying: true, failureCategory: "DOMAIN_DATA_UNAVAILABLE" }));
});
