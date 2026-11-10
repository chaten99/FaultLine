import { describe, expect, it } from "vitest";
import { passwordChangeSchema, profileNameSchema } from "./profile.schema";

describe("profile name schema", () => {
  it("trims and collapses whitespace", () => {
    const result = profileNameSchema.safeParse({ name: "  Asha   Rao  " });
    expect(result.success && result.data.name).toBe("Asha Rao");
  });

  it("enforces 2 to 80 characters", () => {
    expect(profileNameSchema.safeParse({ name: "" }).success).toBe(false);
    expect(profileNameSchema.safeParse({ name: "   " }).success).toBe(false);
    expect(profileNameSchema.safeParse({ name: "A" }).success).toBe(false);
    expect(profileNameSchema.safeParse({ name: "Al" }).success).toBe(true);
    expect(profileNameSchema.safeParse({ name: "x".repeat(80) }).success).toBe(true);
    expect(profileNameSchema.safeParse({ name: "x".repeat(81) }).success).toBe(false);
  });

  it("reports readable messages", () => {
    const empty = profileNameSchema.safeParse({ name: "" });
    expect(!empty.success && empty.error.issues[0]?.message).toBe("Please enter your name.");
    const short = profileNameSchema.safeParse({ name: "A" });
    expect(!short.success && short.error.issues[0]?.message).toBe(
      "Name must be at least 2 characters.",
    );
  });
});

describe("password change schema", () => {
  const valid = {
    currentPassword: "old-password",
    newPassword: "new-password-1",
    confirmPassword: "new-password-1",
  };

  it("accepts a valid change", () => {
    expect(passwordChangeSchema.safeParse(valid).success).toBe(true);
  });

  it("requires a current password and a confirmation", () => {
    expect(passwordChangeSchema.safeParse({ ...valid, currentPassword: "" }).success).toBe(false);
    expect(passwordChangeSchema.safeParse({ ...valid, confirmPassword: "" }).success).toBe(false);
  });

  it("enforces length limits", () => {
    const short = passwordChangeSchema.safeParse({
      ...valid,
      newPassword: "short",
      confirmPassword: "short",
    });
    expect(short.success).toBe(false);
    const long = "x".repeat(129);
    expect(
      passwordChangeSchema.safeParse({ ...valid, newPassword: long, confirmPassword: long })
        .success,
    ).toBe(false);
  });

  it("flags a mismatched confirmation on the confirmation field", () => {
    const result = passwordChangeSchema.safeParse({ ...valid, confirmPassword: "other-password" });
    expect(!result.success && result.error.issues.map((issue) => issue.path[0])).toContain(
      "confirmPassword",
    );
  });

  it("flags reusing the current password on the new password field", () => {
    const result = passwordChangeSchema.safeParse({
      currentPassword: "same-password",
      newPassword: "same-password",
      confirmPassword: "same-password",
    });
    expect(!result.success && result.error.issues.map((issue) => issue.path[0])).toContain(
      "newPassword",
    );
  });
});
