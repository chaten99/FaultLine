import { z } from "zod";
import { monitorIntervals } from "./monitor.model.js";

const url = z.string().trim().min(1).max(2048);
const statusCodes = z.array(z.number().int().min(100).max(599)).min(1).max(20);

export const createMonitorSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    url,
    method: z.literal("GET").default("GET"),
    intervalSeconds: z
      .number()
      .int()
      .refine((value) => monitorIntervals.includes(value as (typeof monitorIntervals)[number])),
    timeoutMs: z.number().int().min(1000).max(30000),
    expectedStatusCodes: statusCodes,
    active: z.boolean().default(true),
  })
  .strict();

export const updateMonitorSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    url: url.optional(),
    method: z.literal("GET").optional(),
    intervalSeconds: z
      .number()
      .int()
      .refine((value) => monitorIntervals.includes(value as (typeof monitorIntervals)[number]))
      .optional(),
    timeoutMs: z.number().int().min(1000).max(30000).optional(),
    expectedStatusCodes: statusCodes.optional(),
    active: z.boolean().optional(),
    version: z.number().int().nonnegative().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "At least one monitor field is required.");

export const monitorIdSchema = z.object({
  id: z.string().regex(/^[a-f\d]{24}$/i, "Invalid monitor id."),
});

export const listMonitorSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  search: z.string().trim().optional(),
  status: z.enum(["all", "active", "paused"]).optional(),
  sortBy: z.enum(["createdAt", "name", "intervalSeconds", "url"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});
