import type { AuditEvent, AuditEventType } from "../types/workspace.types";

export const auditEventTypes: AuditEventType[] = [
  "workspace.created",
  "workspace.settings_updated",
  "workspace.deleted",
  "workspace.ownership_transferred",
  "member.invited",
  "member.invitation_resent",
  "member.invitation_revoked",
  "member.invitation_accepted",
  "member.role_changed",
  "member.removed",
  "member.left",
];

export const auditEventLabels: Record<AuditEventType, string> = {
  "workspace.created": "Workspace created",
  "workspace.settings_updated": "Settings updated",
  "workspace.deleted": "Workspace deleted",
  "workspace.ownership_transferred": "Ownership transferred",
  "member.invited": "Member invited",
  "member.invitation_resent": "Invitation resent",
  "member.invitation_revoked": "Invitation revoked",
  "member.invitation_accepted": "Invitation accepted",
  "member.role_changed": "Role changed",
  "member.removed": "Member removed",
  "member.left": "Member left",
};

const text = (value: string | number | boolean | null | undefined): string | null =>
  value === null || value === undefined || value === "" ? null : String(value);

export const describeAuditEvent = (event: AuditEvent): string => {
  const actor = event.actor?.name ?? "Someone";
  const target = event.target?.name ?? text(event.metadata.email) ?? "a member";
  const role = text(event.metadata.role);
  const email = text(event.metadata.email) ?? target;
  switch (event.type) {
    case "workspace.created":
      return `${actor} created the workspace`;
    case "workspace.settings_updated": {
      const from = text(event.metadata.previousName);
      const to = text(event.metadata.name);
      return from && to
        ? `${actor} renamed the workspace from "${from}" to "${to}"`
        : `${actor} updated the workspace settings`;
    }
    case "workspace.deleted":
      return `${actor} deleted the workspace`;
    case "workspace.ownership_transferred":
      return `${actor} transferred ownership to ${target}`;
    case "member.invited":
      return `${actor} invited ${email}${role ? ` as ${role}` : ""}`;
    case "member.invitation_resent":
      return `${actor} resent the invitation to ${email}`;
    case "member.invitation_revoked":
      return `${actor} revoked the invitation for ${email}`;
    case "member.invitation_accepted":
      return `${target} accepted the invitation${role ? ` and joined as ${role}` : ""}`;
    case "member.role_changed": {
      const from = text(event.metadata.previousRole);
      const change = from && role ? ` from ${from} to ${role}` : role ? ` to ${role}` : "";
      return `${actor} changed ${target}'s role${change}`;
    }
    case "member.removed":
      return `${actor} removed ${target} from the workspace`;
    case "member.left":
      return `${actor} left the workspace`;
  }
};
