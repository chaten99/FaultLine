import { Schema, model, type Types } from "mongoose";
import { channelTypes, deliveryStatuses, incidentEventTypes } from "./notification.types.js";
import type {
  ChannelType,
  DeliveryEventType,
  DeliveryStatus,
  FailureCategory,
  IncidentNotificationSnapshot,
} from "./notification.types.js";

export interface IDeliveryAttempt {
  attempt: number;
  at: Date;
  outcome: "delivered" | "failed";
  responseCode: number | null;
  failureCategory: FailureCategory | null;
  durationMs: number | null;
  willRetry: boolean;
}

export interface INotificationDelivery {
  _id: Types.ObjectId;
  deliveryKey: string;
  kind: "incident" | "test";
  eventId: string;
  eventType: DeliveryEventType;
  userId: Types.ObjectId;
  channel: ChannelType;
  integrationId?: Types.ObjectId;
  integrationName?: string;
  incidentId?: Types.ObjectId;
  incidentTitle?: string;
  monitorName?: string;
  snapshot?: IncidentNotificationSnapshot;
  status: DeliveryStatus;
  attempts: number;
  generation: number;
  nextRetryAt?: Date;
  lastAttemptAt?: Date;
  deliveredAt?: Date;
  responseCode?: number;
  failureCategory?: FailureCategory;
  message?: string;
  attemptHistory: IDeliveryAttempt[];
  eventCreatedAt: Date;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const attemptSchema = new Schema<IDeliveryAttempt>(
  {
    attempt: { type: Number, required: true },
    at: { type: Date, required: true },
    outcome: { type: String, enum: ["delivered", "failed"], required: true },
    responseCode: { type: Number, default: null },
    failureCategory: { type: String, default: null },
    durationMs: { type: Number, default: null },
    willRetry: { type: Boolean, required: true },
  },
  { _id: false },
);

const deliverySchema = new Schema<INotificationDelivery>(
  {
    deliveryKey: { type: String, required: true, unique: true },
    kind: { type: String, enum: ["incident", "test"], required: true },
    eventId: { type: String, required: true },
    eventType: {
      type: String,
      enum: [...incidentEventTypes, "notification.test"],
      required: true,
    },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    channel: { type: String, enum: channelTypes, required: true },
    integrationId: { type: Schema.Types.ObjectId, ref: "NotificationIntegration" },
    integrationName: { type: String, maxlength: 80 },
    incidentId: { type: Schema.Types.ObjectId, ref: "Incident" },
    incidentTitle: { type: String, maxlength: 200 },
    monitorName: { type: String, maxlength: 100 },
    snapshot: { type: Schema.Types.Mixed },
    status: { type: String, enum: deliveryStatuses, required: true, default: "pending" },
    attempts: { type: Number, required: true, default: 0 },
    generation: { type: Number, required: true, default: 0 },
    nextRetryAt: { type: Date },
    lastAttemptAt: { type: Date },
    deliveredAt: { type: Date },
    responseCode: { type: Number },
    failureCategory: { type: String },
    message: { type: String, maxlength: 300 },
    attemptHistory: { type: [attemptSchema], default: [] },
    eventCreatedAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

deliverySchema.index({ userId: 1, createdAt: -1 });
deliverySchema.index({ userId: 1, status: 1, createdAt: -1 });
deliverySchema.index({ eventId: 1 });
deliverySchema.index({ status: 1, updatedAt: 1 });
deliverySchema.index({ integrationId: 1, createdAt: -1 });
deliverySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const NotificationDelivery = model<INotificationDelivery>(
  "NotificationDelivery",
  deliverySchema,
);
