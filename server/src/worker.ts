import mongoose from "mongoose";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { closeRedisConnections, getRedisClient } from "./lib/redis/redis.service.js";
import { closeMonitorCheckQueue } from "./queues/monitor-check.queue.js";
import { closeNotificationQueue } from "./queues/notification.queue.js";
import { reconcileSchedulers } from "./queues/monitor-scheduler.service.js";
import { ensureLifecycleBaselines } from "./modules/monitors/monitor-lifecycle.service.js";
import { runNotificationMaintenance } from "./modules/notifications/notification-maintenance.service.js";
import {
  closeMonitorCheckWorker,
  createMonitorCheckWorker,
} from "./workers/monitor-check.worker.js";
import {
  closeNotificationWorker,
  createNotificationWorker,
} from "./workers/notification.worker.js";

const startWorkerProcess = async () => {
  try {
    logger.info("Starting FaultLine monitoring worker process");

    await mongoose.connect(env.MONGODB_URI);
    logger.info("Worker connected to MongoDB");
    await ensureLifecycleBaselines().catch((error: unknown) => {
      logger.warn({ err: error }, "Monitor lifecycle baseline failed");
    });

    const redis = getRedisClient();
    if (redis.status === "wait") {
      await redis.connect();
    }
    logger.info("Worker connected to Redis");

    await reconcileSchedulers();

    createMonitorCheckWorker();
    logger.info(
      { queue: env.MONITOR_QUEUE_NAME, concurrency: env.WORKER_CONCURRENCY },
      "Monitoring worker started and listening for jobs",
    );

    createNotificationWorker();
    logger.info(
      { queue: env.NOTIFICATION_QUEUE_NAME, concurrency: env.NOTIFICATION_WORKER_CONCURRENCY },
      "Notification worker started and listening for jobs",
    );
    void runNotificationMaintenance();
    const notificationTimer = setInterval(() => {
      void runNotificationMaintenance();
    }, env.NOTIFICATION_OUTBOX_INTERVAL_MS);

    const intervalMs = env.RECONCILIATION_INTERVAL_SECONDS * 1000;
    const reconciliationTimer = setInterval(() => {
      void reconcileSchedulers();
    }, intervalMs);

    let isShuttingDown = false;
    const shutdown = async (signal: string) => {
      if (isShuttingDown) return;
      isShuttingDown = true;
      logger.info({ signal }, "Shutting down monitoring worker process gracefully");

      clearInterval(reconciliationTimer);
      clearInterval(notificationTimer);

      try {
        await closeMonitorCheckWorker();
        await closeNotificationWorker();
        await closeMonitorCheckQueue();
        await closeNotificationQueue();
        await closeRedisConnections();
        await mongoose.disconnect();
        logger.info("Worker process shutdown complete");
        process.exit(0);
      } catch (err) {
        logger.error({ err }, "Error during worker shutdown");
        process.exit(1);
      }
    };

    process.once("SIGINT", () => void shutdown("SIGINT"));
    process.once("SIGTERM", () => void shutdown("SIGTERM"));
  } catch (error) {
    logger.fatal({ err: error }, "Failed to start monitoring worker process");
    process.exit(1);
  }
};

void startWorkerProcess();
