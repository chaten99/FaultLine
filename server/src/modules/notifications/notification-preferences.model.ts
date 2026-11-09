import { Schema, model, type Types } from "mongoose";

export interface INotificationPreferences {
  userId: Types.ObjectId;
  enabled: boolean;
  channels: { email: boolean; slack: boolean; webhook: boolean };
  events: { opened: boolean; acknowledged: boolean; resolved: boolean };
  createdAt: Date;
  updatedAt: Date;
}

export const defaultNotificationPreferences = {
  enabled: true,
  channels: { email: true, slack: true, webhook: true },
  events: { opened: true, acknowledged: false, resolved: true },
};

const preferencesSchema = new Schema<INotificationPreferences>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    enabled: { type: Boolean, required: true, default: defaultNotificationPreferences.enabled },
    channels: {
      email: { type: Boolean, default: defaultNotificationPreferences.channels.email },
      slack: { type: Boolean, default: defaultNotificationPreferences.channels.slack },
      webhook: { type: Boolean, default: defaultNotificationPreferences.channels.webhook },
    },
    events: {
      opened: { type: Boolean, default: defaultNotificationPreferences.events.opened },
      acknowledged: { type: Boolean, default: defaultNotificationPreferences.events.acknowledged },
      resolved: { type: Boolean, default: defaultNotificationPreferences.events.resolved },
    },
  },
  { timestamps: true },
);

export const NotificationPreferences = model<INotificationPreferences>(
  "NotificationPreferences",
  preferencesSchema,
);
