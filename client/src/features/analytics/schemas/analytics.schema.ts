import { z } from "zod";
import { validateRange } from "../lib/analytics-range";

export const exportTypeSchema = z.enum(["overview", "monitors", "incidents"]);

export const exportFormSchema = z.object({
  type: exportTypeSchema,
  monitorId: z.union([z.literal("all"), z.string().regex(/^[a-f\d]{24}$/i)]),
});

export type ExportFormValues = z.infer<typeof exportFormSchema>;

export const customRangeSchema = z
  .object({ from: z.date(), to: z.date() })
  .superRefine((value, context) => {
    const result = validateRange(value.from, value.to, Date.now());
    if (!result.valid) context.addIssue({ code: "custom", message: result.message, path: ["to"] });
  });

export const monitorFiltersSchema = z.object({
  status: z.enum(["all", "active", "paused"]),
  quality: z.enum(["all", "complete", "partial", "insufficient"]),
  search: z.string().trim().max(100),
});
