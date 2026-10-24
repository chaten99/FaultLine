import { Types } from "mongoose";
import { Monitor } from "./monitor.model.js";
import { createApiError } from "../../lib/errors/create-api-error.js";
import { validateMonitorUrl } from "./monitor-url.service.js";

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
  ];
  const sanitized: Record<string, unknown> = {};
  for (const field of allowedFields) {
    if (field in input && input[field] !== undefined) {
      sanitized[field] = input[field];
    }
  }
  return Monitor.create({ ...sanitized, userId });
};

export const getMonitor = (userId: string, monitorId: string) => ensureOwned(userId, monitorId);

export const updateMonitor = async (
  userId: string,
  monitorId: string,
  input: { url?: string; version?: number; [key: string]: unknown },
) => {
  await ensureOwned(userId, monitorId);
  await validateUrlIfPresent(input.url);

  const allowedFields = [
    "name",
    "url",
    "method",
    "intervalSeconds",
    "timeoutMs",
    "expectedStatusCodes",
    "active",
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
    { $set: updateData, $inc: { __v: 1 } },
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
  return monitor;
};

export const deleteMonitor = async (userId: string, monitorId: string) => {
  await ensureOwned(userId, monitorId);
  const result = await Monitor.deleteOne({ _id: monitorId, userId });
  if (!result.deletedCount) throw createApiError("Monitor not found.", 404, "MONITOR_NOT_FOUND");
};
