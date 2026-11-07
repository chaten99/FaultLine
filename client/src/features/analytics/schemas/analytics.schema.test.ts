import { describe, expect, it } from "vitest";
import { customRangeSchema, exportFormSchema, monitorFiltersSchema } from "./analytics.schema";

describe("analytics schemas", () => {
  it("validates export form values", () => {
    expect(exportFormSchema.safeParse({ type: "overview", monitorId: "all" }).success).toBe(true);
    expect(
      exportFormSchema.safeParse({ type: "incidents", monitorId: "507f1f77bcf86cd799439011" })
        .success,
    ).toBe(true);
    expect(exportFormSchema.safeParse({ type: "pdf", monitorId: "all" }).success).toBe(false);
    expect(exportFormSchema.safeParse({ type: "overview", monitorId: "nope" }).success).toBe(false);
  });

  it("validates custom ranges", () => {
    const now = Date.now();
    const day = 86_400_000;
    expect(
      customRangeSchema.safeParse({ from: new Date(now - 3 * day), to: new Date(now - day) })
        .success,
    ).toBe(true);
    expect(
      customRangeSchema.safeParse({ from: new Date(now - day), to: new Date(now - 3 * day) })
        .success,
    ).toBe(false);
    expect(
      customRangeSchema.safeParse({ from: new Date(now - day), to: new Date(now + 5 * day) })
        .success,
    ).toBe(false);
    expect(
      customRangeSchema.safeParse({ from: new Date(now - 100 * day), to: new Date(now - day) })
        .success,
    ).toBe(false);
  });

  it("validates table filters", () => {
    expect(
      monitorFiltersSchema.safeParse({ status: "paused", quality: "partial", search: "  api " }),
    ).toMatchObject({ success: true, data: { search: "api" } });
    expect(
      monitorFiltersSchema.safeParse({ status: "all", quality: "weird", search: "" }).success,
    ).toBe(false);
    expect(
      monitorFiltersSchema.safeParse({ status: "all", quality: "all", search: "x".repeat(101) })
        .success,
    ).toBe(false);
  });
});
