import { Types } from "mongoose";
import { logger } from "../../config/logger.js";
import { Monitor } from "./monitor.model.js";
import { publishPublicStatusForMonitor } from "../status-pages/status-page-realtime.service.js";
import { MonitorLifecycleEvent, type LifecycleEventType } from "./monitor-lifecycle.model.js";

type MonitorRef = { _id: unknown; userId: unknown; active: boolean; createdAt?: Date };

export const recordMonitorCreated = async (monitor: MonitorRef): Promise<void> => {
  try {
    const at = monitor.createdAt ?? new Date();
    await MonitorLifecycleEvent.updateOne(
      { monitorId: monitor._id, type: "created" },
      {
        $setOnInsert: {
          monitorId: monitor._id,
          userId: monitor.userId,
          type: "created",
          active: monitor.active,
          at,
        },
      },
      { upsert: true },
    );
  } catch (error) {
    logger.warn(
      { err: error, monitorId: String(monitor._id) },
      "Failed to record monitor creation",
    );
  }
};

export const recordMonitorActiveChange = async (
  monitor: MonitorRef,
  previousActive: boolean,
  at = new Date(),
): Promise<void> => {
  if (monitor.active === previousActive) return;
  try {
    await MonitorLifecycleEvent.create({
      monitorId: monitor._id,
      userId: monitor.userId,
      type: (monitor.active ? "resumed" : "paused") satisfies LifecycleEventType,
      active: monitor.active,
      at,
    });
    void publishPublicStatusForMonitor(String(monitor.userId), String(monitor._id));
  } catch (error) {
    logger.warn(
      { err: error, monitorId: String(monitor._id) },
      "Failed to record lifecycle change",
    );
  }
};

export const deleteMonitorLifecycle = async (monitorId: string): Promise<void> => {
  try {
    await MonitorLifecycleEvent.deleteMany({ monitorId: new Types.ObjectId(monitorId) });
  } catch (error) {
    logger.warn({ err: error, monitorId }, "Failed to delete monitor lifecycle history");
  }
};

export const ensureLifecycleBaselines = async (
  userId?: string,
  now = new Date(),
): Promise<number> => {
  const filter: Record<string, unknown> = userId ? { userId: new Types.ObjectId(userId) } : {};
  const monitors = await Monitor.find(filter).select("_id userId active").lean();
  if (monitors.length === 0) return 0;
  const tracked = await MonitorLifecycleEvent.find({
    monitorId: { $in: monitors.map((monitor) => monitor._id) },
  })
    .select("monitorId")
    .lean();
  const known = new Set(tracked.map((event) => String(event.monitorId)));
  let created = 0;
  for (const monitor of monitors) {
    if (known.has(String(monitor._id))) continue;
    try {
      await MonitorLifecycleEvent.updateOne(
        { monitorId: monitor._id, type: "tracking_started" },
        {
          $setOnInsert: {
            monitorId: monitor._id,
            userId: monitor.userId,
            type: "tracking_started",
            active: monitor.active,
            at: now,
          },
        },
        { upsert: true },
      );
      created += 1;
    } catch (error) {
      logger.warn({ err: error, monitorId: String(monitor._id) }, "Lifecycle baseline failed");
    }
  }
  return created;
};
