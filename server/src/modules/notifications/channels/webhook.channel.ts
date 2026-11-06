import crypto from "node:crypto";
import { env } from "../../../config/env.js";
import { sendJsonSecurely, type SecureClientDeps } from "../secure-http.service.js";
import type {
  ChannelResult,
  DeliveryEventType,
  IncidentNotificationSnapshot,
} from "../notification.types.js";

export const webhookPayloadVersion = 1;

export const buildWebhookPayload = (input: {
  eventId: string;
  eventType: DeliveryEventType;
  createdAt: string;
  snapshot: IncidentNotificationSnapshot | null;
}): Record<string, unknown> => {
  const { snapshot } = input;
  return {
    id: input.eventId,
    type: input.eventType,
    version: webhookPayloadVersion,
    createdAt: input.createdAt,
    data: snapshot
      ? {
          incidentId: snapshot.incidentId,
          monitorId: snapshot.monitorId,
          monitorName: snapshot.monitorName,
          title: snapshot.title,
          status: snapshot.status,
          openedAt: snapshot.openedAt,
          firstFailureAt: snapshot.firstFailureAt,
          acknowledgedAt: snapshot.acknowledgedAt,
          resolvedAt: snapshot.resolvedAt,
          resolutionType: snapshot.resolutionType,
          durationMs: snapshot.durationMs,
          failureCategory: snapshot.failureCategory,
          statusCode: snapshot.statusCode,
          failureThreshold: snapshot.failureThreshold,
          incidentUrl: snapshot.incidentUrl,
        }
      : { message: "FaultLine webhook test notification" },
  };
};

export const signWebhookBody = (secret: string, timestamp: string, body: string): string =>
  `v1=${crypto.createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;

export const verifyWebhookSignature = (
  secret: string,
  timestamp: string,
  body: string,
  signature: string,
): boolean => {
  const expected = Buffer.from(signWebhookBody(secret, timestamp, body));
  const received = Buffer.from(signature);
  return expected.length === received.length && crypto.timingSafeEqual(expected, received);
};

export const sendWebhookNotification = async (
  input: {
    url: string;
    signingSecret: string;
    deliveryId: string;
    eventId: string;
    eventType: DeliveryEventType;
    createdAt: string;
    snapshot: IncidentNotificationSnapshot | null;
  },
  deps?: SecureClientDeps & { now?: () => number },
): Promise<ChannelResult> => {
  const body = JSON.stringify(
    buildWebhookPayload({
      eventId: input.eventId,
      eventType: input.eventType,
      createdAt: input.createdAt,
      snapshot: input.snapshot,
    }),
  );
  const timestamp = String(Math.floor((deps?.now?.() ?? Date.now()) / 1000));
  return sendJsonSecurely(
    {
      url: input.url,
      body,
      headers: {
        "X-FaultLine-Event": input.eventType,
        "X-FaultLine-Delivery": input.deliveryId,
        "X-FaultLine-Timestamp": timestamp,
        "X-FaultLine-Signature": signWebhookBody(input.signingSecret, timestamp, body),
      },
      timeoutMs: env.NOTIFICATION_DELIVERY_TIMEOUT_MS,
    },
    deps,
  );
};
