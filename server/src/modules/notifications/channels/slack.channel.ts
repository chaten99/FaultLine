import { env } from "../../../config/env.js";
import {
  describeTrigger,
  escapeSlackText,
  formatDuration,
  formatUtcTimestamp,
} from "../notification-format.js";
import { sendJsonSecurely, type SecureClientDeps } from "../secure-http.service.js";
import type {
  ChannelResult,
  DeliveryEventType,
  IncidentNotificationSnapshot,
} from "../notification.types.js";

export const slackWebhookHost = "hooks.slack.com";
const slackPathPattern = /^\/services\/[A-Z0-9]+\/[A-Z0-9]+\/[A-Za-z0-9]+$/;

export const isValidSlackWebhookUrl = (value: string): boolean => {
  try {
    const parsed = new URL(value);
    return (
      parsed.protocol === "https:" &&
      parsed.hostname === slackWebhookHost &&
      !parsed.port &&
      !parsed.username &&
      !parsed.password &&
      !parsed.search &&
      !parsed.hash &&
      slackPathPattern.test(parsed.pathname)
    );
  } catch {
    return false;
  }
};

type Field = { type: "plain_text"; text: string };

const field = (label: string, value: string): { type: "mrkdwn"; text: string } => ({
  type: "mrkdwn",
  text: `*${label}*\n${escapeSlackText(value)}`,
});

const plain = (text: string): Field => ({ type: "plain_text", text: text.slice(0, 150) });

export const buildSlackPayload = (
  eventType: DeliveryEventType,
  snapshot: IncidentNotificationSnapshot | null,
): Record<string, unknown> => {
  if (eventType === "notification.test" || !snapshot) {
    return {
      text: "FaultLine test notification: Slack alerts are working.",
      blocks: [
        { type: "header", text: plain("FaultLine test notification") },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "This is a test message from FaultLine. No incident was created and no monitor was affected.",
          },
        },
      ],
    };
  }

  const link = snapshot.incidentUrl
    ? [
        {
          type: "actions",
          elements: [
            {
              type: "button",
              text: { type: "plain_text", text: "View incident" },
              url: snapshot.incidentUrl,
            },
          ],
        },
      ]
    : [];

  if (eventType === "incident.opened") {
    return {
      text: `Incident detected: ${escapeSlackText(snapshot.monitorName)} - ${describeTrigger(snapshot)}`,
      blocks: [
        { type: "header", text: plain(`Incident detected: ${snapshot.monitorName}`) },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `FaultLine detected repeated failures. ${snapshot.failureThreshold} consecutive checks failed.`,
          },
        },
        {
          type: "section",
          fields: [
            field("Monitor", snapshot.monitorName),
            field("Status", "Open"),
            field("Incident", snapshot.title),
            field("First failure", formatUtcTimestamp(snapshot.firstFailureAt)),
            field("Failure", describeTrigger(snapshot)),
          ],
        },
        ...link,
      ],
    };
  }

  if (eventType === "incident.acknowledged") {
    const by = snapshot.acknowledgedByName ?? "A team member";
    return {
      text: `Incident acknowledged: ${escapeSlackText(snapshot.monitorName)} by ${escapeSlackText(by)}`,
      blocks: [
        { type: "header", text: plain(`Incident acknowledged: ${snapshot.monitorName}`) },
        {
          type: "section",
          fields: [
            field("Incident", snapshot.title),
            field("Acknowledged by", by),
            field("Time", formatUtcTimestamp(snapshot.acknowledgedAt)),
            field("Status", "Acknowledged"),
          ],
        },
        ...link,
      ],
    };
  }

  return {
    text: `Service recovered: ${escapeSlackText(snapshot.monitorName)} after ${formatDuration(snapshot.durationMs)}`,
    blocks: [
      { type: "header", text: plain(`Service recovered: ${snapshot.monitorName}`) },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text:
            snapshot.resolutionType === "manual"
              ? "The incident was manually marked as resolved."
              : "FaultLine confirmed the service has recovered.",
        },
      },
      {
        type: "section",
        fields: [
          field("Monitor", snapshot.monitorName),
          field("Status", "Resolved"),
          field("Duration", formatDuration(snapshot.durationMs)),
          field("Recovered at", formatUtcTimestamp(snapshot.resolvedAt)),
        ],
      },
      ...link,
    ],
  };
};

export const sendSlackNotification = async (
  webhookUrl: string,
  eventType: DeliveryEventType,
  snapshot: IncidentNotificationSnapshot | null,
  deps?: SecureClientDeps,
): Promise<ChannelResult> => {
  if (!isValidSlackWebhookUrl(webhookUrl)) {
    return {
      ok: false,
      category: "INVALID_CREDENTIALS",
      transient: false,
      responseCode: null,
      retryAfterMs: null,
      durationMs: 0,
    };
  }
  return sendJsonSecurely(
    {
      url: webhookUrl,
      body: JSON.stringify(buildSlackPayload(eventType, snapshot)),
      headers: {},
      timeoutMs: env.NOTIFICATION_DELIVERY_TIMEOUT_MS,
    },
    deps,
  );
};
