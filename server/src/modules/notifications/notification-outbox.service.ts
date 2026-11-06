import { Types } from "mongoose";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { User } from "../auth/user.model.js";
import { Incident } from "../incidents/incident.model.js";
import { IncidentTimeline } from "../incidents/incident-timeline.model.js";
import { Monitor } from "../monitors/monitor.model.js";
import { NotificationOutbox } from "./notification-outbox.model.js";
import { dispatchOutboxEvent } from "./notification-dispatcher.service.js";
import type { IncidentEventType, IncidentNotificationSnapshot } from "./notification.types.js";

const outboxRetentionMs = 30 * 24 * 60 * 60 * 1000;

export const buildEventId = (type: IncidentEventType, incidentId: string): string =>
  `${type}:${incidentId}`;

const toIso = (value: Date | undefined | null): string | null =>
  value ? new Date(value).toISOString() : null;

export const loadIncidentSnapshot = async (
  incidentId: string,
): Promise<{ snapshot: IncidentNotificationSnapshot; userId: Types.ObjectId } | null> => {
  const incident = await Incident.findById(incidentId).lean();
  if (!incident) return null;
  const [monitor, created, acknowledger] = await Promise.all([
    Monitor.findById(incident.monitorId).select("name failureThreshold recoveryThreshold").lean(),
    IncidentTimeline.findOne({ incidentId: incident._id, type: "incident.created" }).lean(),
    incident.acknowledgedBy
      ? User.findById(incident.acknowledgedBy).select("name").lean()
      : Promise.resolve(null),
  ]);
  const metadata = (created?.metadata ?? {}) as { failureCategory?: string; statusCode?: number };
  const snapshot: IncidentNotificationSnapshot = {
    incidentId: String(incident._id),
    monitorId: String(incident.monitorId),
    monitorName: monitor?.name ?? "Monitor",
    title: incident.title,
    status: incident.status,
    openedAt: new Date(incident.openedAt).toISOString(),
    firstFailureAt: new Date(incident.firstFailureAt).toISOString(),
    acknowledgedAt: toIso(incident.acknowledgedAt),
    acknowledgedByName: acknowledger?.name ?? null,
    resolvedAt: toIso(incident.resolvedAt),
    resolutionType: incident.resolutionType ?? null,
    durationMs: incident.durationMs ?? null,
    failureCategory: metadata.failureCategory ?? null,
    statusCode: typeof metadata.statusCode === "number" ? metadata.statusCode : null,
    failureThreshold: monitor?.failureThreshold ?? incident.failureCountAtCreation ?? 1,
    recoveryThreshold: monitor?.recoveryThreshold ?? null,
    recoveryCheckCount: incident.recoveryCheckCount ?? null,
    incidentUrl: `${env.APP_ORIGIN.replace(/\/+$/, "")}/incidents/${String(incident._id)}`,
  };
  return { snapshot, userId: incident.userId };
};

export const persistOutboxEvent = async (
  type: IncidentEventType,
  incidentId: string,
): Promise<string | null> => {
  const loaded = await loadIncidentSnapshot(incidentId);
  if (!loaded) return null;
  const { snapshot } = loaded;
  const hasOccurred =
    type === "incident.opened" ||
    (type === "incident.acknowledged" && snapshot.acknowledgedAt) ||
    (type === "incident.resolved" && snapshot.resolvedAt);
  if (!hasOccurred) return null;
  const eventId = buildEventId(type, incidentId);
  const eventAt =
    type === "incident.opened"
      ? snapshot.openedAt
      : type === "incident.acknowledged"
        ? snapshot.acknowledgedAt
        : snapshot.resolvedAt;
  await NotificationOutbox.updateOne(
    { eventId },
    {
      $setOnInsert: {
        eventId,
        type,
        userId: loaded.userId,
        incidentId: new Types.ObjectId(incidentId),
        snapshot,
        status: "pending",
        attempts: 0,
        nextAttemptAt: new Date(),
        eventAt: new Date(eventAt ?? Date.now()),
        expiresAt: new Date(Date.now() + outboxRetentionMs),
      },
    },
    { upsert: true },
  );
  return eventId;
};

export const recordIncidentNotificationEvent = async (
  type: IncidentEventType,
  incidentId: string,
): Promise<void> => {
  try {
    const eventId = await persistOutboxEvent(type, incidentId);
    if (!eventId) return;
    void dispatchOutboxEvent(eventId).catch((error: unknown) => {
      logger.warn({ err: error, eventId }, "Immediate notification dispatch deferred");
    });
  } catch (error) {
    logger.warn({ err: error, incidentId, type }, "Notification event will be recovered later");
  }
};

export const reconcileIncidentEvents = async (windowMinutes = 60): Promise<number> => {
  const since = new Date(Date.now() - windowMinutes * 60_000);
  const incidents = await Incident.find({ updatedAt: { $gte: since } })
    .select("_id acknowledgedAt resolvedAt")
    .limit(500)
    .lean();
  if (incidents.length === 0) return 0;
  const existing = await NotificationOutbox.find({
    incidentId: { $in: incidents.map((incident) => incident._id) },
  })
    .select("eventId")
    .lean();
  const known = new Set(existing.map((entry) => entry.eventId));
  let created = 0;
  for (const incident of incidents) {
    const id = String(incident._id);
    const wanted: IncidentEventType[] = ["incident.opened"];
    if (incident.acknowledgedAt) wanted.push("incident.acknowledged");
    if (incident.resolvedAt) wanted.push("incident.resolved");
    for (const type of wanted) {
      if (known.has(buildEventId(type, id))) continue;
      try {
        if (await persistOutboxEvent(type, id)) created += 1;
      } catch (error) {
        logger.warn({ err: error, incidentId: id, type }, "Outbox reconciliation failed for event");
      }
    }
  }
  return created;
};
