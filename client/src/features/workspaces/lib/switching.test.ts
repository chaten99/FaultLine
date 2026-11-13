import { describe, expect, it } from "vitest";
import { pickActiveWorkspace, planWorkspaceSwitch, shouldSendWorkspaceHeader } from "./switching";
import type { WorkspaceItem } from "../types/workspace.types";

const item = (id: string, type: "personal" | "team" = "team"): WorkspaceItem => ({
  id,
  name: id,
  slug: id,
  type,
  role: "member",
  ownerId: "o",
  ownerName: "Owner",
  memberCount: 1,
  createdAt: "2026-01-01T00:00:00.000Z",
});

describe("active workspace selection", () => {
  const list = [item("team-a"), item("me", "personal"), item("team-b")];

  it("prefers the stored workspace when the user is still a member", () => {
    expect(pickActiveWorkspace(list, "team-b")?.id).toBe("team-b");
  });

  it("falls back to the personal workspace for unknown or missing ids", () => {
    expect(pickActiveWorkspace(list, "revoked")?.id).toBe("me");
    expect(pickActiveWorkspace(list, null)?.id).toBe("me");
  });

  it("uses the first workspace when there is no personal one and handles empty lists", () => {
    expect(pickActiveWorkspace([item("x"), item("y")], undefined)?.id).toBe("x");
    expect(pickActiveWorkspace([], "x")).toBeNull();
  });
});

describe("workspace switch plan", () => {
  const list = [item("a"), item("b")];

  it("isolates data when changing workspace", () => {
    expect(planWorkspaceSwitch("a", "b", list)).toEqual({
      changed: true,
      cancelQueries: true,
      clearCache: true,
      persist: "b",
      emitSelect: true,
      remount: true,
    });
  });

  it("does not wipe the cache when selecting the current workspace", () => {
    expect(planWorkspaceSwitch("a", "a", list)).toMatchObject({
      changed: false,
      cancelQueries: false,
      clearCache: false,
      remount: false,
    });
  });

  it("refuses to switch to a workspace that is not in the user's list", () => {
    expect(planWorkspaceSwitch("a", "stranger", list)).toBeNull();
  });
});

describe("workspace header scope", () => {
  it.each([
    "/monitors",
    "/incidents/123",
    "/notifications/preferences",
    "/analytics/overview",
    "/status-pages",
    "/workspaces/abc",
  ])("sends the header for %s", (url) => {
    expect(shouldSendWorkspaceHeader(url)).toBe(true);
  });

  it.each([
    "/auth/login",
    "/auth/sessions",
    "/profile",
    "/invitations/validate?token=x",
    "auth/refresh",
  ])("omits the header for user-level route %s", (url) => {
    expect(shouldSendWorkspaceHeader(url)).toBe(false);
  });

  it("omits the header without a url", () => {
    expect(shouldSendWorkspaceHeader(undefined)).toBe(false);
  });
});
