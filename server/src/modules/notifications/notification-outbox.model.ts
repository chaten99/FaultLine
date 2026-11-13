import { Schema, model, type Types } from "mongoose";
import { incidentEventTypes } from "./notification.types.js";
import type { IncidentEventType, IncidentNotificationSnapshot } from "./notification.types.js";

export type OutboxStatus = "pending" | "processing" | "processed";

export interface INotificationOutbox {
  _id: Types.ObjectId;
  eventId: string;
  type: IncidentEventType;
  workspaceId: Types.ObjectId;
  userId: Types.ObjectId;
  incidentId: Types.ObjectId;
  snapshot: IncidentNotificationSnapshot;
  status: OutboxStatus;
  attempts: number;
  eventAt: Date;
  nextAttemptAt: Date;
  lockedUntil?: Date;
  processedAt?: Date;
  lastError?: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const outboxSchema = new Schema<INotificationOutbox>(
  {
    eventId: { type: String, required: true, unique: true },
    type: { type: String, enum: incidentEventTypes, required: true },
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    incidentId: { type: Schema.Types.ObjectId, ref: "Incident", required: true, index: true },
    snapshot: { type: Schema.Types.Mixed, required: true },
    status: {
      type: String,
      enum: ["pending", "processing", "processed"],
      required: true,
      default: "pending",
    },
    attempts: { type: Number, required: true, default: 0 },
    eventAt: { type: Date, required: true },
    nextAttemptAt: { type: Date, required: true },
    lockedUntil: { type: Date },
    processedAt: { type: Date },
    lastError: { type: String, maxlength: 200 },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

outboxSchema.index({ status: 1, nextAttemptAt: 1 });
outboxSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const NotificationOutbox = model<INotificationOutbox>("NotificationOutbox", outboxSchema);
