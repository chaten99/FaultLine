import { Queue } from "bullmq";
import { env } from "../config/env.js";
import { createRedisConnection } from "../lib/redis/redis.service.js";

export type NotificationJobData = {
  deliveryId: string;
  generation: number;
  kind?: "subscriber";
};

let queueInstance: Queue<NotificationJobData> | null = null;

export const getNotificationQueue = (): Queue<NotificationJobData> => {
  if (!queueInstance) {
    queueInstance = new Queue<NotificationJobData>(env.NOTIFICATION_QUEUE_NAME, {
      connection: createRedisConnection(),
      defaultJobOptions: {
        removeOnComplete: 200,
        removeOnFail: 1000,
        attempts: env.NOTIFICATION_MAX_ATTEMPTS,
        backoff: { type: "custom" },
      },
    });
  }
  return queueInstance;
};

export const notificationJobId = (deliveryId: string, generation: number): string =>
  `${deliveryId}_${generation}`;

export const closeNotificationQueue = async (): Promise<void> => {
  if (queueInstance) {
    await queueInstance.close();
    queueInstance = null;
  }
};
