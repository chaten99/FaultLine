import { Worker, type Job } from "bullmq";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { createRedisConnection } from "../lib/redis/redis.service.js";
import {
  DeliveryRetryError,
  computeBackoffMs,
  processDelivery,
} from "../modules/notifications/notification-delivery.service.js";
import type { NotificationJobData } from "../queues/notification.queue.js";

let workerInstance: Worker<NotificationJobData> | null = null;

export const processNotificationJob = async (job: Job<NotificationJobData>): Promise<void> => {
  const result = await processDelivery(job.data);
  if (result.outcome === "retrying") {
    throw new DeliveryRetryError(result.retryDelayMs ?? env.NOTIFICATION_RETRY_BASE_MS);
  }
};

export const createNotificationWorker = (): Worker<NotificationJobData> => {
  workerInstance = new Worker<NotificationJobData>(
    env.NOTIFICATION_QUEUE_NAME,
    processNotificationJob,
    {
      connection: createRedisConnection(),
      concurrency: env.NOTIFICATION_WORKER_CONCURRENCY,
      settings: {
        backoffStrategy: (attemptsMade, _type, error) =>
          error instanceof DeliveryRetryError
            ? error.retryDelayMs
            : computeBackoffMs(attemptsMade, null),
      },
    },
  );
  workerInstance.on("error", (error) => {
    logger.error({ err: error.message }, "Notification worker error");
  });
  workerInstance.on("failed", (job, error) => {
    if (error instanceof DeliveryRetryError) return;
    logger.error({ jobId: job?.id, err: error.message }, "Notification job failed");
  });
  return workerInstance;
};

export const closeNotificationWorker = async (): Promise<void> => {
  if (workerInstance) {
    await workerInstance.close();
    workerInstance = null;
  }
};
