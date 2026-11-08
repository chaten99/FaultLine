import { Types } from "mongoose";
import { Monitor } from "./monitor.model.js";
import { MonitorCheck } from "../checks/monitor-check.model.js";
import { createApiError } from "../../lib/errors/create-api-error.js";
import { validateMonitorUrl } from "./monitor-url.service.js";
import {
  enqueueImmediateCheck,
  scheduleMonitor,
  unscheduleMonitor,
} from "../../queues/monitor-scheduler.service.js";
import { acquireLock } from "../../lib/redis/redis.service.js";
import { logger } from "../../config/logger.js";
import crypto from "node:crypto";
import { env } from "../../config/env.js";
import { publishDomainEvent } from "../../lib/redis/redis.service.js";
import {
  deleteMonitorLifecycle,
  recordMonitorActiveChange,
  recordMonitorCreated,
} from "./monitor-lifecycle.service.js";

const ensureOwned = async (userId: string, monitorId: string) => {
  if (!Types.ObjectId.isValid(monitorId) || !/^[a-f\d]{24}$/i.test(monitorId)) {
    throw createApiError("Monitor not found.", 404, "MONITOR_NOT_FOUND");
  }
  const monitor = await Monitor.findOne({ _id: monitorId, userId });
  if (!monitor) throw createApiError("Monitor not found.", 404, "MONITOR_NOT_FOUND");
  return monitor;
};

const validateUrlIfPresent = async (url: string | undefined) => {
  if (url) await validateMonitorUrl(url);
};

export const listMonitors = async (
  userId: string,
  page: number,
  pageSize: number,
  search?: string,
  status?: "all" | "active" | "paused",
  sortBy: "createdAt" | "name" | "intervalSeconds" | "url" = "createdAt",
  sortOrder: "asc" | "desc" = "desc",
) => {
  const filter: Record<string, unknown> = { userId };
  if (status === "active") {
    filter.active = true;
  } else if (status === "paused") {
    filter.active = false;
  }
  if (search && search.trim().length > 0) {
    const escaped = search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    filter.$or = [
      { name: { $regex: escaped, $options: "i" } },
      { url: { $regex: escaped, $options: "i" } },
    ];
  }
  const sortDirection = sortOrder === "asc" ? 1 : -1;
  const sortObj: Record<string, 1 | -1> = { [sortBy]: sortDirection };
  if (sortBy !== "createdAt") {
    sortObj.createdAt = -1;
  }
  const [items, total, activeCount, pausedCount] = await Promise.all([
    Monitor.find(filter)
      .sort(sortObj)
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean(),
    Monitor.countDocuments(filter),
    Monitor.countDocuments({ userId, active: true }),
    Monitor.countDocuments({ userId, active: false }),
  ]);
  return {
    items,
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize) || 1,
    counts: {
      total: activeCount + pausedCount,
      active: activeCount,
      paused: pausedCount,
    },
  };
};

export const createMonitor = async (
  userId: string,
  input: { url: string; [key: string]: unknown },
) => {
  await validateMonitorUrl(input.url);
  const allowedFields = [
    "name",
    "url",
    "method",
    "intervalSeconds",
    "timeoutMs",
    "expectedStatusCodes",
    "active",
    "failureThreshold",
    "recoveryThreshold",
  ];
  const sanitized: Record<string, unknown> = {};
  for (const field of allowedFields) {
    if (field in input && input[field] !== undefined) {
      sanitized[field] = input[field];
    }
  }
  const monitor = await Monitor.create({ ...sanitized, userId });
  await recordMonitorCreated(monitor);

  if (monitor.active) {
    try {
      await scheduleMonitor(monitor);
      await enqueueImmediateCheck(String(monitor._id));
    } catch (error) {
      logger.warn(
        { monitorId: monitor._id, err: error },
        "Failed to schedule check on create; will be repaired by reconciliation",
      );
    }
  }

  return monitor;
};

export const getMonitor = (userId: string, monitorId: string) => ensureOwned(userId, monitorId);

export const updateMonitor = async (
  userId: string,
  monitorId: string,
  input: { url?: string; version?: number; [key: string]: unknown },
) => {
  const previous = await ensureOwned(userId, monitorId);
  await validateUrlIfPresent(input.url);

  const allowedFields = [
    "name",
    "url",
    "method",
    "intervalSeconds",
    "timeoutMs",
    "expectedStatusCodes",
    "active",
    "failureThreshold",
    "recoveryThreshold",
  ];
  const updateData: Record<string, unknown> = {};
  for (const field of allowedFields) {
    if (field in input && input[field] !== undefined) {
      updateData[field] = input[field];
    }
  }

  const query: Record<string, unknown> = { _id: monitorId, userId };
  if (typeof input.version === "number") {
    query.__v = input.version;
  }

  const monitor = await Monitor.findOneAndUpdate(
    query,
    { $set: updateData, $inc: { __v: 1, configRevision: 1 } },
    { new: true, runValidators: true },
  );

  if (!monitor) {
    if (typeof input.version === "number") {
      throw createApiError(
        "This monitor was modified concurrently. Please refresh and try again.",
        409,
        "CONCURRENT_UPDATE_CONFLICT",
      );
    }
    throw createApiError("Monitor not found.", 404, "MONITOR_NOT_FOUND");
  }

  await recordMonitorActiveChange(monitor, previous.active);

  try {
    if (monitor.active) {
      await scheduleMonitor(monitor);
      if (!previous.active) {
        await enqueueImmediateCheck(String(monitor._id));
      }
    } else if (previous.active) {
      await unscheduleMonitor(String(monitor._id));
    }
  } catch (error) {
    logger.warn(
      { monitorId: monitor._id, err: error },
      "Failed to update scheduler on monitor update; will be repaired by reconciliation",
    );
  }

  return monitor;
};

export const deleteMonitor = async (userId: string, monitorId: string) => {
  await ensureOwned(userId, monitorId);
  const result = await Monitor.deleteOne({ _id: monitorId, userId });
  if (!result.deletedCount) throw createApiError("Monitor not found.", 404, "MONITOR_NOT_FOUND");

  try {
    await unscheduleMonitor(monitorId);
    await MonitorCheck.deleteMany({ monitorId, userId });
    await deleteMonitorLifecycle(monitorId);
  } catch (error) {
    logger.warn({ monitorId, err: error }, "Error cleaning up scheduler or checks after deletion");
  }
};

export const triggerManualCheck = async (userId: string, monitorId: string) => {
  const monitor = await ensureOwned(userId, monitorId);
  if (!monitor.active) {
    throw createApiError(
      "Cannot run manual check on a paused monitor. Resume the monitor first.",
      400,
      "INVALID_REQUEST",
    );
  }

  const cooldownKey = `cooldown:check-now:${monitorId}`;
  let allowed = true;
  try {
    allowed = await acquireLock(cooldownKey, "1", 5000);
  } catch {
    allowed = true;
  }

  if (!allowed) {
    throw createApiError(
      "Please wait a few seconds before triggering another manual check.",
      429,
      "RATE_LIMITED",
    );
  }

  const runId = crypto.randomUUID();
  try {
    await MonitorCheck.create({
      monitorId: monitor._id,
      userId: monitor.userId,
      runId,
      status: "queued",
      startedAt: new Date(),
      expiresAt: new Date(Date.now() + (env.CHECK_RETENTION_DAYS || 30) * 86400000),
    });
    await enqueueImmediateCheck(monitorId, true, runId);
    await Monitor.findByIdAndUpdate(monitorId, {
      $set: { lastCheckStatus: "queued", lastCheckId: runId },
    });
    await publishDomainEvent("monitor.check.queued", {
      userId,
      payload: { monitorId, runId, status: "queued", timestamp: new Date().toISOString() },
    });

    return {
      status: "queued",
      runId,
      message: "Check queued successfully.",
    };
  } catch (error) {
    await MonitorCheck.deleteOne({ monitorId, runId, status: "queued" }).catch(() => undefined);
    logger.error({ monitorId, err: error }, "Failed to queue manual check");
    throw createApiError(
      "Unable to queue check. Please verify Redis is running.",
      503,
      "INTERNAL_ERROR",
    );
  }
};

export const listMonitorChecks = async (
  userId: string,
  monitorId: string,
  page = 1,
  pageSize = 20,
  status?: string,
) => {
  await ensureOwned(userId, monitorId);

  const filter: Record<string, unknown> = { monitorId, userId };
  if (status) {
    filter.status = status;
  }

  const [items, total] = await Promise.all([
    MonitorCheck.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean(),
    MonitorCheck.countDocuments(filter),
  ]);

  return {
    items,
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize) || 1,
  };
};

export const getMonitorCheck = async (userId: string, monitorId: string, checkId: string) => {
  await ensureOwned(userId, monitorId);
  const query = Types.ObjectId.isValid(checkId)
    ? { $or: [{ _id: checkId }, { runId: checkId }], monitorId, userId }
    : { runId: checkId, monitorId, userId };

  const check = await MonitorCheck.findOne(query).lean();
  if (!check) {
    throw createApiError("Check not found.", 404, "CHECK_NOT_FOUND");
  }
  return check;
};
