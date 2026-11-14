import type { Request } from "express";

export const workspaceRoles = ["owner", "admin", "member", "viewer"] as const;
export type WorkspaceRole = (typeof workspaceRoles)[number];

export const assignableRoles = ["admin", "member", "viewer"] as const;
export type AssignableRole = (typeof assignableRoles)[number];

export const workspaceTypes = ["personal", "team"] as const;
export type WorkspaceType = (typeof workspaceTypes)[number];

export type WorkspaceContext = {
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
};

export type WorkspaceRequest = Request & {
  userId?: string;
  workspace?: WorkspaceContext;
};

export const maxWorkspacesPerUser = 20;
