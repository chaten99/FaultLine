import { Schema, model, type Document, type Types } from "mongoose";

export type IncidentStatus = "open" | "acknowledged" | "resolved";
export type IncidentResolutionType = "automatic" | "manual";

export interface IIncident extends Document {
  monitorId: Types.ObjectId;
  userId: Types.ObjectId;
  title: string;
  status: IncidentStatus;
  firstFailureAt: Date;
  lastFailureAt: Date;
  openedAt: Date;
  acknowledgedAt?: Date;
  acknowledgedBy?: Types.ObjectId;
  resolvedAt?: Date;
  resolutionType?: IncidentResolutionType;
  resolutionReason?: string;
  firstFailureCheckId?: string;
  latestFailureCheckId?: string;
  recoveryCheckId?: string;
  failureCountAtCreation?: number;
  recoveryCheckCount?: number;
  durationMs?: number;
  createdAt: Date;
  updatedAt: Date;
}

const incidentSchema = new Schema(
  {
    monitorId: { type: Schema.Types.ObjectId, ref: "Monitor", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    status: {
      type: String,
      enum: ["open", "acknowledged", "resolved"],
      required: true,
      default: "open",
    },
    firstFailureAt: { type: Date, required: true },
    lastFailureAt: { type: Date, required: true },
    openedAt: { type: Date, required: true },
    acknowledgedAt: { type: Date },
    acknowledgedBy: { type: Schema.Types.ObjectId, ref: "User" },
    resolvedAt: { type: Date },
    resolutionType: { type: String, enum: ["automatic", "manual"] },
    resolutionReason: { type: String, trim: true, maxlength: 1000 },
    firstFailureCheckId: { type: String },
    latestFailureCheckId: { type: String },
    recoveryCheckId: { type: String },
    failureCountAtCreation: { type: Number, default: 0 },
    recoveryCheckCount: { type: Number, default: 0 },
    durationMs: { type: Number },
  },
  { timestamps: true },
);

incidentSchema.index({ userId: 1, createdAt: -1 });
incidentSchema.index({ monitorId: 1, createdAt: -1 });
incidentSchema.index({ status: 1, createdAt: -1 });
incidentSchema.index({ updatedAt: -1 });
incidentSchema.index(
  { monitorId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $in: ["open", "acknowledged"] } },
  },
);

export const Incident = model<IIncident>("Incident", incidentSchema);
