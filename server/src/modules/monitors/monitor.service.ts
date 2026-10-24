import { Types } from "mongoose";
import { Monitor } from "./monitor.model.js";
import { createApiError } from "../../lib/errors/create-api-error.js";
import { validateMonitorUrl } from "./monitor-url.service.js";

const ensureOwned = async (userId: string, monitorId: string) => {
  if (!Types.ObjectId.isValid(monitorId))
    throw createApiError("Monitor not found.", 404, "MONITOR_NOT_FOUND");
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
  const [items, total, activeCount, pausedCount] = await Promise.all([
    Monitor.find(filter)
      .sort({ createdAt: -1 })
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
  return Monitor.create({ ...input, userId });
};

export const getMonitor = (userId: string, monitorId: string) => ensureOwned(userId, monitorId);

export const updateMonitor = async (
  userId: string,
  monitorId: string,
  input: { url?: string; [key: string]: unknown },
) => {
  await ensureOwned(userId, monitorId);
  await validateUrlIfPresent(input.url);
  const monitor = await Monitor.findOneAndUpdate(
    { _id: monitorId, userId },
    { $set: input },
    { new: true, runValidators: true },
  );
  if (!monitor) throw createApiError("Monitor not found.", 404, "MONITOR_NOT_FOUND");
  return monitor;
};

export const deleteMonitor = async (userId: string, monitorId: string) => {
  const result = await Monitor.deleteOne({ _id: monitorId, userId });
  if (!result.deletedCount) throw createApiError("Monitor not found.", 404, "MONITOR_NOT_FOUND");
};
