import { describe, expect, it } from "vitest";
import {
  avatarTone,
  avatarTones,
  buildStatLinks,
  canSubmitPassword,
  countOtherSessions,
  formatRelativeTime,
  getInitials,
  mapServerFieldErrors,
  normalizeName,
  passwordRequirements,
  sessionLabel,
  sortSessions,
} from "./profile-presentation";
import type { AccountSession } from "../types/profile.types";

const session = (overrides: Partial<AccountSession>): AccountSession => ({
  id: "s",
  current: false,
  device: "Chrome on Windows",
  createdAt: "2026-01-01T00:00:00.000Z",
  lastActiveAt: "2026-01-01T00:00:00.000Z",
  expiresAt: "2026-02-01T00:00:00.000Z",
  ...overrides,
});

describe("name helpers", () => {
  it("normalizes whitespace", () => {
    expect(normalizeName("  Asha   Rao  ")).toBe("Asha Rao");
    expect(normalizeName("")).toBe("");
  });

  it("builds initials from the first and last word", () => {
    expect(getInitials("Asha Rao")).toBe("AR");
    expect(getInitials("asha")).toBe("A");
    expect(getInitials("  mary jane   watson ")).toBe("MW");
    expect(getInitials("")).toBe("U");
    expect(getInitials(null)).toBe("U");
    expect(getInitials(undefined)).toBe("U");
  });

  it("handles non-latin and emoji initials without splitting characters", () => {
    expect(getInitials("😀 Smith")).toBe("😀S");
    expect(getInitials("Émile Zola")).toBe("ÉZ");
  });
});

describe("avatar tone", () => {
  it("is deterministic and case/whitespace insensitive", () => {
    expect(avatarTone("Asha Rao")).toBe(avatarTone("  asha   rao "));
    expect(avatarTone("Asha Rao")).toBe(avatarTone("Asha Rao"));
  });

  it("always returns one of the neutral tones", () => {
    for (const name of ["A", "Bob", "Carla Diaz", "", "李雷"]) {
      expect(avatarTones as readonly string[]).toContain(avatarTone(name));
    }
  });

  it("spreads different names across tones", () => {
    const tones = new Set(
      ["Ada", "Ben", "Cyd", "Dee", "Eli", "Fay", "Gus", "Hal", "Ivy", "Jon"].map(avatarTone),
    );
    expect(tones.size).toBeGreaterThan(1);
  });
});

describe("password requirements", () => {
  const base = { currentPassword: "oldpassword1", newPassword: "", confirmPassword: "" };

  it("starts with nothing met", () => {
    expect(passwordRequirements(base).every((item) => !item.met)).toBe(true);
    expect(canSubmitPassword(base)).toBe(false);
  });

  it("tracks length, difference and confirmation independently", () => {
    const short = passwordRequirements({ ...base, newPassword: "short", confirmPassword: "short" });
    expect(short.map((item) => [item.id, item.met])).toEqual([
      ["length", false],
      ["different", true],
      ["match", true],
    ]);
    const same = passwordRequirements({
      ...base,
      newPassword: "oldpassword1",
      confirmPassword: "oldpassword1",
    });
    expect(same.find((item) => item.id === "different")?.met).toBe(false);
    const mismatch = passwordRequirements({
      ...base,
      newPassword: "longenough1",
      confirmPassword: "longenough2",
    });
    expect(mismatch.find((item) => item.id === "match")?.met).toBe(false);
  });

  it("allows submission only when a current password and every requirement are present", () => {
    const valid = { ...base, newPassword: "a-new-password", confirmPassword: "a-new-password" };
    expect(canSubmitPassword(valid)).toBe(true);
    expect(canSubmitPassword({ ...valid, currentPassword: "" })).toBe(false);
    expect(canSubmitPassword({ ...valid, confirmPassword: "different" })).toBe(false);
  });

  it("rejects passwords longer than 128 characters", () => {
    const long = "x".repeat(129);
    expect(canSubmitPassword({ ...base, newPassword: long, confirmPassword: long })).toBe(false);
  });
});

describe("relative time", () => {
  const now = Date.parse("2026-06-15T12:00:00.000Z");
  const ago = (ms: number) => new Date(now - ms).toISOString();

  it("formats recent and older times", () => {
    expect(formatRelativeTime(ago(10_000), now)).toBe("Just now");
    expect(formatRelativeTime(ago(60_000), now)).toBe("1 minute ago");
    expect(formatRelativeTime(ago(5 * 60_000), now)).toBe("5 minutes ago");
    expect(formatRelativeTime(ago(3_600_000), now)).toBe("1 hour ago");
    expect(formatRelativeTime(ago(5 * 3_600_000), now)).toBe("5 hours ago");
    expect(formatRelativeTime(ago(86_400_000), now)).toBe("1 day ago");
    expect(formatRelativeTime(ago(10 * 86_400_000), now)).toBe("10 days ago");
  });

  it("falls back to a date for old timestamps and handles invalid input", () => {
    expect(formatRelativeTime(ago(90 * 86_400_000), now)).not.toMatch(/ago|Just now/);
    expect(formatRelativeTime("not a date", now)).toBe("Unknown");
  });

  it("never returns a negative duration for future timestamps", () => {
    expect(formatRelativeTime(new Date(now + 60_000).toISOString(), now)).toBe("Just now");
  });
});

describe("sessions", () => {
  it("lists the current session first, then newest activity", () => {
    const sorted = sortSessions([
      session({ id: "old", lastActiveAt: "2026-01-01T00:00:00.000Z" }),
      session({ id: "new", lastActiveAt: "2026-03-01T00:00:00.000Z" }),
      session({ id: "me", current: true, lastActiveAt: "2025-01-01T00:00:00.000Z" }),
    ]);
    expect(sorted.map((item) => item.id)).toEqual(["me", "new", "old"]);
  });

  it("does not mutate the input", () => {
    const input = [session({ id: "a" }), session({ id: "b", current: true })];
    sortSessions(input);
    expect(input.map((item) => item.id)).toEqual(["a", "b"]);
  });

  it("labels devices and counts other sessions", () => {
    expect(sessionLabel(session({ current: true }))).toBe("Chrome on Windows (this device)");
    expect(sessionLabel(session({ device: "  " }))).toBe("Unknown device");
    expect(countOtherSessions([session({ current: true }), session({}), session({})])).toBe(2);
    expect(countOtherSessions([])).toBe(0);
  });
});

describe("server error mapping", () => {
  it("keeps only known fields", () => {
    expect(
      mapServerFieldErrors({ currentPassword: "Incorrect.", other: "x", newPassword: "Same." }, [
        "currentPassword",
        "newPassword",
        "confirmPassword",
      ]),
    ).toEqual([
      { field: "currentPassword", message: "Incorrect." },
      { field: "newPassword", message: "Same." },
    ]);
    expect(mapServerFieldErrors({}, ["name"])).toEqual([]);
  });
});

describe("stat links", () => {
  it("links status pages only when that route exists", () => {
    expect(
      buildStatLinks({ statusPages: false }).find((item) => item.key === "statusPages")?.to,
    ).toBeNull();
    expect(
      buildStatLinks({ statusPages: true }).find((item) => item.key === "statusPages")?.to,
    ).toBe("/status-pages");
    expect(buildStatLinks({ statusPages: false }).map((item) => item.key)).toEqual([
      "monitors",
      "activeMonitors",
      "openIncidents",
      "statusPages",
    ]);
  });
});
