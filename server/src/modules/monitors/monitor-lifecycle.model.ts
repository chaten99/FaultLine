import { Schema, model, type Types } from "mongoose";

export const lifecycleEventTypes = ["created", "paused", "resumed", "tracking_started"] as const;
export type LifecycleEventType = (typeof lifecycleEventTypes)[number];

export interface IMonitorLifecycleEvent {
  _id: Types.ObjectId;
  monitorId: Types.ObjectId;
  userId: Types.ObjectId;
  type: LifecycleEventType;
  active: boolean;
  at: Date;
  createdAt: Date;
  updatedAt: Date;
}

const lifecycleSchema = new Schema<IMonitorLifecycleEvent>(
  {
    monitorId: { type: Schema.Types.ObjectId, ref: "Monitor", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, enum: lifecycleEventTypes, required: true },
    active: { type: Boolean, required: true },
    at: { type: Date, required: true },
  },
  { timestamps: true },
);

lifecycleSchema.index({ monitorId: 1, at: 1 });
lifecycleSchema.index(
  { monitorId: 1, type: 1 },
  { unique: true, partialFilterExpression: { type: { $in: ["created", "tracking_started"] } } },
);

export const MonitorLifecycleEvent = model<IMonitorLifecycleEvent>(
  "MonitorLifecycleEvent",
  lifecycleSchema,
);
