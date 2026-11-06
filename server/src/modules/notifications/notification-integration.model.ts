import { Schema, model, type Types } from "mongoose";
import { incidentEventTypes, integrationTypes } from "./notification.types.js";
import type { IncidentEventType, IntegrationType } from "./notification.types.js";

export interface INotificationIntegration {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  type: IntegrationType;
  name: string;
  enabled: boolean;
  events: IncidentEventType[];
  encryptedUrl: string;
  encryptedSigningSecret?: string;
  urlHint: string;
  createdAt: Date;
  updatedAt: Date;
}

const integrationSchema = new Schema<INotificationIntegration>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, enum: integrationTypes, required: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    enabled: { type: Boolean, required: true, default: true },
    events: { type: [{ type: String, enum: incidentEventTypes }], default: [] },
    encryptedUrl: { type: String, required: true, select: false },
    encryptedSigningSecret: { type: String, select: false },
    urlHint: { type: String, required: true, maxlength: 200 },
  },
  { timestamps: true },
);

integrationSchema.index({ userId: 1, type: 1, createdAt: -1 });

export const NotificationIntegration = model<INotificationIntegration>(
  "NotificationIntegration",
  integrationSchema,
);
