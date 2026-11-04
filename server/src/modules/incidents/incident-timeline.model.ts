import { Schema, model, type Document, type Types } from "mongoose";

export type IncidentTimelineEventType =
  | "incident.created"
  | "incident.acknowledged"
  | "incident.failure_observed"
  | "incident.recovery_progress"
  | "incident.resolved"
  | "incident.manually_resolved";

export type IncidentActorType = "system" | "user";

export interface IIncidentTimeline extends Document {
  incidentId: Types.ObjectId;
  monitorId: Types.ObjectId;
  userId: Types.ObjectId;
  type: IncidentTimelineEventType;
  actorType: IncidentActorType;
  actorId?: Types.ObjectId;
  checkId?: string;
  message: string;
  metadata?: Record<string, unknown>;
  idempotencyKey?: string;
  createdAt: Date;
  updatedAt: Date;
}

const incidentTimelineSchema = new Schema(
  {
    incidentId: { type: Schema.Types.ObjectId, ref: "Incident", required: true },
    monitorId: { type: Schema.Types.ObjectId, ref: "Monitor", required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: {
      type: String,
      enum: [
        "incident.created",
        "incident.acknowledged",
        "incident.failure_observed",
        "incident.recovery_progress",
        "incident.resolved",
        "incident.manually_resolved",
      ],
      required: true,
    },
    actorType: {
      type: String,
      enum: ["system", "user"],
      required: true,
    },
    actorId: { type: Schema.Types.ObjectId, ref: "User" },
    checkId: { type: String },
    message: { type: String, required: true, trim: true, maxlength: 500 },
    metadata: { type: Schema.Types.Mixed },
    idempotencyKey: { type: String },
  },
  { timestamps: true },
);

incidentTimelineSchema.index({ incidentId: 1, createdAt: 1 });
incidentTimelineSchema.index({ idempotencyKey: 1 }, { unique: true, sparse: true });

export const IncidentTimeline = model<IIncidentTimeline>(
  "IncidentTimeline",
  incidentTimelineSchema,
);
