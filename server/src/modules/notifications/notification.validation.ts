import { z } from "zod";
import {
  channelTypes,
  deliveryStatuses,
  incidentEventTypes,
  testEventType,
} from "./notification.types.js";

const objectId = (label: string) => z.string().regex(/^[a-f\d]{24}$/i, `Invalid ${label} id.`);

const eventsSchema = z
  .array(z.enum(incidentEventTypes))
  .min(1, "Select at least one event.")
  .max(incidentEventTypes.length)
  .transform((events) => [...new Set(events)]);

const nameSchema = z
  .string()
  .trim()
  .min(1, "Enter a name for this integration.")
  .max(80, "Name must be 80 characters or fewer.");

export const idParamSchema = z.object({ id: objectId("resource") });

export const updatePreferencesSchema = z
  .object({
    enabled: z.boolean().optional(),
    channels: z
      .object({
        email: z.boolean().optional(),
        slack: z.boolean().optional(),
        webhook: z.boolean().optional(),
      })
      .strict()
      .optional(),
    events: z
      .object({
        opened: z.boolean().optional(),
        acknowledged: z.boolean().optional(),
        resolved: z.boolean().optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.enabled !== undefined ||
      Object.values(value.channels ?? {}).some((entry) => entry !== undefined) ||
      Object.values(value.events ?? {}).some((entry) => entry !== undefined),
    { message: "Provide at least one preference to update." },
  );

export const createSlackIntegrationSchema = z
  .object({
    name: nameSchema,
    webhookUrl: z.string().trim().min(1, "Enter the Slack webhook URL.").max(300),
    enabled: z.boolean().default(true),
    events: eventsSchema.default(["incident.opened", "incident.resolved"]),
  })
  .strict();

export const createWebhookIntegrationSchema = z
  .object({
    name: nameSchema,
    url: z.string().trim().min(1, "Enter the endpoint URL.").max(2048),
    enabled: z.boolean().default(true),
    events: eventsSchema.default(["incident.opened", "incident.resolved"]),
  })
  .strict();

export const updateIntegrationSchema = z
  .object({
    name: nameSchema.optional(),
    enabled: z.boolean().optional(),
    events: eventsSchema.optional(),
    webhookUrl: z.string().trim().min(1).max(300).optional(),
    url: z.string().trim().min(1).max(2048).optional(),
  })
  .strict()
  .refine((value) => Object.values(value).some((entry) => entry !== undefined), {
    message: "Provide at least one field to update.",
  });

const dateFilter = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), "Enter a valid date.")
  .transform((value) => new Date(value));

export const listDeliveriesSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
  status: z.enum(deliveryStatuses).optional(),
  channel: z.enum(channelTypes).optional(),
  eventType: z.enum([...incidentEventTypes, testEventType]).optional(),
  from: dateFilter.optional(),
  to: dateFilter.optional(),
});
