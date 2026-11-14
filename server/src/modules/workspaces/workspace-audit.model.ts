import { Schema, model, type Types } from "mongoose";

export const auditEventTypes = [
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
] as const;

export type AuditEventType = (typeof auditEventTypes)[number];

export interface IWorkspaceAuditEvent {
  _id: Types.ObjectId;
  workspaceId: Types.ObjectId;
  actorId: Types.ObjectId;
  type: AuditEventType;
  targetUserId?: Types.ObjectId;
  targetId?: string;
  metadata: Record<string, string | number | boolean | null>;
  createdAt: Date;
}

const auditSchema = new Schema<IWorkspaceAuditEvent>(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    actorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, enum: auditEventTypes, required: true },
    targetUserId: { type: Schema.Types.ObjectId, ref: "User" },
    targetId: { type: String, maxlength: 64 },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);

auditSchema.index({ workspaceId: 1, createdAt: -1 });
auditSchema.index({ workspaceId: 1, type: 1, createdAt: -1 });

const blocked = () => {
  throw new Error("Audit events are immutable");
};

auditSchema.pre("updateOne", blocked);
auditSchema.pre("updateMany", blocked);
auditSchema.pre("findOneAndUpdate", blocked);
auditSchema.pre("deleteOne", blocked);
auditSchema.pre("deleteMany", blocked);
auditSchema.pre("findOneAndDelete", blocked);

export const WorkspaceAuditEvent = model<IWorkspaceAuditEvent>("WorkspaceAuditEvent", auditSchema);
