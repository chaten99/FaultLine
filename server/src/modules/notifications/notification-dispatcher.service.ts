import { Types } from "mongoose";
import { logger } from "../../config/logger.js";
import { User } from "../auth/user.model.js";
import { NotificationDelivery, type INotificationDelivery } from "./notification-delivery.model.js";
import { NotificationIntegration } from "./notification-integration.model.js";
import { NotificationOutbox, type INotificationOutbox } from "./notification-outbox.model.js";
import { isEventEnabled, loadPreferenceSettings } from "./notification-preferences.service.js";
import {
  deliveryRetentionDate,
  enqueueDelivery,
  publishDeliveryUpdate,
} from "./notification-delivery.service.js";
import type { ChannelType, IncidentEventType } from "./notification.types.js";
import { dispatchSubscriberNotifications } from "../status-pages/status-page-delivery.service.js";
import { publishPublicIncidentUpdates } from "../status-pages/status-page-realtime.service.js";

const claimWindowMs = 60_000;

export const buildDeliveryKey = (
  eventId: string,
  channel: ChannelType,
  integrationId?: string,
): string => `${eventId}|${channel}|${integrationId ?? "account"}`;

type DeliveryTarget = {
  channel: ChannelType;
  integrationId?: Types.ObjectId;
  integrationName?: string;
};

export const resolveDeliveryTargets = async (
  userId: string,
  eventType: IncidentEventType,
): Promise<DeliveryTarget[]> => {
  const settings = await loadPreferenceSettings(userId);
  if (!isEventEnabled(settings, eventType)) return [];

  const targets: DeliveryTarget[] = [];
  if (settings.channels.email) {
    const user = await User.findById(userId).select("emailVerifiedAt").lean();
    if (user?.emailVerifiedAt) targets.push({ channel: "email" });
  }

  const wantsIntegrations = settings.channels.slack || settings.channels.webhook;
  if (wantsIntegrations) {
    const integrations = await NotificationIntegration.find({
      userId,
      enabled: true,
      events: eventType,
    }).lean();
    for (const integration of integrations) {
      if (!settings.channels[integration.type]) continue;
      targets.push({
        channel: integration.type,
        integrationId: integration._id,
        integrationName: integration.name,
      });
    }
  }
  return targets;
};

const ensureDelivery = async (
  outbox: INotificationOutbox,
  target: DeliveryTarget,
): Promise<INotificationDelivery> => {
  const deliveryKey = buildDeliveryKey(
    outbox.eventId,
    target.channel,
    target.integrationId ? String(target.integrationId) : undefined,
  );
  try {
    return await NotificationDelivery.create({
      deliveryKey,
      kind: "incident",
      eventId: outbox.eventId,
      eventType: outbox.type,
      userId: outbox.userId,
      channel: target.channel,
      integrationId: target.integrationId,
      integrationName: target.integrationName,
      incidentId: outbox.incidentId,
      incidentTitle: outbox.snapshot.title.slice(0, 200),
      monitorName: outbox.snapshot.monitorName.slice(0, 100),
      snapshot: outbox.snapshot,
      status: "pending",
      attempts: 0,
      generation: 0,
      eventCreatedAt: outbox.eventAt,
      expiresAt: deliveryRetentionDate(),
    });
  } catch (error) {
    if ((error as { code?: number }).code !== 11000) throw error;
    const existing = await NotificationDelivery.findOne({ deliveryKey });
    if (!existing) throw error;
    return existing;
  }
};

export const dispatchOutboxEntry = async (outbox: INotificationOutbox): Promise<number> => {
  const targets = await resolveDeliveryTargets(String(outbox.userId), outbox.type);
  let dispatched = 0;
  for (const target of targets) {
    const delivery = await ensureDelivery(outbox, target);
    if (delivery.status === "pending") {
      await enqueueDelivery(delivery);
      await publishDeliveryUpdate(String(outbox.userId), String(delivery._id), "queued");
    }
    dispatched += 1;
  }
  dispatched += await dispatchSubscriberNotifications(outbox);
  await publishPublicIncidentUpdates({
    ownerId: String(outbox.userId),
    monitorId: outbox.snapshot.monitorId,
    incidentId: outbox.snapshot.incidentId,
    eventType: outbox.type,
  });
  return dispatched;
};

const claimOutboxEntry = async (filter: Record<string, unknown>) => {
  const now = new Date();
  return NotificationOutbox.findOneAndUpdate(
    {
      ...filter,
      $or: [
        { status: "pending", nextAttemptAt: { $lte: now } },
        { status: "processing", lockedUntil: { $lt: now } },
      ],
    },
    {
      $set: { status: "processing", lockedUntil: new Date(now.getTime() + claimWindowMs) },
      $inc: { attempts: 1 },
    },
    { new: true },
  );
};

const settleOutboxEntry = async (entry: INotificationOutbox): Promise<void> => {
  try {
    await dispatchOutboxEntry(entry);
    await NotificationOutbox.updateOne(
      { _id: entry._id },
      { $set: { status: "processed", processedAt: new Date() }, $unset: { lockedUntil: "" } },
    );
  } catch (error) {
    const delayMs = Math.min(300_000, 5_000 * 2 ** Math.min(entry.attempts, 6));
    logger.warn(
      { err: error, eventId: entry.eventId, attempts: entry.attempts },
      "Notification outbox dispatch failed and will be retried",
    );
    await NotificationOutbox.updateOne(
      { _id: entry._id },
      {
        $set: {
          status: "pending",
          nextAttemptAt: new Date(Date.now() + delayMs),
          lastError: "Dispatch failed; retry scheduled",
        },
        $unset: { lockedUntil: "" },
      },
    );
  }
};

export const dispatchOutboxEvent = async (eventId: string): Promise<boolean> => {
  const entry = await claimOutboxEntry({ eventId });
  if (!entry) return false;
  await settleOutboxEntry(entry);
  return true;
};

export const processOutboxBatch = async (limit = 50): Promise<number> => {
  const now = new Date();
  const due = await NotificationOutbox.find({
    $or: [
      { status: "pending", nextAttemptAt: { $lte: now } },
      { status: "processing", lockedUntil: { $lt: now } },
    ],
  })
    .sort({ nextAttemptAt: 1 })
    .limit(limit)
    .lean();
  let handled = 0;
  for (const candidate of due) {
    if (await dispatchOutboxEvent(candidate.eventId)) handled += 1;
  }
  return handled;
};
