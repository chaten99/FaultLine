import { Schema, model } from "mongoose";

export const monitorIntervals = [60, 300, 600, 900, 1800, 3600] as const;
export type MonitorInterval = (typeof monitorIntervals)[number];

const monitorSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    url: { type: String, required: true, trim: true, maxlength: 2048 },
    method: { type: String, enum: ["GET"], required: true, default: "GET" },
    intervalSeconds: { type: Number, enum: monitorIntervals, required: true },
    timeoutMs: { type: Number, required: true, min: 1000, max: 30000 },
    expectedStatusCodes: {
      type: [Number],
      required: true,
      validate: (value: number[]) => value.length > 0,
    },
    active: { type: Boolean, required: true, default: true },
  },
  { timestamps: true },
);

monitorSchema.index({ userId: 1, createdAt: -1 });
export const Monitor = model("Monitor", monitorSchema);
