import { z } from "zod";

const dateParam = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), "Enter a valid date and time.")
  .transform((value) => new Date(value));

const monitorIdParam = z.string().regex(/^[a-f\d]{24}$/i, "Invalid monitor id.");

export const rangeQuerySchema = z.object({
  range: z.enum(["24h", "7d", "30d", "90d"]).optional(),
  from: dateParam.optional(),
  to: dateParam.optional(),
  monitorId: monitorIdParam.optional(),
});

export const monitorTableQuerySchema = rangeQuerySchema.extend({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
  sortBy: z
    .enum([
      "name",
      "availability",
      "successRate",
      "coverage",
      "downtime",
      "avgResponse",
      "incidents",
      "lastCheck",
    ])
    .default("name"),
  sortOrder: z.enum(["asc", "desc"]).default("asc"),
  status: z.enum(["all", "active", "paused"]).default("all"),
  search: z.string().trim().max(100).optional(),
  quality: z.enum(["all", "complete", "partial", "insufficient"]).default("all"),
});

export const exportQuerySchema = rangeQuerySchema.extend({
  type: z.enum(["overview", "monitors", "incidents"]),
});

export const monitorParamSchema = z.object({ monitorId: monitorIdParam });
