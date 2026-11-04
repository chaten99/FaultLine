import crypto from "node:crypto";
import { Job, Worker } from "bullmq";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import {
  acquireLock,
  createRedisConnection,
  publishDomainEvent,
  releaseLock,
} from "../lib/redis/redis.service.js";
import { Monitor } from "../modules/monitors/monitor.model.js";
import { MonitorCheck, type CheckStatus } from "../modules/checks/monitor-check.model.js";
import { executeMonitorHttpCheck } from "../modules/monitors/monitor-executor.service.js";
import { evaluateCheckForIncident } from "../modules/incidents/incident.service.js";
import type { MonitorCheckJobData } from "../queues/monitor-check.queue.js";

export const processMonitorCheckJob = async (job: Job<MonitorCheckJobData>): Promise<void> => {
  const { monitorId, manual } = job.data;
  if (!monitorId) return;

  const lockKey = `lock:monitor:${monitorId}`;
  const lockToken = crypto.randomUUID();
  const acquired = await acquireLock(lockKey, lockToken, 30000);

  if (!acquired) {
    throw new Error(`Monitor check lock is active for monitor ${monitorId}`);
  }

  try {
    const monitor = await Monitor.findById(monitorId);
    if (!monitor) {
      logger.info({ monitorId }, "Monitor not found or deleted, skipping check");
      return;
    }

    if (!monitor.active) {
      logger.info({ monitorId, runId: job.data.runId }, "Monitor paused, skipping obsolete check");
      if (job.data.runId) {
        const completedAt = new Date();
        await MonitorCheck.findOneAndUpdate(
          { runId: job.data.runId },
          {
            $set: {
              status: "error",
              completedAt,
              failureCategory: "MONITOR_PAUSED",
              errorMessage: "The monitor was paused before this check could run.",
            },
          },
        );
        await publishDomainEvent("monitor.check.failed", {
          userId: String(monitor.userId),
          payload: {
            monitorId: String(monitor._id),
            runId: job.data.runId,
            status: "error",
            failureCategory: "MONITOR_PAUSED",
            timestamp: completedAt.toISOString(),
          },
        });
      }
      return;
    }

    const targetRevision = monitor.configRevision;
    const runId = job.data.runId ?? String(job.id ?? crypto.randomUUID());
    const retentionDays = env.CHECK_RETENTION_DAYS || 30;
    const expiresAt = new Date(Date.now() + retentionDays * 86400 * 1000);

    const checkDoc = await MonitorCheck.findOneAndUpdate(
      { runId },
      {
        $set: { status: "running", startedAt: new Date() },
        $setOnInsert: {
          monitorId: monitor._id,
          userId: monitor.userId,
          runId,
          expiresAt,
        },
      },
      { upsert: true, new: true },
    );

    await Monitor.findOneAndUpdate(
      { _id: monitor._id, configRevision: targetRevision, active: true },
      { $set: { lastCheckStatus: "running", lastCheckId: runId } },
    );

    await publishDomainEvent("monitor.check.started", {
      userId: String(monitor.userId),
      payload: {
        monitorId: String(monitor._id),
        runId,
        status: "running",
        timestamp: new Date().toISOString(),
      },
    });

    const outcome = await executeMonitorHttpCheck({
      url: monitor.url,
      timeoutMs: monitor.timeoutMs,
      expectedStatusCodes: monitor.expectedStatusCodes,
    });

    const terminalStatus: CheckStatus = outcome.success
      ? "success"
      : outcome.failureCategory === "TIMEOUT"
        ? "timeout"
        : "failure";

    const completedAt = new Date();

    await MonitorCheck.findByIdAndUpdate(checkDoc._id, {
      $set: {
        status: terminalStatus,
        completedAt,
        responseDurationMs: outcome.durationMs,
        statusCode: outcome.statusCode,
        failureCategory: outcome.failureCategory,
        errorMessage: outcome.errorMessage,
      },
    });

    const updateFilter: Record<string, unknown> = {
      _id: monitor._id,
      configRevision: targetRevision,
    };
    if (!manual) {
      updateFilter.active = true;
    }

    const updateResult = await Monitor.findOneAndUpdate(updateFilter, {
      $set: {
        lastCheckAt: completedAt,
        lastCheckStatus: terminalStatus,
        lastStatusCode: outcome.statusCode,
        lastResponseDurationMs: outcome.durationMs,
        lastCheckId: runId,
        lastFailureCategory: outcome.failureCategory,
        lastErrorMessage: outcome.errorMessage,
      },
    });

    if (!updateResult) {
      logger.info(
        { monitorId, targetRevision },
        "Monitor modified during check; preserved updated configuration summary",
      );
    }

    await publishDomainEvent(
      terminalStatus === "success" ? "monitor.check.completed" : "monitor.check.failed",
      {
        userId: String(monitor.userId),
        payload: {
          monitorId: String(monitor._id),
          runId,
          status: terminalStatus,
          durationMs: outcome.durationMs,
          statusCode: outcome.statusCode,
          failureCategory: outcome.failureCategory,
          timestamp: completedAt.toISOString(),
        },
      },
    );

    try {
      await evaluateCheckForIncident(String(monitor._id), {
        runId,
        success: outcome.success,
        statusCode: outcome.statusCode,
        failureCategory: outcome.failureCategory,
        errorMessage: outcome.errorMessage,
        completedAt,
      });
    } catch (incidentErr) {
      logger.error(
        { monitorId, err: incidentErr },
        "Error evaluating check for incident management",
      );
    }
  } catch (error) {
    logger.error({ monitorId, err: error }, "Unhandled error during monitor check processing");
    throw error;
  } finally {
    await releaseLock(lockKey, lockToken);
  }
};

let workerInstance: Worker<MonitorCheckJobData> | null = null;

export const createMonitorCheckWorker = (): Worker<MonitorCheckJobData> => {
  if (!workerInstance) {
    const connection = createRedisConnection();
    workerInstance = new Worker<MonitorCheckJobData>(
      env.MONITOR_QUEUE_NAME,
      processMonitorCheckJob,
      {
        connection,
        concurrency: env.WORKER_CONCURRENCY,
      },
    );

    workerInstance.on("error", (err) => {
      logger.error({ err: err.message }, "BullMQ worker error");
    });
    workerInstance.on("failed", (job, err) => {
      if (!job || job.attemptsMade < Number(job.opts.attempts ?? 1)) return;
      void (async () => {
        const monitor = await Monitor.findById(job.data.monitorId);
        const runId = job.data.runId ?? String(job.id ?? "unknown");
        if (!monitor) return;
        const completedAt = new Date();
        const expiresAt = new Date(Date.now() + (env.CHECK_RETENTION_DAYS || 30) * 86400000);
        await MonitorCheck.findOneAndUpdate(
          { runId },
          {
            $set: {
              status: "error",
              completedAt,
              failureCategory: "WORKER_ERROR",
              errorMessage: "The check could not be processed.",
            },
            $setOnInsert: {
              monitorId: monitor._id,
              userId: monitor.userId,
              runId,
              startedAt: completedAt,
              expiresAt,
            },
          },
          { upsert: true },
        );
        await Monitor.findOneAndUpdate(
          { _id: monitor._id, lastCheckId: runId, active: true },
          {
            $set: {
              lastCheckAt: completedAt,
              lastCheckStatus: "error",
              lastFailureCategory: "WORKER_ERROR",
              lastErrorMessage: "The check could not be processed.",
            },
          },
        );
        await publishDomainEvent("monitor.check.failed", {
          userId: String(monitor.userId),
          payload: {
            monitorId: String(monitor._id),
            runId,
            status: "error",
            failureCategory: "WORKER_ERROR",
            timestamp: completedAt.toISOString(),
          },
        });
        logger.error(
          { monitorId: job.data.monitorId, jobId: job.id, error: err.message },
          "Monitor check job exhausted retries",
        );
      })().catch((failure) =>
        logger.error({ jobId: job.id, err: failure }, "Failed to persist terminal worker failure"),
      );
    });
  }
  return workerInstance;
};

export const closeMonitorCheckWorker = async (): Promise<void> => {
  if (workerInstance) {
    await workerInstance.close();
    workerInstance = null;
  }
};
