import { Schema, model } from "mongoose";

export const checkStatuses = [
  "queued",
  "running",
  "success",
  "failure",
  "timeout",
  "error",
] as const;
export type CheckStatus = (typeof checkStatuses)[number];

const monitorCheckSchema = new Schema(
  {
    monitorId: {
      type: Schema.Types.ObjectId,
      ref: "Monitor",
      required: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    runId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    status: {
      type: String,
      enum: checkStatuses,
      required: true,
      default: "queued",
    },
    startedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    completedAt: {
      type: Date,
    },
    responseDurationMs: {
      type: Number,
    },
    statusCode: {
      type: Number,
    },
    failureCategory: {
      type: String,
      maxlength: 50,
    },
    errorMessage: {
      type: String,
      maxlength: 500,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true },
);

monitorCheckSchema.index({ monitorId: 1, completedAt: -1 });
monitorCheckSchema.index({ monitorId: 1, createdAt: -1 });
monitorCheckSchema.index({ userId: 1, monitorId: 1, createdAt: -1 });
monitorCheckSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const MonitorCheck = model("MonitorCheck", monitorCheckSchema);
