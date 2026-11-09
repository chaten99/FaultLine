import { Types } from "mongoose";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { createApiError } from "../../lib/errors/create-api-error.js";
import { publishDomainEvent } from "../../lib/redis/redis.service.js";
import {
  getNotificationQueue,
  notificationJobId,
  type NotificationJobData,
} from "../../queues/notification.queue.js";
import { NotificationDelivery, type INotificationDelivery } from "./notification-delivery.model.js";
import { sendDelivery } from "./notification-sender.service.js";
import { failureMessages } from "./notification.types.js";
import type { ChannelResult } from "./notification.types.js";
import type { SecureClientDeps } from "./secure-http.service.js";

const retentionMs = 90 * 24 * 60 * 60 * 1000;
const claimableStatuses = ["pending", "queued", "retrying", "sending"];

export class DeliveryRetryError extends Error {
  constructor(readonly retryDelayMs: number) {
    super("Delivery will be retried");
    this.name = "DeliveryRetryError";
  }
}

export const computeBackoffMs = (
  attempt: number,
  retryAfterMs: number | null,
  random: () => number = Math.random,
): number => {
  const exponential = env.NOTIFICATION_RETRY_BASE_MS * 2 ** Math.max(0, attempt - 1);
  const jittered = Math.round(exponential * (0.9 + random() * 0.2));
  return Math.min(env.NOTIFICATION_RETRY_MAX_MS, Math.max(jittered, retryAfterMs ?? 0));
};

export const deliveryRetentionDate = (): Date => new Date(Date.now() + retentionMs);

export const publishDeliveryUpdate = async (userId: string, deliveryId: string, status: string) => {
  await publishDomainEvent("notification.delivery_updated", {
    userId,
    payload: { deliveryId, status },
  });
};

export const enqueueDelivery = async (
  delivery: Pick<INotificationDelivery, "_id" | "generation">,
): Promise<void> => {
  const deliveryId = String(delivery._id);
  await getNotificationQueue().add(
    "deliver",
    { deliveryId, generation: delivery.generation },
    { jobId: notificationJobId(deliveryId, delivery.generation) },
  );
  await NotificationDelivery.updateOne(
    { _id: delivery._id, generation: delivery.generation, status: "pending" },
    { $set: { status: "queued" } },
  );
};

export type ProcessOutcome = "delivered" | "failed" | "retrying" | "skipped";

export const processDelivery = async (
  data: NotificationJobData,
  options: { maxAttempts?: number; deps?: SecureClientDeps } = {},
): Promise<{ outcome: ProcessOutcome; retryDelayMs?: number }> => {
  if (!Types.ObjectId.isValid(data.deliveryId)) return { outcome: "skipped" };
  const maxAttempts = options.maxAttempts ?? env.NOTIFICATION_MAX_ATTEMPTS;
  const startedAt = new Date();

  const claimed = await NotificationDelivery.findOneAndUpdate(
    {
      _id: data.deliveryId,
      generation: data.generation,
      status: { $in: claimableStatuses },
    },
    { $set: { status: "sending", lastAttemptAt: startedAt }, $inc: { attempts: 1 } },
    { new: true },
  );
  if (!claimed) return { outcome: "skipped" };

  const userId = String(claimed.userId);
  await publishDeliveryUpdate(userId, data.deliveryId, "sending");

  let result: ChannelResult;
  try {
    result = await sendDelivery(claimed, options.deps);
  } catch (error) {
    logger.error({ err: error, deliveryId: data.deliveryId }, "Notification sender crashed");
    result = {
      ok: false,
      category: "UNKNOWN",
      transient: true,
      responseCode: null,
      retryAfterMs: null,
      durationMs: 0,
    };
  }

  const attempt = claimed.attempts;

  if (result.ok) {
    await NotificationDelivery.updateOne(
      { _id: claimed._id },
      {
        $set: {
          status: "delivered",
          deliveredAt: new Date(),
          ...(result.responseCode !== null ? { responseCode: result.responseCode } : {}),
        },
        $unset: { nextRetryAt: "", failureCategory: "", message: "" },
        $push: {
          attemptHistory: {
            $each: [
              {
                attempt,
                at: startedAt,
                outcome: "delivered",
                responseCode: result.responseCode,
                failureCategory: null,
                durationMs: result.durationMs,
                willRetry: false,
              },
            ],
            $slice: -20,
          },
        },
      },
    );
    await publishDeliveryUpdate(userId, data.deliveryId, "delivered");
    return { outcome: "delivered" };
  }

  const willRetry = result.transient && attempt < maxAttempts;
  const retryDelayMs = willRetry ? computeBackoffMs(attempt, result.retryAfterMs) : undefined;
  const historyEntry = {
    attempt,
    at: startedAt,
    outcome: "failed" as const,
    responseCode: result.responseCode,
    failureCategory: result.category,
    durationMs: result.durationMs,
    willRetry,
  };

  await NotificationDelivery.updateOne(
    { _id: claimed._id },
    {
      $set: {
        status: willRetry ? "retrying" : "failed",
        failureCategory: result.category,
        message: failureMessages[result.category],
        ...(result.responseCode !== null ? { responseCode: result.responseCode } : {}),
        ...(retryDelayMs !== undefined ? { nextRetryAt: new Date(Date.now() + retryDelayMs) } : {}),
      },
      ...(willRetry ? {} : { $unset: { nextRetryAt: "" } }),
      $push: { attemptHistory: { $each: [historyEntry], $slice: -20 } },
    },
  );
  await publishDeliveryUpdate(userId, data.deliveryId, willRetry ? "retrying" : "failed");

  if (willRetry && retryDelayMs !== undefined) return { outcome: "retrying", retryDelayMs };
  return { outcome: "failed" };
};

export const retryFailedDelivery = async (userId: string, deliveryId: string) => {
  if (!Types.ObjectId.isValid(deliveryId)) {
    throw createApiError("Delivery not found.", 404, "DELIVERY_NOT_FOUND");
  }
  const existing = await NotificationDelivery.findOne({ _id: deliveryId, userId });
  if (!existing) throw createApiError("Delivery not found.", 404, "DELIVERY_NOT_FOUND");
  if (existing.status !== "failed" || existing.kind !== "incident") {
    throw createApiError(
      "Only failed incident notifications can be retried.",
      409,
      "DELIVERY_NOT_RETRYABLE",
    );
  }
  const reset = await NotificationDelivery.findOneAndUpdate(
    { _id: existing._id, userId, status: "failed", generation: existing.generation },
    {
      $set: { status: "pending", attempts: 0 },
      $inc: { generation: 1 },
      $unset: { nextRetryAt: "", failureCategory: "", message: "" },
    },
    { new: true },
  );
  if (!reset) {
    throw createApiError("This delivery is already being retried.", 409, "DELIVERY_NOT_RETRYABLE");
  }
  try {
    await enqueueDelivery(reset);
  } catch (error) {
    logger.warn({ err: error, deliveryId }, "Manual delivery retry could not be queued yet");
  }
  await publishDeliveryUpdate(userId, deliveryId, "pending");
  return NotificationDelivery.findById(reset._id);
};

export const recoverStaleDeliveries = async (now = new Date()): Promise<number> => {
  const minutes = (value: number) => new Date(now.getTime() - value * 60_000);
  const stale = await NotificationDelivery.find({
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
    const reset = await NotificationDelivery.findOneAndUpdate(
      { _id: delivery._id, generation: delivery.generation, status: delivery.status },
      { $set: { status: "pending" }, $inc: { generation: 1 } },
      { new: true },
    );
    if (!reset) continue;
    try {
      await enqueueDelivery(reset);
      recovered += 1;
    } catch (error) {
      logger.warn({ err: error, deliveryId: String(reset._id) }, "Stale delivery requeue failed");
    }
  }
  return recovered;
};
