import { Schema, model, type Types } from "mongoose";

export interface INotificationPreferences {
  workspaceId: Types.ObjectId;
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
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
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

preferencesSchema.index({ workspaceId: 1, userId: 1 }, { unique: true });

export const NotificationPreferences = model<INotificationPreferences>(
  "NotificationPreferences",
  preferencesSchema,
);
