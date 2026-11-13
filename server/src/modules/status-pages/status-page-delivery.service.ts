import { Types } from "mongoose";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { sendNotificationEmail } from "../../lib/email/email.service.js";
import { renderIncidentEmail } from "../../lib/email/status-page-email-template.service.js";
import { getNotificationQueue, notificationJobId } from "../../queues/notification.queue.js";
import {
  computeBackoffMs,
  deliveryRetentionDate,
} from "../notifications/notification-delivery.service.js";
import type { INotificationOutbox } from "../notifications/notification-outbox.model.js";
import { failureMessages, type ChannelResult } from "../notifications/notification.types.js";
import { findPublishedPagesForMonitor, loadServiceLites } from "./status-page-realtime.service.js";
import { StatusPageDelivery } from "./status-page-delivery.model.js";
import { StatusPageSubscriber } from "./status-page-subscriber.model.js";
import { PublicStatusPage } from "./status-page.model.js";
import { serviceNamesByMonitor, toPublicIncident } from "./status-page-snapshot.service.js";
import { unsubscribeUrlFor } from "./status-page-subscriber.service.js";
import { publicUrlFor } from "./status-page-view.js";
import { eventKeyFor } from "./status-page.types.js";

export const buildSubscriberDeliveryKey = (eventId: string, subscriberId: string): string =>
  `${eventId}|subscriber|${subscriberId}`;

const maxSubscribersPerEvent = 5000;

export const dispatchSubscriberNotifications = async (
  outbox: INotificationOutbox,
): Promise<number> => {
  const eventKey = eventKeyFor[outbox.type];
  const monitorId = outbox.snapshot.monitorId;
  const pages = await findPublishedPagesForMonitor(String(outbox.workspaceId), monitorId);
  let queued = 0;
  for (const page of pages) {
    if (!page.subscribersEnabled || !page.subscriberEvents?.[eventKey]) continue;
    const pageId = String(page._id);
    const services = await loadServiceLites(pageId);
    const names = serviceNamesByMonitor(services).get(monitorId) ?? [];
    const publicIncident = toPublicIncident(
      {
        id: outbox.snapshot.incidentId,
        monitorId,
        status: outbox.snapshot.status,
        firstFailureAt: new Date(outbox.snapshot.firstFailureAt).getTime(),
        openedAt: new Date(outbox.snapshot.openedAt).getTime(),
        acknowledgedAt: outbox.snapshot.acknowledgedAt
          ? new Date(outbox.snapshot.acknowledgedAt).getTime()
          : null,
        resolvedAt: outbox.snapshot.resolvedAt
          ? new Date(outbox.snapshot.resolvedAt).getTime()
          : null,
      },
      names,
      Date.now(),
    );
    const subscribers = await StatusPageSubscriber.find({
      pageId: page._id,
      status: "active",
      [`events.${eventKey}`]: true,
    })
      .limit(maxSubscribersPerEvent)
      .lean();
    for (const subscriber of subscribers) {
      const deliveryKey = buildSubscriberDeliveryKey(outbox.eventId, String(subscriber._id));
      let delivery = null;
      try {
        delivery = await StatusPageDelivery.create({
          deliveryKey,
          subscriberId: subscriber._id,
          pageId: page._id,
          eventId: outbox.eventId,
          eventType: outbox.type,
          status: "pending",
          attempts: 0,
          generation: 0,
          snapshot: {
            pageName: page.name,
            pageSlug: page.slug,
            incidentTitle: publicIncident.title,
            serviceNames: names,
            startedAt: publicIncident.startedAt,
            acknowledgedAt: outbox.snapshot.acknowledgedAt,
            resolvedAt: outbox.snapshot.resolvedAt,
            durationMs: outbox.snapshot.durationMs,
          },
          expiresAt: deliveryRetentionDate(),
        });
      } catch (error) {
        if ((error as { code?: number }).code !== 11000) throw error;
        delivery = await StatusPageDelivery.findOne({ deliveryKey });
      }
      if (delivery && delivery.status === "pending") {
        await enqueueSubscriberDelivery(delivery);
        queued += 1;
      }
    }
  }
  return queued;
};

export const enqueueSubscriberDelivery = async (delivery: {
  _id: unknown;
  generation: number;
}): Promise<void> => {
  const deliveryId = String(delivery._id);
  await getNotificationQueue().add(
    "deliver-subscriber",
    { kind: "subscriber", deliveryId, generation: delivery.generation },
    { jobId: notificationJobId(deliveryId, delivery.generation) },
  );
  await StatusPageDelivery.updateOne(
    { _id: delivery._id, generation: delivery.generation, status: "pending" },
    { $set: { status: "queued" } },
  );
};

export type SubscriberOutcome = "delivered" | "failed" | "retrying" | "skipped";

export const processSubscriberDelivery = async (
  data: { deliveryId: string; generation: number },
  options: { maxAttempts?: number } = {},
): Promise<{ outcome: SubscriberOutcome; retryDelayMs?: number }> => {
  if (!Types.ObjectId.isValid(data.deliveryId)) return { outcome: "skipped" };
  const maxAttempts = options.maxAttempts ?? env.NOTIFICATION_MAX_ATTEMPTS;
  const startedAt = new Date();
  const claimed = await StatusPageDelivery.findOneAndUpdate(
    {
      _id: data.deliveryId,
      generation: data.generation,
      status: { $in: ["pending", "queued", "retrying", "sending"] },
    },
    { $set: { status: "sending", lastAttemptAt: startedAt }, $inc: { attempts: 1 } },
    { new: true },
  );
  if (!claimed) return { outcome: "skipped" };

  const [subscriber, page] = await Promise.all([
    StatusPageSubscriber.findById(claimed.subscriberId),
    PublicStatusPage.findById(claimed.pageId),
  ]);
  const eventKey = eventKeyFor[claimed.eventType];
  const eligible =
    subscriber &&
    page &&
    subscriber.status === "active" &&
    subscriber.events?.[eventKey] &&
    page.status === "published" &&
    page.subscribersEnabled;
  if (!eligible || !subscriber || !page) {
    await StatusPageDelivery.updateOne(
      { _id: claimed._id },
      { $set: { status: "failed", failureCategory: "SUBSCRIPTION_INACTIVE" } },
    );
    return { outcome: "failed" };
  }

  let result: ChannelResult;
  try {
    const unsubscribeUrl = unsubscribeUrlFor(page.slug, String(page._id), String(subscriber._id));
    const rendered = await renderIncidentEmail(claimed.eventType, {
      snapshot: claimed.snapshot,
      statusUrl: publicUrlFor(page.slug),
      unsubscribeUrl,
    });
    result = await sendNotificationEmail({
      to: subscriber.email,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      headers: { "List-Unsubscribe": `<${unsubscribeUrl}>` },
    });
  } catch (error) {
    logger.error({ err: error, deliveryId: data.deliveryId }, "Subscriber email crashed");
    result = {
      ok: false,
      category: "UNKNOWN",
      transient: true,
      responseCode: null,
      retryAfterMs: null,
      durationMs: 0,
    };
  }

  if (result.ok) {
    await StatusPageDelivery.updateOne(
      { _id: claimed._id },
      {
        $set: { status: "delivered", deliveredAt: new Date() },
        $unset: { nextRetryAt: "", failureCategory: "" },
      },
    );
    return { outcome: "delivered" };
  }

  const willRetry = result.transient && claimed.attempts < maxAttempts;
  const retryDelayMs = willRetry
    ? computeBackoffMs(claimed.attempts, result.retryAfterMs)
    : undefined;
  await StatusPageDelivery.updateOne(
    { _id: claimed._id },
    {
      $set: {
        status: willRetry ? "retrying" : "failed",
        failureCategory: result.category,
        ...(retryDelayMs !== undefined ? { nextRetryAt: new Date(Date.now() + retryDelayMs) } : {}),
      },
      ...(willRetry ? {} : { $unset: { nextRetryAt: "" } }),
    },
  );
  logger.warn(
    {
      deliveryId: data.deliveryId,
      category: result.category,
      message: failureMessages[result.category],
    },
    "Subscriber delivery did not succeed",
  );
  if (willRetry && retryDelayMs !== undefined) return { outcome: "retrying", retryDelayMs };
  return { outcome: "failed" };
};

export const recoverStaleSubscriberDeliveries = async (now = new Date()): Promise<number> => {
  const minutes = (value: number) => new Date(now.getTime() - value * 60_000);
  const stale = await StatusPageDelivery.find({
    $or: [
      { status: "pending", updatedAt: { $lt: minutes(1) } },
      { status: "queued", updatedAt: { $lt: minutes(env.NOTIFICATION_RETRY_MAX_MS / 60_000 + 5) } },
      { status: "sending", updatedAt: { $lt: minutes(2) } },
      { status: "retrying", nextRetryAt: { $lt: minutes(5) } },
    ],
  })
    .limit(100)
    .lean();
  let recovered = 0;
  for (const delivery of stale) {
    const reset = await StatusPageDelivery.findOneAndUpdate(
      { _id: delivery._id, generation: delivery.generation, status: delivery.status },
      { $set: { status: "pending" }, $inc: { generation: 1 } },
      { new: true },
    );
    if (!reset) continue;
    try {
      await enqueueSubscriberDelivery(reset);
      recovered += 1;
    } catch (error) {
      logger.warn({ err: error, deliveryId: String(reset._id) }, "Subscriber requeue failed");
    }
  }
  return recovered;
};
