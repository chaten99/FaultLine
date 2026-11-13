import { Schema, model, type Types } from "mongoose";
import { assignableRoles, type AssignableRole } from "./workspace.types.js";

export type InvitationStatus = "pending" | "accepted" | "revoked";

export interface IWorkspaceInvitation {
  _id: Types.ObjectId;
  workspaceId: Types.ObjectId;
  email: string;
  role: AssignableRole;
  invitedBy: Types.ObjectId;
  message?: string;
  tokenHash: string;
  status: InvitationStatus;
  expiresAt: Date;
  lastSentAt: Date;
  sendCount: number;
  acceptedAt?: Date;
  acceptedBy?: Types.ObjectId;
  revokedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const invitationSchema = new Schema<IWorkspaceInvitation>(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    email: { type: String, required: true, lowercase: true, trim: true, maxlength: 254 },
    role: { type: String, enum: assignableRoles, required: true },
    invitedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    message: { type: String, trim: true, maxlength: 500 },
    tokenHash: { type: String, required: true, select: false },
    status: {
      type: String,
      enum: ["pending", "accepted", "revoked"],
      required: true,
      default: "pending",
    },
    expiresAt: { type: Date, required: true },
    lastSentAt: { type: Date, required: true },
    sendCount: { type: Number, required: true, default: 1 },
    acceptedAt: { type: Date },
    acceptedBy: { type: Schema.Types.ObjectId, ref: "User" },
    revokedAt: { type: Date },
  },
  { timestamps: true },
);

invitationSchema.index(
  { workspaceId: 1, email: 1 },
  { unique: true, partialFilterExpression: { status: "pending" } },
);
invitationSchema.index({ tokenHash: 1 });
invitationSchema.index({ workspaceId: 1, status: 1, createdAt: -1 });

export const WorkspaceInvitation = model<IWorkspaceInvitation>(
  "WorkspaceInvitation",
  invitationSchema,
);
