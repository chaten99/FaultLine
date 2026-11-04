import { z } from "zod";

export const incidentIdSchema = z.object({
  id: z.string().regex(/^[a-f\d]{24}$/i, "Invalid incident id."),
});

export const listIncidentsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  status: z.enum(["all", "open", "acknowledged", "resolved"]).default("all"),
  monitorId: z
    .string()
    .regex(/^[a-f\d]{24}$/i, "Invalid monitor id.")
    .optional(),
  sortBy: z.enum(["createdAt", "openedAt", "resolvedAt"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export const resolveIncidentSchema = z.object({
  reason: z.string().trim().max(1000).optional(),
});
