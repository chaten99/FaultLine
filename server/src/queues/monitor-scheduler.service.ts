import { isObjectIdOrHexString } from "mongoose";
import { getMonitorCheckQueue } from "./monitor-check.queue.js";
import { Monitor } from "../modules/monitors/monitor.model.js";
import { logger } from "../config/logger.js";
import crypto from "node:crypto";

export const getSchedulerId = (monitorId: string): string => `monitor:${monitorId}`;

export const scheduleMonitor = async (monitor: {
  _id: unknown;
  intervalSeconds: number;
  workspaceId: unknown;
}): Promise<void> => {
  if (!isObjectIdOrHexString(monitor.workspaceId)) {
    await unscheduleMonitor(String(monitor._id));
    return;
  }
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
      jobId: manual ? `manual-${runId}` : `init-${monitorId}-${Date.now()}`,
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

    const scopedMonitors = activeMonitors.filter((monitor) =>
      isObjectIdOrHexString(monitor.workspaceId),
    );
    const activeMap = new Map(scopedMonitors.map((m) => [String(m._id), m]));
    const schedulerMonitorIds = new Set<string>();

    for (const scheduler of existingSchedulers) {
      const schedulerId = scheduler.key ?? scheduler.id;
      if (schedulerId && schedulerId.startsWith("monitor:")) {
        const monitorId = schedulerId.slice("monitor:".length);
        schedulerMonitorIds.add(monitorId);
        const activeMonitor = activeMap.get(monitorId);
        if (!activeMonitor) {
          await queue.removeJobScheduler(schedulerId);
          logger.info({ monitorId, schedulerId }, "Removed stale scheduler");
        } else if (
          typeof scheduler.every === "number" &&
          scheduler.every !== activeMonitor.intervalSeconds * 1000
        ) {
          await scheduleMonitor(activeMonitor);
          logger.info({ monitorId }, "Updated scheduler with new interval");
        }
      }
    }

    for (const monitor of scopedMonitors) {
      const monitorId = String(monitor._id);
      if (!schedulerMonitorIds.has(monitorId)) {
        await scheduleMonitor(monitor);
        logger.info({ monitorId }, "Created missing scheduler for active monitor");
      }
    }

    logger.info(
      {
        activeCount: scopedMonitors.length,
        unscopedCount: activeMonitors.length - scopedMonitors.length,
        totalSchedulers: existingSchedulers.length,
      },
      "Scheduler reconciliation completed",
    );
  } catch (error) {
    logger.error({ err: error }, "Error during scheduler reconciliation");
  }
};
