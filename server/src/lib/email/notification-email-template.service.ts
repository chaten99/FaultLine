import path from "node:path";
import { fileURLToPath } from "node:url";
import ejs from "ejs";
import {
  describeTrigger,
  formatDuration,
  formatUtcTimestamp,
  sanitizeSubjectText,
} from "../../modules/notifications/notification-format.js";
import type { IncidentNotificationSnapshot } from "../../modules/notifications/notification.types.js";

export type NotificationEmailKind =
  "incident.opened" | "incident.acknowledged" | "incident.resolved" | "notification.test";

export type RenderedNotificationEmail = {
  subject: string;
  html: string;
  text: string;
};

const templateRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "templates");

const templates: Record<NotificationEmailKind, string> = {
  "incident.opened": "notifications/incident-opened.ejs",
  "incident.acknowledged": "notifications/incident-acknowledged.ejs",
  "incident.resolved": "notifications/incident-resolved.ejs",
  "notification.test": "notifications/test-notification.ejs",
};

const footer = "This is an automated incident alert from FaultLine.";

type View = {
  subject: string;
  statusLabel: string;
  rows: Array<[string, string]>;
  intro: string;
  extra: Record<string, string>;
};

const buildIncidentView = (
  kind: Exclude<NotificationEmailKind, "notification.test">,
  snapshot: IncidentNotificationSnapshot,
): View => {
  const monitor = sanitizeSubjectText(snapshot.monitorName);
  if (kind === "incident.opened") {
    return {
      subject: `[FaultLine] Incident detected: ${monitor}`,
      statusLabel: "Open",
      intro: `FaultLine detected repeated failures while monitoring ${snapshot.monitorName}. A check failed ${snapshot.failureThreshold} times in a row, which reached the failure threshold configured for this monitor.`,
      rows: [
        ["Monitor", snapshot.monitorName],
        ["Incident", snapshot.title],
        ["Status", "Open"],
        ["First failure", formatUtcTimestamp(snapshot.firstFailureAt)],
        ["Failure", describeTrigger(snapshot)],
        ["Failure threshold", `${snapshot.failureThreshold} consecutive failed checks`],
      ],
      extra: { failureThreshold: String(snapshot.failureThreshold) },
    };
  }
  if (kind === "incident.acknowledged") {
    const acknowledgedBy = snapshot.acknowledgedByName ?? "A team member";
    return {
      subject: `[FaultLine] Incident acknowledged: ${monitor}`,
      statusLabel: "Acknowledged",
      intro: `${acknowledgedBy} acknowledged the incident on ${snapshot.monitorName}. The incident remains active until the monitor recovers or the incident is resolved.`,
      rows: [
        ["Monitor", snapshot.monitorName],
        ["Incident", snapshot.title],
        ["Status", "Acknowledged"],
        ["Acknowledged at", formatUtcTimestamp(snapshot.acknowledgedAt)],
        ["Acknowledged by", acknowledgedBy],
      ],
      extra: { acknowledgedBy },
    };
  }
  const manual = snapshot.resolutionType === "manual";
  const resolutionSummary = manual
    ? `The incident on ${snapshot.monitorName} was manually marked as resolved.`
    : `${snapshot.monitorName} recovered after ${snapshot.recoveryCheckCount ?? snapshot.recoveryThreshold ?? 1} consecutive successful checks.`;
  const rows: Array<[string, string]> = [
    ["Monitor", snapshot.monitorName],
    ["Incident", snapshot.title],
    ["Status", "Resolved"],
    ["Recovered at", formatUtcTimestamp(snapshot.resolvedAt)],
    ["Duration", formatDuration(snapshot.durationMs)],
    ["Resolution", manual ? "Manual" : "Automatic recovery"],
  ];
  if (!manual && snapshot.recoveryCheckCount) {
    rows.push([
      "Recovery threshold",
      `${snapshot.recoveryCheckCount} consecutive successful checks`,
    ]);
  }
  return {
    subject: `[FaultLine] Service recovered: ${monitor}`,
    statusLabel: "Resolved",
    intro: resolutionSummary,
    rows,
    extra: { resolutionSummary },
  };
};

const toText = (view: View, heading: string, url: string | null): string =>
  [
    "FaultLine",
    "",
    heading,
    "",
    view.intro,
    "",
    ...view.rows.map(([label, value]) => `${label}: ${value}`),
    ...(url ? ["", `View incident: ${url}`] : []),
    "",
    footer,
  ].join("\n");

export const renderNotificationEmail = async (
  kind: NotificationEmailKind,
  options: { snapshot: IncidentNotificationSnapshot | null; recipient: string },
): Promise<RenderedNotificationEmail> => {
  const templatePath = path.join(templateRoot, templates[kind]);
  if (kind === "notification.test" || !options.snapshot) {
    const subject = "[FaultLine] Test notification";
    const html = await ejs.renderFile(
      templatePath,
      { subject, footer, e: ejs.escapeXML, recipient: options.recipient },
      { views: [templateRoot] },
    );
    const text = [
      "FaultLine",
      "",
      "Test notification",
      "",
      `This is a test message from FaultLine. If you can read it, email alerts for ${options.recipient} are working. No incident was created and no monitor was affected.`,
      "",
      footer,
    ].join("\n");
    return { subject, html, text };
  }
  const view = buildIncidentView(kind, options.snapshot);
  const html = await ejs.renderFile(
    templatePath,
    {
      subject: view.subject,
      footer,
      e: ejs.escapeXML,
      statusLabel: view.statusLabel,
      monitorName: options.snapshot.monitorName,
      rows: view.rows,
      incidentUrl: options.snapshot.incidentUrl,
      acknowledgedBy: "",
      resolutionSummary: "",
      failureThreshold: "",
      ...view.extra,
    },
    { views: [templateRoot] },
  );
  const headings: Record<string, string> = {
    "incident.opened": `Incident detected: ${options.snapshot.monitorName}`,
    "incident.acknowledged": `Incident acknowledged: ${options.snapshot.monitorName}`,
    "incident.resolved": `Service recovered: ${options.snapshot.monitorName}`,
  };
  return {
    subject: view.subject,
    html,
    text: toText(view, headings[kind] ?? view.subject, options.snapshot.incidentUrl),
  };
};
