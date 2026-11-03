import { Queue } from "bullmq";
import { env } from "../config/env.js";
import { createRedisConnection } from "../lib/redis/redis.service.js";

export type MonitorCheckJobData = {
  monitorId: string;
  runId?: string;
  manual?: boolean;
  scheduled?: boolean;
  queuedAt: string;
};

let queueInstance: Queue<MonitorCheckJobData> | null = null;

export const getMonitorCheckQueue = (): Queue<MonitorCheckJobData> => {
  if (!queueInstance) {
    const connection = createRedisConnection();
    queueInstance = new Queue<MonitorCheckJobData>(env.MONITOR_QUEUE_NAME, {
      connection,
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 500,
        attempts: 3,
        backoff: { type: "exponential", delay: 1000 },
      },
    });
  }
  return queueInstance;
};

export const closeMonitorCheckQueue = async (): Promise<void> => {
  if (queueInstance) {
    await queueInstance.close();
    queueInstance = null;
  }
};
