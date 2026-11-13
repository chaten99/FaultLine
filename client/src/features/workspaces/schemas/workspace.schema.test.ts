import { describe, expect, it } from "vitest";
import {
  changeRoleSchema,
  createWorkspaceSchema,
  deleteWorkspaceSchema,
  inviteMemberSchema,
  transferOwnershipSchema,
  workspaceNameSchema,
} from "./workspace.schema";

describe("workspace name", () => {
  it("trims and validates length and markup", () => {
    expect(workspaceNameSchema.parse("  Acme Team  ")).toBe("Acme Team");
    expect(workspaceNameSchema.safeParse("A").success).toBe(false);
    expect(workspaceNameSchema.safeParse("x".repeat(61)).success).toBe(false);
    expect(workspaceNameSchema.safeParse("<b>bold</b>").success).toBe(false);
    expect(createWorkspaceSchema.safeParse({ name: "" }).success).toBe(false);
  });
});

describe("invite form", () => {
  it("accepts a valid invitation and normalizes whitespace", () => {
    const parsed = inviteMemberSchema.parse({
      email: " ben@example.com ",
      role: "viewer",
      message: " Welcome ",
    });
    expect(parsed).toEqual({ email: "ben@example.com", role: "viewer", message: "Welcome" });
  });

  it("rejects bad emails, the owner role and long messages", () => {
    expect(inviteMemberSchema.safeParse({ email: "nope", role: "member" }).success).toBe(false);
    expect(inviteMemberSchema.safeParse({ email: "", role: "member" }).success).toBe(false);
    expect(inviteMemberSchema.safeParse({ email: "a@example.com", role: "owner" }).success).toBe(
      false,
    );
    expect(
      inviteMemberSchema.safeParse({
        email: "a@example.com",
        role: "member",
        message: "x".repeat(501),
      }).success,
    ).toBe(false);
  });

  it("only allows assignable roles when changing a role", () => {
    expect(changeRoleSchema.safeParse({ role: "admin" }).success).toBe(true);
    expect(changeRoleSchema.safeParse({ role: "owner" }).success).toBe(false);
  });
});

describe("destructive confirmations", () => {
  it("requires a new owner, a password and explicit confirmation to transfer", () => {
    expect(
      transferOwnershipSchema.safeParse({ userId: "u2", password: "pw", confirm: true }).success,
    ).toBe(true);
    expect(
      transferOwnershipSchema.safeParse({ userId: "", password: "pw", confirm: true }).success,
    ).toBe(false);
    expect(
      transferOwnershipSchema.safeParse({ userId: "u2", password: "", confirm: true }).success,
    ).toBe(false);
    expect(
      transferOwnershipSchema.safeParse({ userId: "u2", password: "pw", confirm: false }).success,
    ).toBe(false);
  });

  it("requires the exact workspace name and a password to delete", () => {
    const schema = deleteWorkspaceSchema("Acme Team");
    expect(schema.safeParse({ confirmName: "Acme Team", password: "pw" }).success).toBe(true);
    expect(schema.safeParse({ confirmName: " Acme Team ", password: "pw" }).success).toBe(true);
    expect(schema.safeParse({ confirmName: "acme team", password: "pw" }).success).toBe(false);
    expect(schema.safeParse({ confirmName: "Acme Team", password: "" }).success).toBe(false);
  });
});
