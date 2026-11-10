import { Schema, model, type Types } from "mongoose";
import {
  subscriberStatuses,
  type SubscriberEvents,
  type SubscriberStatus,
} from "./status-page.types.js";

export interface IStatusPageSubscriber {
  _id: Types.ObjectId;
  pageId: Types.ObjectId;
  email: string;
  status: SubscriberStatus;
  events: SubscriberEvents;
  confirmationTokenHash?: string;
  confirmationExpiresAt?: Date;
  lastConfirmationSentAt?: Date;
  verifiedAt?: Date;
  unsubscribedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const subscriberSchema = new Schema<IStatusPageSubscriber>(
  {
    pageId: { type: Schema.Types.ObjectId, ref: "PublicStatusPage", required: true },
    email: { type: String, required: true, lowercase: true, trim: true, maxlength: 254 },
    status: { type: String, enum: subscriberStatuses, required: true, default: "pending" },
    events: {
      opened: { type: Boolean, default: true },
      acknowledged: { type: Boolean, default: false },
      resolved: { type: Boolean, default: true },
    },
    confirmationTokenHash: { type: String, select: false },
    confirmationExpiresAt: { type: Date },
    lastConfirmationSentAt: { type: Date },
    verifiedAt: { type: Date },
    unsubscribedAt: { type: Date },
  },
  { timestamps: true },
);

subscriberSchema.index({ pageId: 1, email: 1 }, { unique: true });
subscriberSchema.index({ pageId: 1, status: 1, createdAt: -1 });
subscriberSchema.index({ confirmationTokenHash: 1 }, { sparse: true });

export const StatusPageSubscriber = model<IStatusPageSubscriber>(
  "StatusPageSubscriber",
  subscriberSchema,
);
