import { describe, expect, it } from "vitest";
import {
  formatInterval,
  formatStatusCodes,
  monitorFormSchema,
  parseStatusCodes,
} from "./monitor.schema";

describe("monitor schema and helpers", () => {
  it("validates valid monitor input", () => {
    const valid = {
      name: "API Health",
      url: "https://api.example.com/health",
      method: "GET",
      intervalSeconds: 300,
      timeoutMs: 5000,
      expectedStatusCodes: "200, 201",
      active: true,
    };
    const result = monitorFormSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("rejects invalid URLs", () => {
    const invalid = {
      name: "API Health",
      url: "ftp://example.com",
      method: "GET",
      intervalSeconds: 300,
      timeoutMs: 5000,
      expectedStatusCodes: "200",
      active: true,
    };
    const result = monitorFormSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("rejects timeout out of range", () => {
    const tooLow = {
      name: "API Health",
      url: "https://api.example.com",
      method: "GET",
      intervalSeconds: 300,
      timeoutMs: 500,
      expectedStatusCodes: "200",
      active: true,
    };
    expect(monitorFormSchema.safeParse(tooLow).success).toBe(false);

    const tooHigh = {
      ...tooLow,
      timeoutMs: 35000,
    };
    expect(monitorFormSchema.safeParse(tooHigh).success).toBe(false);
  });

  it("rejects invalid status codes", () => {
    const invalidCodes = {
      name: "API Health",
      url: "https://api.example.com",
      method: "GET",
      intervalSeconds: 300,
      timeoutMs: 5000,
      expectedStatusCodes: "not-a-number, 999",
      active: true,
    };
    expect(monitorFormSchema.safeParse(invalidCodes).success).toBe(false);
  });

  it("parses status codes correctly", () => {
    expect(parseStatusCodes("200, 201, 204")).toEqual([200, 201, 204]);
    expect(parseStatusCodes("  200 ,  500 ")).toEqual([200, 500]);
    expect(parseStatusCodes("invalid, 200, 999")).toEqual([200]);
    expect(parseStatusCodes("200, 200, 201")).toEqual([200, 201]);
  });

  it("formats status codes correctly", () => {
    expect(formatStatusCodes([200, 201])).toBe("200, 201");
  });

  it("formats intervals correctly", () => {
    expect(formatInterval(60)).toBe("1m");
    expect(formatInterval(300)).toBe("5m");
    expect(formatInterval(3600)).toBe("1h");
  });
});
