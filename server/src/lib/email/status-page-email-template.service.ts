import path from "node:path";
import { fileURLToPath } from "node:url";
import ejs from "ejs";
import {
  formatDuration,
  formatUtcTimestamp,
  sanitizeSubjectText,
} from "../../modules/notifications/notification-format.js";
import type { SubscriberEmailSnapshot } from "../../modules/status-pages/status-page-delivery.model.js";
import type { IncidentEventType } from "../../modules/notifications/notification.types.js";

export type RenderedStatusPageEmail = { subject: string; html: string; text: string };

const templateRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "templates");
const footer = "This is an automated message from FaultLine on behalf of a status page owner.";

const render = (template: string, data: Record<string, unknown>) =>
  ejs.renderFile(
    path.join(templateRoot, template),
    { ...data, footer, e: ejs.escapeXML },
    { views: [templateRoot] },
  );

export const renderConfirmationEmail = async (input: {
  pageName: string;
  confirmUrl: string;
  expiryHours: number;
}): Promise<RenderedStatusPageEmail> => {
  const subject = `Confirm your subscription to ${sanitizeSubjectText(input.pageName)}`;
  const html = await render("status-page/confirm-subscription.ejs", {
    subject,
    pageName: input.pageName,
    confirmUrl: input.confirmUrl,
    expiryHours: input.expiryHours,
  });
  const text = [
    "FaultLine",
    "",
    "Confirm your subscription",
    "",
    `Someone asked to receive incident updates from ${input.pageName} at this email address.`,
    "Confirm your subscription:",
    input.confirmUrl,
    "",
    `This link expires in ${input.expiryHours} hours and can be used once.`,
    "If you did not request this, ignore this email. You will not be subscribed unless you confirm.",
  ].join("\n");
  return { subject, html, text };
};

const copy: Record<IncidentEventType, { label: string; subject: string }> = {
  "incident.opened": { label: "Investigating", subject: "Service disruption" },
  "incident.acknowledged": { label: "Acknowledged", subject: "Update" },
  "incident.resolved": { label: "Resolved", subject: "Resolved" },
};

export const renderIncidentEmail = async (
  eventType: IncidentEventType,
  input: { snapshot: SubscriberEmailSnapshot; statusUrl: string; unsubscribeUrl: string },
): Promise<RenderedStatusPageEmail> => {
  const { snapshot } = input;
  const meta = copy[eventType];
  const services = snapshot.serviceNames.join(", ") || "Affected services";
  const subject =
    `[${sanitizeSubjectText(snapshot.pageName)}] ${meta.subject}: ${sanitizeSubjectText(services)}`.slice(
      0,
      200,
    );
  const heading =
    eventType === "incident.resolved"
      ? `Resolved: ${services}`
      : eventType === "incident.acknowledged"
        ? `Update: ${services}`
        : `Service disruption: ${services}`;
  const intro =
    eventType === "incident.resolved"
      ? `The incident affecting ${services} has been resolved.`
      : eventType === "incident.acknowledged"
        ? `We are aware of the issue affecting ${services} and are working on it.`
        : `We detected an issue affecting ${services} and are investigating.`;
  const rows: Array<[string, string]> = [
    ["Status page", snapshot.pageName],
    ["Affected", services],
    ["Status", meta.label],
    ["Started", formatUtcTimestamp(snapshot.startedAt)],
  ];
  if (eventType === "incident.acknowledged" && snapshot.acknowledgedAt) {
    rows.push(["Acknowledged", formatUtcTimestamp(snapshot.acknowledgedAt)]);
  }
  if (eventType === "incident.resolved") {
    rows.push(["Resolved", formatUtcTimestamp(snapshot.resolvedAt)]);
    rows.push(["Duration", formatDuration(snapshot.durationMs)]);
  }
  const html = await render("status-page/incident-update.ejs", {
    subject,
    statusLabel: meta.label,
    heading,
    intro,
    rows,
    pageName: snapshot.pageName,
    statusUrl: input.statusUrl,
    unsubscribeUrl: input.unsubscribeUrl,
  });
  const text = [
    snapshot.pageName,
    "",
    heading,
    "",
    intro,
    "",
    ...rows.map(([label, value]) => `${label}: ${value}`),
    "",
    `Status page: ${input.statusUrl}`,
    `Unsubscribe: ${input.unsubscribeUrl}`,
  ].join("\n");
  return { subject, html, text };
};

export const renderUnsubscribedEmail = async (input: {
  pageName: string;
  statusUrl: string;
}): Promise<RenderedStatusPageEmail> => {
  const subject = `You unsubscribed from ${sanitizeSubjectText(input.pageName)}`;
  const html = await render("status-page/unsubscribed.ejs", {
    subject,
    pageName: input.pageName,
    statusUrl: input.statusUrl,
  });
  const text = [
    "FaultLine",
    "",
    "You have been unsubscribed",
    "",
    `You will no longer receive incident updates from ${input.pageName} at this address.`,
    `Subscribe again at any time: ${input.statusUrl}`,
  ].join("\n");
  return { subject, html, text };
};
