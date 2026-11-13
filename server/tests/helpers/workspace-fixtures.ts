import { Types } from "mongoose";
import { WorkspaceMember } from "../../src/modules/workspaces/workspace-member.model.js";
import { Workspace } from "../../src/modules/workspaces/workspace.model.js";
import type { WorkspaceRole } from "../../src/modules/workspaces/workspace.types.js";
import { bindMemoryModel, type MemoryStore } from "./memory-model.js";

export type WorkspaceStores = { workspaces: MemoryStore; members: MemoryStore };

export const bindWorkspaceModels = (): WorkspaceStores => ({
  workspaces: bindMemoryModel(Workspace, { uniqueKeys: ["slug"] }),
  members: bindMemoryModel(WorkspaceMember),
});

export const resetWorkspaceModels = (stores: WorkspaceStores) => {
  stores.workspaces.reset();
  stores.members.reset();
};

export type SeedMember = { userId: Types.ObjectId; role: Exclude<WorkspaceRole, "owner"> };

export const seedWorkspace = (
  stores: WorkspaceStores,
  input: {
    ownerId: Types.ObjectId;
    name?: string;
    type?: "personal" | "team";
    members?: SeedMember[];
    id?: Types.ObjectId;
  },
): Types.ObjectId => {
  const id = input.id ?? new Types.ObjectId();
  const now = new Date();
  stores.workspaces.docs.push({
    _id: id,
    name: input.name ?? "Test Workspace",
    slug: `test-workspace-${String(id).slice(-8)}`,
    type: input.type ?? "team",
    createdBy: input.ownerId,
    ownerId: input.ownerId,
    status: "active",
    createdAt: now,
    updatedAt: now,
  });
  stores.members.docs.push({
    _id: new Types.ObjectId(),
    workspaceId: id,
    userId: input.ownerId,
    role: "owner",
    status: "active",
    joinedAt: now,
    createdAt: now,
    updatedAt: now,
  });
  for (const member of input.members ?? []) {
    stores.members.docs.push({
      _id: new Types.ObjectId(),
      workspaceId: id,
      userId: member.userId,
      role: member.role,
      status: "active",
      joinedAt: now,
      createdAt: now,
      updatedAt: now,
    });
  }
  return id;
};

export const workspaceHeaders = (token: string, workspaceId: Types.ObjectId | string) => ({
  Authorization: `Bearer ${token}`,
  "X-Workspace-Id": String(workspaceId),
});
