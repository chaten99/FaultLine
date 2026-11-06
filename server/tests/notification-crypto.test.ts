import { afterEach, describe, expect, it, vi } from "vitest";
import {
  decryptSecret,
  encryptSecret,
  generateSigningSecret,
} from "../src/modules/notifications/notification-crypto.service.js";

describe("notification credential encryption", () => {
  const secret = "https://hooks.slack.com/services/T000/B000/abcdefghijkl";

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("round-trips a secret and never stores plaintext", () => {
    const encrypted = encryptSecret(secret, "user:integration:url");
    expect(encrypted.startsWith("v1.")).toBe(true);
    expect(encrypted).not.toContain("hooks.slack.com");
    expect(encrypted).not.toContain("abcdefghijkl");
    expect(decryptSecret(encrypted, "user:integration:url")).toBe(secret);
  });

  it("uses a fresh nonce for every encryption", () => {
    const first = encryptSecret(secret, "ctx");
    const second = encryptSecret(secret, "ctx");
    expect(first).not.toBe(second);
  });

  it("rejects ciphertext that was tampered with", () => {
    const [version, iv, tag, ciphertext] = encryptSecret(secret, "ctx").split(".");
    const flipped = Buffer.from(ciphertext as string, "base64url");
    flipped[0] = (flipped[0] ?? 0) ^ 0xff;
    const tampered = [version, iv, tag, flipped.toString("base64url")].join(".");
    expect(() => decryptSecret(tampered, "ctx")).toThrow();
  });

  it("rejects ciphertext moved to another integration context", () => {
    const encrypted = encryptSecret(secret, "user-a:integration-1:url");
    expect(() => decryptSecret(encrypted, "user-b:integration-2:url")).toThrow();
  });

  it("rejects malformed payloads", () => {
    expect(() => decryptSecret("not-a-payload", "ctx")).toThrow();
    expect(() => decryptSecret("v2.a.b.c", "ctx")).toThrow();
  });

  it("generates unpredictable prefixed signing secrets", () => {
    const first = generateSigningSecret();
    const second = generateSigningSecret();
    expect(first).toMatch(/^whsec_[A-Za-z0-9_-]{43}$/);
    expect(first).not.toBe(second);
  });

  it("refuses to encrypt when no key is configured", async () => {
    vi.stubEnv("NOTIFICATION_ENCRYPTION_KEY", "");
    vi.resetModules();
    const fresh = await import("../src/modules/notifications/notification-crypto.service.js");
    expect(fresh.isEncryptionConfigured()).toBe(false);
    expect(() => fresh.encryptSecret(secret, "ctx")).toThrow(/not configured/);
  });

  it("rejects an encryption key of the wrong length at startup", async () => {
    vi.stubEnv("NOTIFICATION_ENCRYPTION_KEY", "abcd");
    vi.resetModules();
    await expect(import("../src/config/env.js")).rejects.toThrow(/NOTIFICATION_ENCRYPTION_KEY/);
  });
});
