import { describe, expect, it } from "vitest";
import {
  createMonitorSchema,
  listMonitorSchema,
  monitorIdSchema,
  updateMonitorSchema,
} from "../src/modules/monitors/monitor.validation.js";

describe("monitor validation schemas", () => {
  const validCreatePayload = {
    name: "Production API",
    url: "https://api.example.com/health",
    method: "GET",
    intervalSeconds: 300,
    timeoutMs: 10000,
    expectedStatusCodes: [200, 201],
    active: true,
  };

  it("accepts valid create monitor payload", () => {
    const result = createMonitorSchema.safeParse(validCreatePayload);
    expect(result.success).toBe(true);
  });

  it("rejects empty or whitespace-only name", () => {
    const result = createMonitorSchema.safeParse({
      ...validCreatePayload,
      name: "   ",
    });
    expect(result.success).toBe(false);
  });

  it("rejects name exceeding 100 characters", () => {
    const result = createMonitorSchema.safeParse({
      ...validCreatePayload,
      name: "a".repeat(101),
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid intervals not in preset list", () => {
    const result = createMonitorSchema.safeParse({
      ...validCreatePayload,
      intervalSeconds: 45,
    });
    expect(result.success).toBe(false);

    const result2 = createMonitorSchema.safeParse({
      ...validCreatePayload,
      intervalSeconds: 120,
    });
    expect(result2.success).toBe(false);
  });

  it("accepts all valid interval presets", () => {
    for (const interval of [60, 300, 600, 900, 1800, 3600]) {
      const result = createMonitorSchema.safeParse({
        ...validCreatePayload,
        intervalSeconds: interval,
      });
      expect(result.success).toBe(true);
    }
  });

  it("rejects timeout below 1,000ms or above 30,000ms", () => {
    expect(
      createMonitorSchema.safeParse({
        ...validCreatePayload,
        timeoutMs: 999,
      }).success,
    ).toBe(false);

    expect(
      createMonitorSchema.safeParse({
        ...validCreatePayload,
        timeoutMs: 30001,
      }).success,
    ).toBe(false);
  });

  it("rejects empty expectedStatusCodes array or invalid status codes", () => {
    expect(
      createMonitorSchema.safeParse({
        ...validCreatePayload,
        expectedStatusCodes: [],
      }).success,
    ).toBe(false);

    expect(
      createMonitorSchema.safeParse({
        ...validCreatePayload,
        expectedStatusCodes: [99],
      }).success,
    ).toBe(false);

    expect(
      createMonitorSchema.safeParse({
        ...validCreatePayload,
        expectedStatusCodes: [600],
      }).success,
    ).toBe(false);
  });

  it("rejects method other than GET", () => {
    expect(
      createMonitorSchema.safeParse({
        ...validCreatePayload,
        method: "POST",
      }).success,
    ).toBe(false);

    expect(
      createMonitorSchema.safeParse({
        ...validCreatePayload,
        method: "HEAD",
      }).success,
    ).toBe(false);
  });

  it("rejects unexpected additional fields due to strict mode", () => {
    const result = createMonitorSchema.safeParse({
      ...validCreatePayload,
      unknownField: "malicious_payload",
      isAdmin: true,
    });
    expect(result.success).toBe(false);
  });

  it("validates update monitor schema", () => {
    expect(
      updateMonitorSchema.safeParse({
        name: "Updated Name",
      }).success,
    ).toBe(true);

    expect(
      updateMonitorSchema.safeParse({
        intervalSeconds: 600,
        timeoutMs: 5000,
      }).success,
    ).toBe(true);

    expect(updateMonitorSchema.safeParse({}).success).toBe(false);

    expect(
      updateMonitorSchema.safeParse({
        intervalSeconds: 999,
      }).success,
    ).toBe(false);
  });

  it("validates monitor ObjectId hex string", () => {
    expect(monitorIdSchema.safeParse({ id: "507f1f77bcf86cd799439011" }).success).toBe(true);
    expect(monitorIdSchema.safeParse({ id: "invalid-id" }).success).toBe(false);
    expect(monitorIdSchema.safeParse({ id: "12345" }).success).toBe(false);
  });

  it("validates list pagination and sorting params", () => {
    const parsed = listMonitorSchema.parse({
      page: "2",
      pageSize: "10",
      sortBy: "name",
      sortOrder: "asc",
    });
    expect(parsed.page).toBe(2);
    expect(parsed.pageSize).toBe(10);
    expect(parsed.sortBy).toBe("name");
    expect(parsed.sortOrder).toBe("asc");

    expect(listMonitorSchema.safeParse({ pageSize: "100" }).success).toBe(false);
    expect(listMonitorSchema.safeParse({ page: "0" }).success).toBe(false);
  });
});
