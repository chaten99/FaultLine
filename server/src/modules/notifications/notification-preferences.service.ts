import { Types } from "mongoose";
import { createApiError } from "../../lib/errors/create-api-error.js";
import { User } from "../auth/user.model.js";
import {
  NotificationPreferences,
  defaultNotificationPreferences,
} from "./notification-preferences.model.js";
import type { IncidentEventType } from "./notification.types.js";

export type PreferenceSettings = {
  enabled: boolean;
  channels: { email: boolean; slack: boolean; webhook: boolean };
  events: { opened: boolean; acknowledged: boolean; resolved: boolean };
};

export type PreferencePatch = {
  enabled?: boolean;
  channels?: Partial<PreferenceSettings["channels"]>;
  events?: Partial<PreferenceSettings["events"]>;
};

type StoredPreferences = {
  enabled?: boolean | null;
  channels?: Partial<PreferenceSettings["channels"]> | null;
  events?: Partial<PreferenceSettings["events"]> | null;
  updatedAt?: Date;
} | null;

const merge = (stored: StoredPreferences): PreferenceSettings => {
  const defaults = defaultNotificationPreferences;
  return {
    enabled: stored?.enabled ?? defaults.enabled,
    channels: {
      email: stored?.channels?.email ?? defaults.channels.email,
      slack: stored?.channels?.slack ?? defaults.channels.slack,
      webhook: stored?.channels?.webhook ?? defaults.channels.webhook,
    },
    events: {
      opened: stored?.events?.opened ?? defaults.events.opened,
      acknowledged: stored?.events?.acknowledged ?? defaults.events.acknowledged,
      resolved: stored?.events?.resolved ?? defaults.events.resolved,
    },
  };
};

const eventKeys: Record<IncidentEventType, keyof PreferenceSettings["events"]> = {
  "incident.opened": "opened",
  "incident.acknowledged": "acknowledged",
  "incident.resolved": "resolved",
};

export const isEventEnabled = (settings: PreferenceSettings, event: IncidentEventType): boolean =>
  settings.enabled && settings.events[eventKeys[event]];

export const loadPreferenceSettings = async (userId: string): Promise<PreferenceSettings> =>
  merge((await NotificationPreferences.findOne({ userId }).lean()) as StoredPreferences);

export const getPreferencesView = async (userId: string) => {
  const [stored, user] = await Promise.all([
    NotificationPreferences.findOne({ userId }).lean() as Promise<StoredPreferences>,
    User.findById(userId).select("email emailVerifiedAt").lean(),
  ]);
  if (!user) throw createApiError("Authentication required.", 401, "AUTHENTICATION_REQUIRED");
  return {
    ...merge(stored),
    email: { address: user.email, verified: Boolean(user.emailVerifiedAt) },
    updatedAt: stored?.updatedAt ? stored.updatedAt.toISOString() : null,
  };
};

export const updatePreferences = async (userId: string, patch: PreferencePatch) => {
  const set: Record<string, boolean> = {};
  if (patch.enabled !== undefined) set.enabled = patch.enabled;
  for (const [key, value] of Object.entries(patch.channels ?? {})) {
    if (value !== undefined) set[`channels.${key}`] = value;
  }
  for (const [key, value] of Object.entries(patch.events ?? {})) {
    if (value !== undefined) set[`events.${key}`] = value;
  }
  await NotificationPreferences.findOneAndUpdate(
    { userId: new Types.ObjectId(userId) },
    { $set: set },
    { upsert: true, new: true },
  );
  return getPreferencesView(userId);
};
