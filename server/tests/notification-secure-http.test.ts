import { EventEmitter } from "node:events";
import dns from "node:dns";
import type https from "node:https";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DestinationBlockedError,
  assertPermittedUrl,
  isForbiddenAddress,
  parseRetryAfterMs,
  postJsonSecurely,
  sendJsonSecurely,
  validatedLookup,
  type SecureLookup,
  type SecureTransport,
} from "../src/modules/notifications/secure-http.service.js";

type FakeBehavior = {
  statusCode?: number;
  headers?: Record<string, string>;
  bodyBytes?: number;
  hang?: boolean;
  error?: NodeJS.ErrnoException;
};

const createTransport = (behavior: FakeBehavior) => {
  const captured: { options?: https.RequestOptions; body: string } = { body: "" };
  const transport = ((options: https.RequestOptions, callback: (res: EventEmitter) => void) => {
    captured.options = options;
    const request = new EventEmitter() as EventEmitter & {
      write: (chunk: string) => void;
      end: () => void;
      destroy: () => void;
    };
    request.write = (chunk: string) => {
      captured.body += chunk;
    };
    request.destroy = () => undefined;
    request.end = () => {
      if (behavior.hang) return;
      if (behavior.error) {
        queueMicrotask(() => request.emit("error", behavior.error));
        return;
      }
      const response = new EventEmitter() as EventEmitter & {
        statusCode: number;
        headers: Record<string, string>;
        destroy: () => void;
      };
      response.statusCode = behavior.statusCode ?? 200;
      response.headers = behavior.headers ?? {};
      response.destroy = () => undefined;
      queueMicrotask(() => {
        callback(response);
        if (behavior.bodyBytes) response.emit("data", Buffer.alloc(behavior.bodyBytes));
        response.emit("end");
      });
    };
    return request;
  }) as unknown as SecureTransport;
  return { transport, captured };
};

const publicLookup: SecureLookup = (_host, _options, callback) =>
  callback(null, [{ address: "93.184.216.34", family: 4 }]);

const request = {
  url: "https://hooks.example.com/notify",
  body: '{"ok":true}',
  headers: { "X-Test": "1" },
  timeoutMs: 1000,
};

describe("outbound destination policy", () => {
  it.each([
    "127.0.0.1",
    "10.1.2.3",
    "172.16.0.9",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "224.0.0.1",
    "255.255.255.255",
    "192.0.2.10",
    "198.18.0.1",
    "::1",
    "::",
    "fe80::1",
    "fc00::1",
    "fd12:3456::1",
    "ff02::1",
    "::ffff:127.0.0.1",
    "::ffff:7f00:1",
    "::ffff:a9fe:a9fe",
    "64:ff9b::7f00:1",
    "2001:db8::1",
    "fec0::1",
  ])("treats %s as forbidden", (address) => {
    expect(isForbiddenAddress(address)).toBe(true);
  });

  it.each(["93.184.216.34", "8.8.8.8", "2606:4700:4700::1111", "2a00:1450:4001:81b::200e"])(
    "allows public address %s",
    (address) => {
      expect(isForbiddenAddress(address)).toBe(false);
    },
  );

  it.each([
    "http://hooks.example.com/x",
    "https://user:pass@hooks.example.com/x",
    "https://localhost/x",
    "https://service.internal/x",
    "https://169.254.169.254/latest/meta-data",
    "https://metadata.google.internal/",
    "https://[::1]/x",
    "https://127.0.0.1/x",
    "https://hooks.example.com:8080/x",
    "ftp://hooks.example.com/x",
    "not a url",
  ])("rejects URL %s", (url) => {
    expect(() => assertPermittedUrl(url)).toThrow(DestinationBlockedError);
  });

  it("accepts public https URLs on the permitted ports", () => {
    expect(assertPermittedUrl("https://hooks.example.com/x").hostname).toBe("hooks.example.com");
    expect(assertPermittedUrl("https://hooks.example.com:8443/x").port).toBe("8443");
  });
});

describe("DNS validation at connection time", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const stubDns = (addresses: Array<{ address: string; family: number }>) =>
    vi
      .spyOn(dns, "lookup")
      .mockImplementation(((
        _host: string,
        _options: unknown,
        callback: (error: null, result: typeof addresses) => void,
      ) => callback(null, addresses)) as unknown as typeof dns.lookup);

  it("blocks a hostname that resolves to a private address", async () => {
    stubDns([{ address: "10.0.0.5", family: 4 }]);
    const error = await new Promise<Error | null>((resolve) =>
      validatedLookup("evil.example.com", { all: true }, (err) => resolve(err)),
    );
    expect(error).toBeInstanceOf(DestinationBlockedError);
  });

  it("blocks when any resolved address is private", async () => {
    stubDns([
      { address: "93.184.216.34", family: 4 },
      { address: "169.254.169.254", family: 4 },
    ]);
    const error = await new Promise<Error | null>((resolve) =>
      validatedLookup("mixed.example.com", { all: true }, (err) => resolve(err)),
    );
    expect(error).toBeInstanceOf(DestinationBlockedError);
  });

  it("re-validates on every connection so DNS rebinding cannot bypass the check", async () => {
    const spy = stubDns([{ address: "93.184.216.34", family: 4 }]);
    const first = await new Promise<Error | null>((resolve) =>
      validatedLookup("rebind.example.com", { all: true }, (err) => resolve(err)),
    );
    expect(first).toBeNull();
    spy.mockRestore();
    stubDns([{ address: "127.0.0.1", family: 4 }]);
    const second = await new Promise<Error | null>((resolve) =>
      validatedLookup("rebind.example.com", { all: true }, (err) => resolve(err)),
    );
    expect(second).toBeInstanceOf(DestinationBlockedError);
  });

  it("returns the validated address for single-address lookups", async () => {
    stubDns([{ address: "93.184.216.34", family: 4 }]);
    const result = await new Promise<{ address: unknown; family: unknown }>((resolve) =>
      validatedLookup("ok.example.com", {}, (_err, address, family) =>
        resolve({ address, family }),
      ),
    );
    expect(result).toEqual({ address: "93.184.216.34", family: 4 });
  });

  it("wires the validating lookup into the real connection options", async () => {
    const { transport, captured } = createTransport({ statusCode: 200 });
    await postJsonSecurely(request, { transport });
    expect(captured.options?.lookup).toBe(validatedLookup);
    expect(captured.options?.agent).toBe(false);
    expect(captured.options?.servername).toBe("hooks.example.com");
  });
});

describe("secure JSON delivery", () => {
  it("returns success for a 2xx response and sends the exact body", async () => {
    const { transport, captured } = createTransport({ statusCode: 204 });
    const result = await sendJsonSecurely(request, { transport, lookup: publicLookup });
    expect(result).toMatchObject({ ok: true, responseCode: 204 });
    expect(captured.body).toBe(request.body);
    expect(captured.options?.headers).toMatchObject({
      "X-Test": "1",
      "Content-Type": "application/json; charset=utf-8",
      Host: "hooks.example.com",
    });
  });

  it("does not follow redirects and treats them as permanent failures", async () => {
    const { transport } = createTransport({
      statusCode: 302,
      headers: { location: "https://169.254.169.254/" },
    });
    const result = await sendJsonSecurely(request, { transport, lookup: publicLookup });
    expect(result).toMatchObject({ ok: false, category: "REDIRECT_REJECTED", transient: false });
  });

  it("treats 429 as transient and honours Retry-After", async () => {
    const { transport } = createTransport({ statusCode: 429, headers: { "retry-after": "7" } });
    const result = await sendJsonSecurely(request, { transport, lookup: publicLookup });
    expect(result).toMatchObject({
      ok: false,
      category: "RATE_LIMITED",
      transient: true,
      retryAfterMs: 7000,
    });
  });

  it.each([500, 502, 503, 504])("treats %i as transient provider failure", async (statusCode) => {
    const { transport } = createTransport({ statusCode });
    const result = await sendJsonSecurely(request, { transport, lookup: publicLookup });
    expect(result).toMatchObject({ ok: false, category: "PROVIDER_ERROR", transient: true });
  });

  it.each([
    [400, "INVALID_PAYLOAD"],
    [401, "INVALID_CREDENTIALS"],
    [403, "INVALID_CREDENTIALS"],
    [404, "INVALID_CREDENTIALS"],
    [410, "INVALID_CREDENTIALS"],
    [422, "INVALID_PAYLOAD"],
  ])("treats %i as a permanent %s failure", async (statusCode, category) => {
    const { transport } = createTransport({ statusCode });
    const result = await sendJsonSecurely(request, { transport, lookup: publicLookup });
    expect(result).toMatchObject({ ok: false, category, transient: false });
  });

  it("classifies connection errors as transient network failures", async () => {
    const error = Object.assign(new Error("connect ECONNREFUSED 93.184.216.34:443"), {
      code: "ECONNREFUSED",
    });
    const { transport } = createTransport({ error });
    const result = await sendJsonSecurely(request, { transport, lookup: publicLookup });
    expect(result).toMatchObject({ ok: false, category: "NETWORK_ERROR", transient: true });
  });

  it("times out requests that never respond", async () => {
    const { transport } = createTransport({ hang: true });
    const result = await sendJsonSecurely(
      { ...request, timeoutMs: 25 },
      { transport, lookup: publicLookup },
    );
    expect(result).toMatchObject({ ok: false, category: "TIMEOUT", transient: true });
  });

  it("rejects oversized responses", async () => {
    const { transport } = createTransport({ statusCode: 200, bodyBytes: 100_000 });
    const result = await sendJsonSecurely(request, { transport, lookup: publicLookup });
    expect(result).toMatchObject({ ok: false, category: "RESPONSE_TOO_LARGE", transient: false });
  });

  it("surfaces a blocked destination without opening a connection", async () => {
    const { transport, captured } = createTransport({ statusCode: 200 });
    const result = await sendJsonSecurely(
      { ...request, url: "https://127.0.0.1/hook" },
      { transport },
    );
    expect(result).toMatchObject({ ok: false, category: "DESTINATION_BLOCKED", transient: false });
    expect(captured.options).toBeUndefined();
  });

  it("maps lookup-time blocking to a permanent failure", async () => {
    const error = new DestinationBlockedError();
    const { transport } = createTransport({ error: error as NodeJS.ErrnoException });
    const result = await sendJsonSecurely(request, { transport, lookup: publicLookup });
    expect(result).toMatchObject({ ok: false, category: "DESTINATION_BLOCKED", transient: false });
  });

  it("never leaks the destination URL in failure results", async () => {
    const { transport } = createTransport({ statusCode: 500 });
    const result = await sendJsonSecurely(
      { ...request, url: "https://hooks.example.com/secret-token-123" },
      { transport, lookup: publicLookup },
    );
    expect(JSON.stringify(result)).not.toContain("secret-token-123");
  });
});

describe("Retry-After parsing", () => {
  it("parses delta seconds and HTTP dates", () => {
    expect(parseRetryAfterMs("3")).toBe(3000);
    expect(parseRetryAfterMs(undefined)).toBeNull();
    expect(parseRetryAfterMs("garbage")).toBeNull();
    const now = Date.parse("2026-01-01T00:00:00Z");
    expect(parseRetryAfterMs("Thu, 01 Jan 2026 00:00:10 GMT", now)).toBe(10_000);
  });
});
