import { describe, expect, it } from "vitest";
import {
  hasSelectedEvent,
  isSafeLogoUrl,
  serviceFormSchema,
  statusPageFormSchema,
  subscribeFormSchema,
} from "./status-page.schema";

const validPage = {
  name: "Acme Service Status",
  slug: "acme-status",
  description: "",
  companyName: "",
  logoUrl: "",
};

describe("status page form schema", () => {
  it("accepts valid input and optional branding", () => {
    expect(statusPageFormSchema.safeParse(validPage).success).toBe(true);
    expect(
      statusPageFormSchema.safeParse({ ...validPage, logoUrl: "https://example.com/logo.png" })
        .success,
    ).toBe(true);
  });

  it("rejects bad names and slugs", () => {
    expect(statusPageFormSchema.safeParse({ ...validPage, name: " " }).success).toBe(false);
    expect(statusPageFormSchema.safeParse({ ...validPage, name: "a".repeat(81) }).success).toBe(
      false,
    );
    for (const slug of ["", "Ab", "-bad", "bad-", "no spaces", "UPPER"]) {
      expect(statusPageFormSchema.safeParse({ ...validPage, slug }).success).toBe(false);
    }
  });

  it("only allows safe https logo URLs", () => {
    expect(isSafeLogoUrl("https://cdn.example.com/a.png")).toBe(true);
    for (const url of [
      "http://example.com/a.png",
      "javascript:alert(1)",
      "data:image/svg+xml;base64,PHN2Zz4=",
      "https://user:pw@example.com/a.png",
      "not a url",
    ]) {
      expect(isSafeLogoUrl(url)).toBe(false);
      expect(statusPageFormSchema.safeParse({ ...validPage, logoUrl: url }).success).toBe(false);
    }
  });

  it("limits description length", () => {
    expect(
      statusPageFormSchema.safeParse({ ...validPage, description: "x".repeat(301) }).success,
    ).toBe(false);
  });
});

describe("service form schema", () => {
  it("requires a name and at least one monitor", () => {
    expect(
      serviceFormSchema.safeParse({ name: "API", description: "", monitorIds: ["m1"] }).success,
    ).toBe(true);
    expect(
      serviceFormSchema.safeParse({ name: "", description: "", monitorIds: ["m1"] }).success,
    ).toBe(false);
    expect(
      serviceFormSchema.safeParse({ name: "API", description: "", monitorIds: [] }).success,
    ).toBe(false);
  });
});

describe("subscribe form schema", () => {
  const base = { email: "visitor@example.com", opened: true, acknowledged: false, resolved: true };

  it("validates email addresses", () => {
    expect(subscribeFormSchema.safeParse(base).success).toBe(true);
    for (const email of ["", "nope", "a@", "@b.com", "a b@example.com"]) {
      expect(subscribeFormSchema.safeParse({ ...base, email }).success).toBe(false);
    }
  });

  it("detects when no update type is selected", () => {
    expect(hasSelectedEvent(base)).toBe(true);
    expect(hasSelectedEvent({ opened: false, acknowledged: false, resolved: false })).toBe(false);
  });
});
