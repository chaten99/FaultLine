export type WorkspaceRole = "owner" | "admin" | "member" | "viewer";
export type AssignableRole = "admin" | "member" | "viewer";
export type WorkspaceType = "personal" | "team";

export type WorkspaceItem = {
  id: string;
  name: string;
  slug: string;
  type: WorkspaceType;
  role: WorkspaceRole;
  ownerId: string;
  ownerName: string;
  memberCount: number;
  createdAt: string;
};

export type WorkspaceDetail = {
  id: string;
  name: string;
  slug: string;
  type: WorkspaceType;
  role: WorkspaceRole;
  owner: { id: string; name: string; email: string };
  createdAt: string;
  updatedAt: string;
  memberCount: number;
  pendingInvitationCount: number;
};

export type WorkspaceDetailResponse = { workspace: WorkspaceDetail; permissions: string[] };

export type WorkspaceMember = {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: WorkspaceRole;
  status: "active";
  joinedAt: string;
  isOwner: boolean;
  isSelf: boolean;
};

export type InvitationStatus = "pending" | "expired" | "accepted" | "revoked";

export type Invitation = {
  id: string;
  email: string;
  role: AssignableRole;
  status: InvitationStatus;
  invitedBy: { id: string; name: string };
  message: string | null;
  createdAt: string;
  lastSentAt: string;
  expiresAt: string;
};

export type InvitationPreview = {
  workspaceName: string;
  inviterName: string;
  role: AssignableRole;
  emailMasked: string;
  expiresAt: string;
};

export type AcceptInvitationResult = {
  workspaceId: string;
  role: WorkspaceRole;
  alreadyMember: boolean;
};

export type AuditEventType =
  | "workspace.created"
  | "workspace.settings_updated"
  | "workspace.deleted"
  | "workspace.ownership_transferred"
  | "member.invited"
  | "member.invitation_resent"
  | "member.invitation_revoked"
  | "member.invitation_accepted"
  | "member.role_changed"
  | "member.removed"
  | "member.left";

export type AuditEvent = {
  id: string;
  type: AuditEventType;
  actor: { id: string; name: string } | null;
  target: { id: string; name: string } | null;
  targetId: string | null;
  metadata: Record<string, string | number | boolean | null>;
  createdAt: string;
};

export type AuditLogResponse = {
  items: AuditEvent[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};
