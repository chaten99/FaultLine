import { describe, expect, it } from "vitest";
import { validateMonitorUrl } from "../src/modules/monitors/monitor-url.service.js";

describe("monitor URL validation", () => {
  it("accepts public HTTP and HTTPS URLs", async () => {
    await expect(validateMonitorUrl("https://example.com/health")).resolves.toBeUndefined();
    await expect(validateMonitorUrl("http://api.example.com/status")).resolves.toBeUndefined();
  });

  it("rejects credentials and local destinations", async () => {
    await expect(validateMonitorUrl("https://user:pass@example.com")).rejects.toMatchObject({
      code: "INVALID_MONITOR_URL",
    });
    await expect(validateMonitorUrl("http://127.0.0.1:4000")).rejects.toMatchObject({
      code: "INVALID_MONITOR_URL",
    });
    await expect(
      validateMonitorUrl("http://169.254.169.254/latest/meta-data"),
    ).rejects.toMatchObject({
      code: "INVALID_MONITOR_URL",
    });
  });
});
