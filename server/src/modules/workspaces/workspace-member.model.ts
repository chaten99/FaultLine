import { Schema, model, type Types } from "mongoose";
import { workspaceRoles, type WorkspaceRole } from "./workspace.types.js";

export interface IWorkspaceMember {
  _id: Types.ObjectId;
  workspaceId: Types.ObjectId;
  userId: Types.ObjectId;
  role: WorkspaceRole;
  status: "active" | "removed";
  invitedBy?: Types.ObjectId;
  joinedAt: Date;
  removedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const memberSchema = new Schema<IWorkspaceMember>(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    role: { type: String, enum: workspaceRoles, required: true },
    status: { type: String, enum: ["active", "removed"], required: true, default: "active" },
    invitedBy: { type: Schema.Types.ObjectId, ref: "User" },
    joinedAt: { type: Date, required: true, default: Date.now },
    removedAt: { type: Date },
  },
  { timestamps: true },
);

memberSchema.index({ workspaceId: 1, userId: 1 }, { unique: true });
memberSchema.index({ userId: 1, status: 1 });
memberSchema.index({ workspaceId: 1, status: 1, role: 1 });

export const WorkspaceMember = model<IWorkspaceMember>("WorkspaceMember", memberSchema);
