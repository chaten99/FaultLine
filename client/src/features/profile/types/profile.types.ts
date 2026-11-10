export type ProfileUser = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  createdAt: string;
};

export type ProfileStats = {
  monitors: number;
  activeMonitors: number;
  openIncidents: number;
  statusPages: number;
};

export type ProfileResponse = { user: ProfileUser; stats: ProfileStats };

export type PasswordChangePayload = {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

export type PasswordChangeResponse = { status: "ok"; revokedSessions: number };

export type AccountSession = {
  id: string;
  current: boolean;
  device: string;
  createdAt: string;
  lastActiveAt: string;
  expiresAt: string;
};

export type SessionsResponse = { items: AccountSession[] };
export type RevokeSessionResponse = { status: "ok"; current: boolean };
export type RevokeOthersResponse = { status: "ok"; revoked: number };
