import { describe, expect, it } from "vitest";
import { auditEventLabels, auditEventTypes, describeAuditEvent } from "./audit";
import type { AuditEvent } from "../types/workspace.types";

const event = (overrides: Partial<AuditEvent>): AuditEvent => ({
  id: "e1",
  type: "workspace.created",
  actor: { id: "u1", name: "Asha" },
  target: null,
  targetId: null,
  metadata: {},
  createdAt: "2026-06-01T12:00:00.000Z",
  ...overrides,
});

describe("audit event sentences", () => {
  it("labels every event type", () => {
    for (const type of auditEventTypes) expect(auditEventLabels[type]).toBeTruthy();
  });

  it("describes workspace events", () => {
    expect(describeAuditEvent(event({}))).toBe("Asha created the workspace");
    expect(
      describeAuditEvent(
        event({
          type: "workspace.settings_updated",
          metadata: { previousName: "Old", name: "New" },
        }),
      ),
    ).toBe('Asha renamed the workspace from "Old" to "New"');
    expect(describeAuditEvent(event({ type: "workspace.settings_updated" }))).toBe(
      "Asha updated the workspace settings",
    );
    expect(describeAuditEvent(event({ type: "workspace.deleted" }))).toBe(
      "Asha deleted the workspace",
    );
    expect(
      describeAuditEvent(
        event({ type: "workspace.ownership_transferred", target: { id: "u2", name: "Ben" } }),
      ),
    ).toBe("Asha transferred ownership to Ben");
  });

  it("describes invitation events", () => {
    expect(
      describeAuditEvent(
        event({ type: "member.invited", metadata: { email: "ben@example.com", role: "viewer" } }),
      ),
    ).toBe("Asha invited ben@example.com as viewer");
    expect(
      describeAuditEvent(
        event({ type: "member.invitation_resent", metadata: { email: "ben@example.com" } }),
      ),
    ).toBe("Asha resent the invitation to ben@example.com");
    expect(
      describeAuditEvent(
        event({ type: "member.invitation_revoked", metadata: { email: "ben@example.com" } }),
      ),
    ).toBe("Asha revoked the invitation for ben@example.com");
    expect(
      describeAuditEvent(
        event({
          type: "member.invitation_accepted",
          actor: null,
          target: { id: "u2", name: "Ben" },
          metadata: { role: "member" },
        }),
      ),
    ).toBe("Ben accepted the invitation and joined as member");
  });

  it("describes membership events", () => {
    const target = { id: "u2", name: "Ben" };
    expect(
      describeAuditEvent(
        event({
          type: "member.role_changed",
          target,
          metadata: { previousRole: "viewer", role: "admin" },
        }),
      ),
    ).toBe("Asha changed Ben's role from viewer to admin");
    expect(
      describeAuditEvent(
        event({ type: "member.role_changed", target, metadata: { role: "admin" } }),
      ),
    ).toBe("Asha changed Ben's role to admin");
    expect(describeAuditEvent(event({ type: "member.removed", target }))).toBe(
      "Asha removed Ben from the workspace",
    );
    expect(describeAuditEvent(event({ type: "member.left" }))).toBe("Asha left the workspace");
  });

  it("falls back gracefully when the actor or target is unknown", () => {
    expect(describeAuditEvent(event({ actor: null, type: "member.removed" }))).toBe(
      "Someone removed a member from the workspace",
    );
  });
});
