import { z } from "zod";
import { incidentEventTypes } from "../lib/notification-presentation";

export const slackWebhookPattern =
  /^https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+$/;

const nameField = z
  .string()
  .trim()
  .min(1, "Enter a name for this integration")
  .max(60, "Name cannot exceed 60 characters");

const eventsField = z.array(z.enum(incidentEventTypes)).min(1, "Select at least one event");

const slackUrlField = z
  .string()
  .trim()
  .min(1, "Enter the Slack incoming webhook URL")
  .max(512, "Webhook URL is too long")
  .regex(slackWebhookPattern, "Enter a valid Slack URL: https://hooks.slack.com/services/...");

const webhookUrlField = z
  .string()
  .trim()
  .min(1, "Enter the endpoint URL")
  .max(2048, "Endpoint URL is too long")
  .refine((value) => {
    try {
      const parsed = new URL(value);
      return parsed.protocol === "https:" && !parsed.username && !parsed.password;
    } catch {
      return false;
    }
  }, "Enter a valid HTTPS URL without credentials");

export const slackIntegrationSchema = z.object({
  name: nameField,
  webhookUrl: slackUrlField,
  events: eventsField,
});

export const webhookIntegrationSchema = z.object({
  name: nameField,
  url: webhookUrlField,
  events: eventsField,
});

export const editIntegrationSchema = z.object({
  name: nameField,
  events: eventsField,
});

export const replaceSlackUrlSchema = z.object({ webhookUrl: slackUrlField });
export const replaceWebhookUrlSchema = z.object({ url: webhookUrlField });

export type SlackIntegrationForm = z.infer<typeof slackIntegrationSchema>;
export type WebhookIntegrationForm = z.infer<typeof webhookIntegrationSchema>;
export type EditIntegrationForm = z.infer<typeof editIntegrationSchema>;
export type ReplaceSlackUrlForm = z.infer<typeof replaceSlackUrlSchema>;
export type ReplaceWebhookUrlForm = z.infer<typeof replaceWebhookUrlSchema>;
