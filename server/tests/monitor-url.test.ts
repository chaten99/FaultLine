import { describe, expect, it } from "vitest";
import {
  isBlockedHostname,
  isPrivateAddress,
  isPrivateIpv4,
  isPrivateIpv6,
  validateMonitorUrl,
} from "../src/modules/monitors/monitor-url.service.js";

describe("monitor URL validation and SSRF defenses", () => {
  it("identifies private IPv4 addresses correctly", () => {
    expect(isPrivateIpv4("10.0.0.1")).toBe(true);
    expect(isPrivateIpv4("10.255.255.255")).toBe(true);
    expect(isPrivateIpv4("172.16.0.1")).toBe(true);
    expect(isPrivateIpv4("172.31.255.255")).toBe(true);
    expect(isPrivateIpv4("172.32.0.1")).toBe(false);
    expect(isPrivateIpv4("192.168.0.1")).toBe(true);
    expect(isPrivateIpv4("127.0.0.1")).toBe(true);
    expect(isPrivateIpv4("169.254.169.254")).toBe(true);
    expect(isPrivateIpv4("100.64.0.1")).toBe(true);
    expect(isPrivateIpv4("100.127.255.255")).toBe(true);
    expect(isPrivateIpv4("100.128.0.1")).toBe(false);
    expect(isPrivateIpv4("0.0.0.0")).toBe(true);
    expect(isPrivateIpv4("224.0.0.1")).toBe(true);
    expect(isPrivateIpv4("8.8.8.8")).toBe(false);
    expect(isPrivateIpv4("1.1.1.1")).toBe(false);
    expect(isPrivateIpv4("invalid-ip")).toBe(false);
  });

  it("identifies private and reserved IPv6 addresses correctly", () => {
    expect(isPrivateIpv6("::1")).toBe(true);
    expect(isPrivateIpv6("::")).toBe(true);
    expect(isPrivateIpv6("fc00::1")).toBe(true);
    expect(isPrivateIpv6("fd12:3456:789a::1")).toBe(true);
    expect(isPrivateIpv6("fe80::1")).toBe(true);
    expect(isPrivateIpv6("::ffff:127.0.0.1")).toBe(true);
    expect(isPrivateIpv6("::ffff:10.0.0.1")).toBe(true);
    expect(isPrivateIpv6("::ffff:169.254.169.254")).toBe(true);
    expect(isPrivateIpv6("::ffff:8.8.8.8")).toBe(false);
    expect(isPrivateIpv6("2606:4700:4700::1111")).toBe(false);
  });

  it("detects private addresses via unified helper", () => {
    expect(isPrivateAddress("127.0.0.1")).toBe(true);
    expect(isPrivateAddress("::1")).toBe(true);
    expect(isPrivateAddress("[::1]")).toBe(true);
    expect(isPrivateAddress("93.184.216.34")).toBe(false);
    expect(isPrivateAddress("2606:2800:220:1:248:1893:25c8:1946")).toBe(false);
  });

  it("identifies dangerous or internal hostnames", () => {
    expect(isBlockedHostname("localhost")).toBe(true);
    expect(isBlockedHostname("localhost.localdomain")).toBe(true);
    expect(isBlockedHostname("api.local")).toBe(true);
    expect(isBlockedHostname("service.internal")).toBe(true);
    expect(isBlockedHostname("pod.cluster.local")).toBe(true);
    expect(isBlockedHostname("metadata.google.internal")).toBe(true);
    expect(isBlockedHostname("metadata.google")).toBe(true);
    expect(isBlockedHostname("instance-data")).toBe(true);
    expect(isBlockedHostname("metadata")).toBe(true);
    expect(isBlockedHostname("example.com")).toBe(false);
  });

  it("accepts public HTTP and HTTPS URLs", async () => {
    await expect(validateMonitorUrl("https://example.com/health")).resolves.toBeUndefined();
    await expect(validateMonitorUrl("http://example.com/status")).resolves.toBeUndefined();
  });

  it("rejects non-HTTP/HTTPS protocols", async () => {
    await expect(validateMonitorUrl("ftp://example.com/health")).rejects.toMatchObject({
      code: "INVALID_MONITOR_URL",
    });
    await expect(validateMonitorUrl("file:///etc/passwd")).rejects.toMatchObject({
      code: "INVALID_MONITOR_URL",
    });
    await expect(validateMonitorUrl("javascript:alert(1)")).rejects.toMatchObject({
      code: "INVALID_MONITOR_URL",
    });
  });

  it("rejects embedded user credentials", async () => {
    await expect(validateMonitorUrl("https://admin:secret@example.com")).rejects.toMatchObject({
      code: "INVALID_MONITOR_URL",
    });
  });

  it("rejects direct private IPs and loopback in URLs", async () => {
    await expect(validateMonitorUrl("http://127.0.0.1:8080/health")).rejects.toMatchObject({
      code: "INVALID_MONITOR_URL",
    });
    await expect(validateMonitorUrl("http://10.0.0.10/ping")).rejects.toMatchObject({
      code: "INVALID_MONITOR_URL",
    });
    await expect(validateMonitorUrl("http://192.168.1.1/api")).rejects.toMatchObject({
      code: "INVALID_MONITOR_URL",
    });
    await expect(
      validateMonitorUrl("http://169.254.169.254/latest/meta-data"),
    ).rejects.toMatchObject({
      code: "INVALID_MONITOR_URL",
    });
    await expect(validateMonitorUrl("http://[::1]:3000/metrics")).rejects.toMatchObject({
      code: "INVALID_MONITOR_URL",
    });
  });

  it("rejects internal cloud and cluster hostnames", async () => {
    await expect(validateMonitorUrl("http://localhost:5000/health")).rejects.toMatchObject({
      code: "INVALID_MONITOR_URL",
    });
    await expect(
      validateMonitorUrl("http://metadata.google.internal/computeMetadata/v1/"),
    ).rejects.toMatchObject({
      code: "INVALID_MONITOR_URL",
    });
    await expect(
      validateMonitorUrl("http://kubernetes.default.svc.cluster.local"),
    ).rejects.toMatchObject({
      code: "INVALID_MONITOR_URL",
    });
  });
});
