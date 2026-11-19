import { afterEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import http from "node:http";
import dns from "node:dns/promises";
import { Readable } from "node:stream";
import zlib from "node:zlib";
import { httpConfigSchema, assertionSchema } from "../src/modules/monitors/advanced.validation.js";
import {
  protectHttpConfig,
  decodeMonitorSecrets,
  buildRequest,
} from "../src/modules/monitors/monitor-credentials.service.js";
import { evaluateAssertions } from "../src/modules/monitors/response-assertions.js";
import {
  executeMonitorHttpCheck,
  executeSafeProbe,
} from "../src/modules/monitors/monitor-executor.service.js";
import {
  isPrivateAddress,
  isBlockedHostname,
} from "../src/modules/monitors/monitor-url.service.js";
import { Monitor } from "../src/modules/monitors/monitor.model.js";
afterEach(() => vi.restoreAllMocks());
const config = (value: Record<string, unknown> = {}) => httpConfigSchema.parse(value);
describe("advanced request security", () => {
  it.each([
    "Host",
    "Content-Length",
    "Connection",
    "Transfer-Encoding",
    "TE",
    "Trailer",
    "Upgrade",
    "Proxy-Authorization",
    "Accept-Encoding",
    "bad header",
    "X-Test\r\nInjected",
  ])("rejects unsafe header %s", (name) =>
    expect(() => config({ headers: [{ name, value: "x" }] })).toThrow(),
  );
  it("rejects CRLF, duplicate normalized names, excess counts, header sizes and bad JSON", () => {
    for (const headers of [
      [{ name: "x", value: "x\r\ny" }],
      [
        { name: "x", value: "1" },
        { name: "X", value: "2" },
      ],
      Array.from({ length: 21 }, (_, i) => ({ name: "x-" + i, value: "1" })),
      Array.from({ length: 3 }, (_, i) => ({ name: "x-" + i, value: "x".repeat(4096) })),
    ])
      expect(() => config({ headers })).toThrow();
    expect(() => config({ body: "{bad}" })).toThrow();
    expect(() => config({ body: "x".repeat(8193), contentType: "text/plain" })).toThrow();
  });
  it("encrypts credentials, body and secret headers, masks saved values and verifies context", () => {
    const input = config({
      authType: "bearer",
      token: "sensitive-token",
      body: '{"key":"private"}',
      headers: [{ name: "X-API-Key", value: "secret-key", secret: true }],
    });
    const first = protectHttpConfig(input, {}, "monitor:workspace:id"),
      second = protectHttpConfig(input, {}, "monitor:workspace:id");
    expect(first.encryptedSecrets).not.toBe(second.encryptedSecrets);
    expect(JSON.stringify(first)).not.toContain("sensitive-token");
    expect(JSON.stringify(first)).not.toContain("secret-key");
    expect(JSON.stringify(first)).not.toContain("private");
    const secrets = decodeMonitorSecrets(first.encryptedSecrets, "monitor:workspace:id");
    expect(buildRequest(input, secrets).headers.authorization).toBe("Bearer sensitive-token");
    expect(secrets.body).toBe(input.body);
    expect(() => decodeMonitorSecrets(first.encryptedSecrets, "monitor:other:id")).toThrow();
    const tampered = first.encryptedSecrets!.split(".");
    tampered[2] = Buffer.alloc(16).toString("base64url");
    expect(() => decodeMonitorSecrets(tampered.join("."), "monitor:workspace:id")).toThrow();
    const model = new Monitor({
      encryptedSecrets: first.encryptedSecrets,
      httpConfig: first.httpConfig,
    });
    expect(JSON.stringify(model)).not.toContain(first.encryptedSecrets!);
  });
  it("supports preserving, replacing and removing saved credentials and headers", () => {
    const original = protectHttpConfig(
      config({
        authType: "basic",
        username: "user",
        password: "pass",
        headers: [{ name: "x-key", secret: true, value: "old" }],
      }),
      {},
      "ctx",
    );
    const old = decodeMonitorSecrets(original.encryptedSecrets, "ctx");
    const preserved = protectHttpConfig(config(original.httpConfig), old, "ctx");
    expect(decodeMonitorSecrets(preserved.encryptedSecrets, "ctx")).toEqual(old);
    const replaced = protectHttpConfig(
      config({
        ...original.httpConfig,
        password: "replacement",
        headers: [{ name: "x-key", secret: true, value: "new" }],
      }),
      old,
      "ctx",
    );
    const next = decodeMonitorSecrets(replaced.encryptedSecrets, "ctx");
    expect(next.password).toBe("replacement");
    expect(next.headers?.["x-key"]).toBe("new");
    expect(buildRequest(config({ authType: "basic" }), next).headers.authorization).toBe(
      "Basic " + Buffer.from("user:replacement").toString("base64"),
    );
    const removed = protectHttpConfig(config(), old, "ctx");
    expect(removed.encryptedSecrets).toBeNull();
  });
  it.each([
    "::ffff:7f00:1",
    "::ffff:a00:1",
    "0:0:0:0:0:ffff:c0a8:1",
    "ff02::1",
    "::",
    "::1",
    "10.0.0.1",
    "169.254.169.254",
    "224.0.0.1",
  ])("blocks unsafe address %s", (address) => expect(isPrivateAddress(address)).toBe(true));
  it("blocks trailing-dot local hosts", () => expect(isBlockedHostname("localhost.")).toBe(true));
  it("rejects prototype paths and invalid assertion operators", () => {
    for (const path of ["__proto__.secret", "data.constructor.x", "data[0]", "eval(x)"])
      expect(() => assertionSchema.parse({ path, operator: "exists" })).toThrow();
    expect(() =>
      assertionSchema.parse({ path: "count", operator: "greater_than", value: "0" }),
    ).toThrow();
  });
});
describe("response assertions", () => {
  it("handles all constrained operators and array indexes without evaluating code", () => {
    const rules = [
      { path: "status", operator: "equals", value: "ok" },
      { path: "data.available", operator: "equals", value: true },
      { path: "count", operator: "greater_than", value: 0 },
      { path: "count", operator: "less_than", value: 3 },
      { path: "message", operator: "contains", value: "ready" },
      { path: "data.version", operator: "exists" },
      { path: "status", operator: "not_equals", value: "down" },
      { path: "items.0", operator: "equals", value: 1 },
    ].map((v) => assertionSchema.parse(v));
    expect(
      evaluateAssertions(
        JSON.stringify({
          status: "ok",
          data: { available: true, version: "1" },
          count: 2,
          message: "ready now",
          items: [1],
        }),
        { assertions: rules },
      ).every((r) => r.passed),
    ).toBe(true);
  });
  it("distinguishes missing paths, invalid JSON and mismatches without persisting values", () => {
    for (const body of ["{}", "not-json", '{"status":"secret"}']) {
      const result = evaluateAssertions(body, {
        assertions: [{ path: "status", operator: "equals", value: "ok" }],
      });
      expect(result[0]?.passed).toBe(false);
      expect(JSON.stringify(result)).not.toContain("secret");
    }
  });
  it("honors keyword case sensitivity", () => {
    expect(
      evaluateAssertions("READY", config({ keyword: { text: "ready", caseSensitive: false } }))[0]
        ?.passed,
    ).toBe(true);
    expect(
      evaluateAssertions("READY", config({ keyword: { text: "ready", caseSensitive: true } }))[0]
        ?.passed,
    ).toBe(false);
  });
});
const mockHttp = (body: Buffer | string, status = 200, encoding?: string) => {
  vi.spyOn(dns, "lookup").mockResolvedValue([{ address: "93.184.216.34", family: 4 }] as never);
  return vi.spyOn(http, "request").mockImplementation((options: unknown, callback: unknown) => {
    const req = new EventEmitter() as EventEmitter & {
      end: (body?: string) => void;
      destroy: (error?: unknown) => void;
    };
    req.destroy = (error) => {
      if (error) req.emit("error", error);
      req.emit("close");
    };
    req.end = vi.fn(() => {
      process.nextTick(() => {
        const res = Readable.from([Buffer.isBuffer(body) ? body : Buffer.from(body)]);
        Object.assign(res, {
          statusCode: status,
          headers: encoding ? { "content-encoding": encoding } : {},
        });
        (callback as (r: unknown) => void)(res);
      });
    });
    void options;
    return req as never;
  });
};
describe("secure HTTP executor", () => {
  it.each(["GET", "POST", "PUT", "PATCH", "DELETE"])(
    "executes %s with pinned destination and real assertion evaluation",
    async (method) => {
      const transport = mockHttp('{"status":"ok"}');
      const result = await executeMonitorHttpCheck({
        url: "http://example.com/health",
        timeoutMs: 1000,
        expectedStatusCodes: [200],
        method,
        httpConfig: config({
          authType: "bearer",
          assertions: [{ path: "status", operator: "equals", value: "ok" }],
        }),
        secrets: { token: "private" },
      });
      expect(result.success).toBe(true);
      expect(transport.mock.calls[0]?.[0]).toMatchObject({
        host: "93.184.216.34",
        method,
        headers: { authorization: "Bearer private", Host: "example.com" },
      });
      expect(JSON.stringify(result)).not.toContain("private");
    },
  );
  it("classifies accepted HTTP status with failed application assertions", async () => {
    mockHttp('{"status":"bad"}');
    expect(
      await executeMonitorHttpCheck({
        url: "http://example.com",
        timeoutMs: 1000,
        expectedStatusCodes: [200],
        httpConfig: config({ assertions: [{ path: "status", operator: "equals", value: "ok" }] }),
      }),
    ).toMatchObject({
      success: false,
      statusCode: 200,
      failureCategory: "RESPONSE_ASSERTION_FAILED",
    });
  });
  it("rejects unexpected status", async () => {
    mockHttp("", 503);
    expect(
      await executeMonitorHttpCheck({
        url: "http://example.com",
        timeoutMs: 1000,
        expectedStatusCodes: [200],
      }),
    ).toMatchObject({ failureCategory: "UNEXPECTED_STATUS" });
  });
  it("bounds decompressed streamed responses", async () => {
    mockHttp(zlib.gzipSync("x".repeat(70000)), 200, "gzip");
    expect(
      await executeMonitorHttpCheck({
        url: "http://example.com",
        timeoutMs: 1000,
        expectedStatusCodes: [200],
      }),
    ).toMatchObject({ failureCategory: "RESPONSE_TOO_LARGE" });
  });
  it("does not return unfiltered transport exceptions or credentials", async () => {
    vi.spyOn(dns, "lookup").mockRejectedValue(new Error("private-password 10.0.0.1"));
    const result = await executeMonitorHttpCheck({
      url: "http://example.com",
      timeoutMs: 1000,
      expectedStatusCodes: [200],
    });
    expect(JSON.stringify(result)).not.toContain("private-password");
    expect(JSON.stringify(result)).not.toContain("10.0.0.1");
  });
  it("rejects mixed public/private DNS answers before opening a socket", async () => {
    vi.spyOn(dns, "lookup").mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
      { address: "::ffff:7f00:1", family: 6 },
    ] as never);
    const transport = vi.spyOn(http, "request");
    await expect(executeSafeProbe("http://example.com")).rejects.toMatchObject({
      code: "SSRF_PROHIBITED_DESTINATION",
    });
    expect(transport).not.toHaveBeenCalled();
  });
});
