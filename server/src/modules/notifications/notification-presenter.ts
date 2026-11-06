import { env } from "../../config/env.js";
import type { INotificationDelivery } from "./notification-delivery.model.js";

const iso = (value: Date | undefined | null): string | null =>
  value ? new Date(value).toISOString() : null;

export const toDeliverySummary = (delivery: INotificationDelivery) => ({
  id: String(delivery._id),
  kind: delivery.kind,
  eventType: delivery.eventType,
  channel: delivery.channel,
  integrationId: delivery.integrationId ? String(delivery.integrationId) : null,
  integrationName: delivery.integrationName ?? null,
  incidentId: delivery.incidentId ? String(delivery.incidentId) : null,
  incidentTitle: delivery.incidentTitle ?? null,
  monitorName: delivery.monitorName ?? null,
  status: delivery.status,
  attempts: delivery.attempts,
  maxAttempts: delivery.kind === "test" ? 1 : env.NOTIFICATION_MAX_ATTEMPTS,
  lastAttemptAt: iso(delivery.lastAttemptAt),
  deliveredAt: iso(delivery.deliveredAt),
  nextRetryAt: iso(delivery.nextRetryAt),
  responseCode: delivery.responseCode ?? null,
  failureCategory: delivery.failureCategory ?? null,
  message: delivery.message ?? null,
  retryable: delivery.status === "failed" && delivery.kind === "incident",
  createdAt: iso(delivery.createdAt) ?? new Date(0).toISOString(),
});

export const toDeliveryDetail = (delivery: INotificationDelivery) => ({
  ...toDeliverySummary(delivery),
  attemptHistory: (delivery.attemptHistory ?? []).map((entry) => ({
    attempt: entry.attempt,
    at: new Date(entry.at).toISOString(),
    outcome: entry.outcome,
    responseCode: entry.responseCode ?? null,
    failureCategory: entry.failureCategory ?? null,
    durationMs: entry.durationMs ?? null,
    willRetry: entry.willRetry,
  })),
});
