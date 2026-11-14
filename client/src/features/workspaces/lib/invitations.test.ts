import { describe, expect, it } from "vitest";
import {
  buildTokenlessReplacement,
  canResendInvitation,
  canRevokeInvitation,
  describeExpiry,
  effectiveInvitationStatus,
  extractInvitationToken,
  loginRedirectState,
  resolvePostLoginTarget,
} from "./invitations";

const NOW = Date.UTC(2026, 5, 1, 12, 0, 0);
const iso = (ms: number) => new Date(ms).toISOString();

describe("invitation status helpers", () => {
  it("shows pending invitations past their expiry as expired", () => {
    expect(effectiveInvitationStatus({ status: "pending", expiresAt: iso(NOW - 1) }, NOW)).toBe(
      "expired",
    );
    expect(effectiveInvitationStatus({ status: "pending", expiresAt: iso(NOW + 1000) }, NOW)).toBe(
      "pending",
    );
    expect(effectiveInvitationStatus({ status: "revoked", expiresAt: iso(NOW - 1) }, NOW)).toBe(
      "revoked",
    );
    expect(effectiveInvitationStatus({ status: "accepted", expiresAt: iso(NOW - 1) }, NOW)).toBe(
      "accepted",
    );
  });

  it("describes remaining time", () => {
    expect(describeExpiry(iso(NOW - 1), NOW)).toBe("Expired");
    expect(describeExpiry(iso(NOW + 5 * 60_000), NOW)).toBe("Expires in 5 min");
    expect(describeExpiry(iso(NOW + 30 * 1000), NOW)).toBe("Expires in 1 min");
    expect(describeExpiry(iso(NOW + 5 * 3_600_000), NOW)).toBe("Expires in 5 h");
    expect(describeExpiry(iso(NOW + 5 * 86_400_000), NOW)).toBe("Expires in 5 days");
    expect(describeExpiry("garbage", NOW)).toBe("Unknown");
  });

  it("allows resend for pending and expired and revoke only for pending", () => {
    expect(canResendInvitation("pending")).toBe(true);
    expect(canResendInvitation("expired")).toBe(true);
    expect(canResendInvitation("accepted")).toBe(false);
    expect(canResendInvitation("revoked")).toBe(false);
    expect(canRevokeInvitation("pending")).toBe(true);
    expect(canRevokeInvitation("expired")).toBe(false);
  });
});

describe("invitation token handling", () => {
  it("moves the token out of the URL into router state", () => {
    const replacement = buildTokenlessReplacement("secret-token-value");
    expect(replacement.to).toBe("/invitations/accept");
    expect(replacement.to).not.toContain("secret-token-value");
    expect(replacement.state).toEqual({ invitationToken: "secret-token-value" });
  });

  it("reads the token from the URL once and flags it for removal", () => {
    expect(extractInvitationToken("?token=abc123", null)).toEqual({
      token: "abc123",
      shouldStrip: true,
    });
  });

  it("prefers router state and never asks to strip when already tokenless", () => {
    expect(extractInvitationToken("", { invitationToken: "fromState" })).toEqual({
      token: "fromState",
      shouldStrip: false,
    });
    expect(extractInvitationToken("?token=urlToken", { invitationToken: "fromState" }).token).toBe(
      "fromState",
    );
  });

  it("returns no token for missing or malformed input", () => {
    expect(extractInvitationToken("", undefined)).toEqual({ token: null, shouldStrip: false });
    expect(extractInvitationToken("?other=1", { invitationToken: 42 })).toEqual({
      token: null,
      shouldStrip: false,
    });
    expect(extractInvitationToken("?token=", null).token).toBeNull();
  });

  it("builds a login redirect that carries the token only in router state", () => {
    const state = loginRedirectState("tok");
    expect(state).toEqual({ from: "/invitations/accept", invitationToken: "tok" });
    expect(JSON.stringify(state.from)).not.toContain("tok");
  });
});

describe("post-login redirect", () => {
  it("returns to the invitation page with the token in state", () => {
    expect(resolvePostLoginTarget(loginRedirectState("tok"))).toEqual({
      to: "/invitations/accept",
      state: { invitationToken: "tok" },
    });
  });

  it("returns to a protected path the user came from", () => {
    expect(resolvePostLoginTarget({ from: "/monitors" })).toEqual({ to: "/monitors" });
  });

  it("falls back to the dashboard and rejects open redirects", () => {
    expect(resolvePostLoginTarget(undefined)).toEqual({ to: "/dashboard" });
    expect(resolvePostLoginTarget({ from: "https://evil.example" })).toEqual({ to: "/dashboard" });
    expect(resolvePostLoginTarget({ from: "//evil.example" })).toEqual({ to: "/dashboard" });
    expect(resolvePostLoginTarget({ from: 42 })).toEqual({ to: "/dashboard" });
  });

  it("does not forward a token to unrelated destinations", () => {
    expect(resolvePostLoginTarget({ from: "/monitors", invitationToken: "tok" })).toEqual({
      to: "/monitors",
    });
  });
});
