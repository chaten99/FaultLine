import { describe, expect, it, vi, afterEach } from "vitest";
import { EventEmitter } from "node:events";
import http from "node:http";
import dns from "node:dns/promises";
import { executeSafeProbe } from "../src/modules/monitors/monitor-executor.service.js";

describe("monitor probe executor and SSRF defenses", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("blocks requests to prohibited hostnames before resolving", async () => {
    await expect(executeSafeProbe("http://localhost:8080/api")).rejects.toMatchObject({
      code: "SSRF_PROHIBITED_DESTINATION",
    });

    await expect(
      executeSafeProbe("http://metadata.google.internal/computeMetadata/v1/"),
    ).rejects.toMatchObject({
      code: "SSRF_PROHIBITED_DESTINATION",
    });
  });

  it("blocks requests when DNS resolves to a private IP", async () => {
    vi.spyOn(dns, "lookup").mockResolvedValue([{ address: "127.0.0.1", family: 4 }] as never);

    await expect(
      executeSafeProbe("http://malicious-public-domain.com/health"),
    ).rejects.toMatchObject({
      code: "SSRF_PROHIBITED_DESTINATION",
    });
  });

  it("blocks requests when DNS resolves to cloud metadata IP", async () => {
    vi.spyOn(dns, "lookup").mockResolvedValue([{ address: "169.254.169.254", family: 4 }] as never);

    await expect(executeSafeProbe("http://spoofed-aws-domain.org/latest")).rejects.toMatchObject({
      code: "SSRF_PROHIBITED_DESTINATION",
    });
  });

  it("rejects unsupported protocols", async () => {
    await expect(executeSafeProbe("ftp://example.com/file.txt")).rejects.toMatchObject({
      code: "UNSUPPORTED_PROTOCOL",
    });
  });

  it("rejects credentials embedded in probe targets", async () => {
    await expect(executeSafeProbe("http://user:pass@example.com/health")).rejects.toMatchObject({
      code: "CREDENTIALS_PROHIBITED",
    });
  });

  it("enforces maxBodyBytes response threshold", async () => {
    vi.spyOn(dns, "lookup").mockResolvedValue([{ address: "93.184.216.34", family: 4 }] as never);

    vi.spyOn(http, "request").mockImplementation((_opts: unknown, callback?: unknown) => {
      const req = new EventEmitter() as EventEmitter & {
        end: () => void;
        destroy: (err?: unknown) => void;
      };
      req.end = vi.fn();
      req.destroy = vi.fn((err?: unknown) => {
        if (err) req.emit("error", err);
      });

      const res = new EventEmitter() as EventEmitter & {
        statusCode: number;
        headers: Record<string, string>;
      };
      res.statusCode = 200;
      res.headers = {};

      process.nextTick(() => {
        if (typeof callback === "function") {
          callback(res);
        }
        res.emit("data", Buffer.alloc(100));
        res.emit("data", Buffer.alloc(100));
      });

      return req as never;
    });

    await expect(
      executeSafeProbe("http://example.com/data", { maxBodyBytes: 150 }),
    ).rejects.toMatchObject({
      code: "RESPONSE_TOO_LARGE",
    });
  });

  it("enforces timeout on slow probes", async () => {
    vi.spyOn(dns, "lookup").mockResolvedValue([{ address: "93.184.216.34", family: 4 }] as never);

    vi.spyOn(http, "request").mockImplementation(() => {
      const req = new EventEmitter() as EventEmitter & {
        end: () => void;
        destroy: (err?: unknown) => void;
      };
      req.end = vi.fn();
      req.destroy = vi.fn((err?: unknown) => {
        if (err) req.emit("error", err);
      });

      process.nextTick(() => {
        req.emit("timeout");
      });

      return req as never;
    });

    await expect(
      executeSafeProbe("http://example.com/slow", { timeoutMs: 500 }),
    ).rejects.toMatchObject({
      code: "PROBE_TIMEOUT",
    });
  });

  it("enforces max redirect threshold", async () => {
    vi.spyOn(dns, "lookup").mockResolvedValue([{ address: "93.184.216.34", family: 4 }] as never);

    vi.spyOn(http, "request").mockImplementation((_opts: unknown, callback?: unknown) => {
      const req = new EventEmitter() as EventEmitter & {
        end: () => void;
        destroy: (err?: unknown) => void;
      };
      req.end = vi.fn();
      req.destroy = vi.fn();

      const res = new EventEmitter() as EventEmitter & {
        statusCode: number;
        headers: Record<string, string>;
      };
      res.statusCode = 302;
      res.headers = { location: "/redirect-loop" };

      process.nextTick(() => {
        if (typeof callback === "function") {
          callback(res);
        }
        res.emit("end");
      });

      return req as never;
    });

    await expect(
      executeSafeProbe("http://example.com/loop", { maxRedirects: 2 }),
    ).rejects.toMatchObject({
      code: "TOO_MANY_REDIRECTS",
    });
  });

  it("blocks redirect that points to a private address or metadata host", async () => {
    vi.spyOn(dns, "lookup").mockImplementation(async (host: string) => {
      if (host === "example.com") {
        return [{ address: "93.184.216.34", family: 4 }] as never;
      }
      return [{ address: "10.0.0.1", family: 4 }] as never;
    });

    vi.spyOn(http, "request").mockImplementation((_opts: unknown, callback?: unknown) => {
      const req = new EventEmitter() as EventEmitter & {
        end: () => void;
        destroy: (err?: unknown) => void;
      };
      req.end = vi.fn();
      req.destroy = vi.fn();

      const res = new EventEmitter() as EventEmitter & {
        statusCode: number;
        headers: Record<string, string>;
      };
      res.statusCode = 301;
      res.headers = { location: "http://10.0.0.1/admin" };

      process.nextTick(() => {
        if (typeof callback === "function") {
          callback(res);
        }
        res.emit("end");
      });

      return req as never;
    });

    await expect(executeSafeProbe("http://example.com/redirect-to-private")).rejects.toMatchObject({
      code: "SSRF_PROHIBITED_DESTINATION",
    });
  });

  it("completes a valid probe successfully", async () => {
    vi.spyOn(dns, "lookup").mockResolvedValue([{ address: "93.184.216.34", family: 4 }] as never);

    vi.spyOn(http, "request").mockImplementation((_opts: unknown, callback?: unknown) => {
      const req = new EventEmitter() as EventEmitter & {
        end: () => void;
        destroy: (err?: unknown) => void;
      };
      req.end = vi.fn();
      req.destroy = vi.fn();

      const res = new EventEmitter() as EventEmitter & {
        statusCode: number;
        headers: Record<string, string>;
      };
      res.statusCode = 200;
      res.headers = { "content-type": "application/json" };

      process.nextTick(() => {
        if (typeof callback === "function") {
          callback(res);
        }
        res.emit("data", Buffer.from('{"status":"ok"}'));
        res.emit("end");
      });

      return req as never;
    });

    const result = await executeSafeProbe("http://example.com/health", {
      expectedStatusCodes: [200],
    });

    expect(result.success).toBe(true);
    expect(result.statusCode).toBe(200);
    expect(result.resolvedIp).toBe("93.184.216.34");
    expect(result.redirectsFollowed).toBe(0);
  });
});
