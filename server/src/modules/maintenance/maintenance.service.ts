import { z } from "zod";
import { isObjectIdOrHexString } from "mongoose";
import { MaintenanceWindow } from "./maintenance.model.js";
import { Monitor } from "../monitors/monitor.model.js";
import { createApiError } from "../../lib/errors/create-api-error.js";
import type { WorkspaceContext } from "../workspaces/workspace.types.js";
const instant = z.iso.datetime({ offset: true });
export const maintenanceSchema = z
  .object({
    title: z.string().trim().min(1).max(100),
    description: z.string().max(1000).default(""),
    monitorIds: z
      .array(z.string().regex(/^[a-f0-9]{24}$/i))
      .max(100)
      .default([]),
    startAt: instant,
    endAt: instant,
    timezone: z
      .string()
      .max(100)
      .refine((v) => {
        try {
          new Intl.DateTimeFormat("en", { timeZone: v });
          return true;
        } catch {
          return false;
        }
      }, "Choose an IANA timezone."),
    recurrence: z.enum(["once", "weekly"]).default("once"),
    enabled: z.boolean().default(true),
    notifyDuring: z.boolean().default(false),
    notifyAfter: z.boolean().default(true),
  })
  .strict()
  .refine(
    (v) =>
      Date.parse(v.endAt) > Date.parse(v.startAt) &&
      Date.parse(v.endAt) - Date.parse(v.startAt) <= 7 * 86400000,
    "Maintenance must last between one second and seven days.",
  );
export type WindowTime = {
  startAt: Date | string;
  endAt: Date | string;
  timezone: string;
  recurrence?: string;
  enabled?: boolean;
};
export const localTime = (date: Date, timezone: string): number => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
};
export const isMaintenanceActive = (window: WindowTime, at = new Date()): boolean => {
  if (window.enabled === false || at.getTime() < new Date(window.startAt).getTime()) return false;
  if (window.recurrence !== "weekly") return at.getTime() < new Date(window.endAt).getTime();
  const start = localTime(new Date(window.startAt), window.timezone),
    end = localTime(new Date(window.endAt), window.timezone),
    now = localTime(at, window.timezone);
  const week = 7 * 86400000;
  const elapsed = (((now - start) % week) + week) % week;
  return elapsed < end - start;
};
export const matchingMaintenance = async (
  workspaceId: string,
  monitorId: string,
  at = new Date(),
) => {
  if (!isObjectIdOrHexString(workspaceId) || !isObjectIdOrHexString(monitorId)) {
    throw createApiError(
      "A valid workspace and monitor are required for maintenance lookups.",
      400,
      "INVALID_REQUEST",
    );
  }
  const windows = await MaintenanceWindow.find({
    workspaceId,
    enabled: true,
    $or: [{ monitorIds: { $size: 0 } }, { monitorIds: monitorId }],
  })
    .limit(500)
    .lean();
  return windows.filter((w) => isMaintenanceActive(w, at));
};
export const listMaintenance = async (ctx: WorkspaceContext) => {
  const windows = await MaintenanceWindow.find({ workspaceId: ctx.workspaceId })
    .sort({ startAt: -1 })
    .limit(500)
    .lean();
  return windows.map((w) => ({
    ...w,
    state: !w.enabled
      ? "disabled"
      : isMaintenanceActive(w)
        ? "active"
        : w.recurrence === "weekly" || w.endAt > new Date()
          ? "upcoming"
          : "completed",
  }));
};
export const saveMaintenance = async (
  ctx: WorkspaceContext,
  input: z.infer<typeof maintenanceSchema>,
  id?: string,
) => {
  const unique = [...new Set(input.monitorIds)];
  const count = await Monitor.countDocuments({
    workspaceId: ctx.workspaceId,
    _id: { $in: unique },
  });
  if (count !== unique.length)
    throw createApiError(
      "One or more monitors are unavailable in this workspace.",
      400,
      "INVALID_MONITOR_CONFIG",
    );
  const data = { ...input, monitorIds: unique, workspaceId: ctx.workspaceId };
  if (!id) {
    if ((await MaintenanceWindow.countDocuments({ workspaceId: ctx.workspaceId })) >= 500)
      throw createApiError("Maintenance limit reached.", 400, "INVALID_REQUEST");
    return MaintenanceWindow.create(data);
  }
  const result = await MaintenanceWindow.findOneAndUpdate(
    { _id: id, workspaceId: ctx.workspaceId },
    { $set: data },
    { new: true, runValidators: true },
  );
  if (!result) throw createApiError("Maintenance window not found.", 404, "MONITOR_NOT_FOUND");
  return result;
};
