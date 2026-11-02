import { getMonitorCheckQueue } from "./monitor-check.queue.js";
import { Monitor } from "../modules/monitors/monitor.model.js";
import { logger } from "../config/logger.js";
import crypto from "node:crypto";

export const getSchedulerId = (monitorId: string): string => `monitor:${monitorId}`;

export const scheduleMonitor = async (monitor: {
  _id: unknown;
  intervalSeconds: number;
}): Promise<void> => {
  const queue = getMonitorCheckQueue();
  const monitorId = String(monitor._id);
  const schedulerId = getSchedulerId(monitorId);

  try {
    await queue.upsertJobScheduler(
      schedulerId,
      { every: monitor.intervalSeconds * 1000 },
      {
        name: "execute-monitor-check",
        data: {
          monitorId,
          scheduled: true,
          queuedAt: new Date().toISOString(),
        },
      },
    );
  } catch (error) {
    logger.warn(
      { schedulerId, err: error },
      "Failed to upsert job scheduler; will be repaired by reconciliation",
    );
  }
};

export const unscheduleMonitor = async (monitorId: string): Promise<void> => {
  const queue = getMonitorCheckQueue();
  const schedulerId = getSchedulerId(monitorId);
  try {
    await queue.removeJobScheduler(schedulerId);
  } catch (error) {
    logger.warn({ schedulerId, err: error }, "Failed to remove job scheduler");
  }
};

export const enqueueImmediateCheck = async (
  monitorId: string,
  manual = false,
  runId = crypto.randomUUID(),
): Promise<string> => {
  const queue = getMonitorCheckQueue();
  const job = await queue.add(
    manual ? "manual-monitor-check" : "initial-monitor-check",
    {
      monitorId,
      runId,
      manual,
      queuedAt: new Date().toISOString(),
    },
    {
      jobId: manual ? `manual:${runId}` : `init:${monitorId}:${Date.now()}`,
    },
  );
  return job.id ?? runId;
};

export const reconcileSchedulers = async (): Promise<void> => {
  try {
    const queue = getMonitorCheckQueue();
    const [activeMonitors, existingSchedulers] = await Promise.all([
      Monitor.find({ active: true }).lean(),
      queue.getJobSchedulers(),
    ]);

    const activeMap = new Map(activeMonitors.map((m) => [String(m._id), m]));
    const schedulerMonitorIds = new Set<string>();

    for (const scheduler of existingSchedulers) {
      if (scheduler.id && scheduler.id.startsWith("monitor:")) {
        const monitorId = scheduler.id.slice("monitor:".length);
        schedulerMonitorIds.add(monitorId);
        const activeMonitor = activeMap.get(monitorId);
        if (!activeMonitor) {
          await queue.removeJobScheduler(scheduler.id);
          logger.info({ monitorId, schedulerId: scheduler.id }, "Removed stale scheduler");
        } else if (
          typeof scheduler.every === "number" &&
          scheduler.every !== activeMonitor.intervalSeconds * 1000
        ) {
          await scheduleMonitor(activeMonitor);
          logger.info({ monitorId }, "Updated scheduler with new interval");
        }
      }
    }

    for (const monitor of activeMonitors) {
      const monitorId = String(monitor._id);
      if (!schedulerMonitorIds.has(monitorId)) {
        await scheduleMonitor(monitor);
        logger.info({ monitorId }, "Created missing scheduler for active monitor");
      }
    }

    logger.info(
      { activeCount: activeMonitors.length, totalSchedulers: existingSchedulers.length },
      "Scheduler reconciliation completed",
    );
  } catch (error) {
    logger.error({ err: error }, "Error during scheduler reconciliation");
  }
};
