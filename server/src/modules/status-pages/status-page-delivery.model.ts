import { Schema, model, type Types } from "mongoose";
import { deliveryStatuses, incidentEventTypes } from "../notifications/notification.types.js";
import type {
  DeliveryStatus,
  FailureCategory,
  IncidentEventType,
} from "../notifications/notification.types.js";

export type SubscriberEmailSnapshot = {
  pageName: string;
  pageSlug: string;
  incidentTitle: string;
  serviceNames: string[];
  startedAt: string;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  durationMs: number | null;
};

export interface IStatusPageDelivery {
  _id: Types.ObjectId;
  deliveryKey: string;
  subscriberId: Types.ObjectId;
  pageId: Types.ObjectId;
  eventId: string;
  eventType: IncidentEventType;
  status: DeliveryStatus;
  attempts: number;
  generation: number;
  nextRetryAt?: Date;
  lastAttemptAt?: Date;
  deliveredAt?: Date;
  failureCategory?: FailureCategory;
  snapshot: SubscriberEmailSnapshot;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const deliverySchema = new Schema<IStatusPageDelivery>(
  {
    deliveryKey: { type: String, required: true, unique: true },
    subscriberId: { type: Schema.Types.ObjectId, ref: "StatusPageSubscriber", required: true },
    pageId: { type: Schema.Types.ObjectId, ref: "PublicStatusPage", required: true },
    eventId: { type: String, required: true },
    eventType: { type: String, enum: incidentEventTypes, required: true },
    status: { type: String, enum: deliveryStatuses, required: true, default: "pending" },
    attempts: { type: Number, required: true, default: 0 },
    generation: { type: Number, required: true, default: 0 },
    nextRetryAt: { type: Date },
    lastAttemptAt: { type: Date },
    deliveredAt: { type: Date },
    failureCategory: { type: String },
    snapshot: { type: Schema.Types.Mixed, required: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

deliverySchema.index({ subscriberId: 1, createdAt: -1 });
deliverySchema.index({ pageId: 1, eventId: 1 });
deliverySchema.index({ status: 1, updatedAt: 1 });
deliverySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const StatusPageDelivery = model<IStatusPageDelivery>("StatusPageDelivery", deliverySchema);
