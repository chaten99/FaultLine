import { isObjectIdOrHexString } from "mongoose";
import { matchingMaintenance, localTime } from "./maintenance.service.js";
import {
  NotificationOutbox,
  type INotificationOutbox,
} from "../notifications/notification-outbox.model.js";
import { Incident } from "../incidents/incident.model.js";
import { loadIncidentSnapshot } from "../notifications/notification-outbox.service.js";
export const maintenanceNotificationPolicy = async (
  workspaceId: string,
  monitorId: string,
  at = new Date(),
) => {
  const suppressed = (await matchingMaintenance(workspaceId, monitorId, at)).filter(
    (w) => !w.notifyDuring,
  );
  if (!suppressed.length) return null;
  const cycle = suppressed
    .map((w) => {
      const week = Math.floor(
        (localTime(at, w.timezone) - localTime(w.startAt, w.timezone)) / (7 * 86400000),
      );
      return String(w._id) + ":" + (w.recurrence === "weekly" ? week : 0);
    })
    .sort()
    .join("|");
  return {
    maintenanceSuppressed: true,
    notifyAfterMaintenance: suppressed.every((w) => w.notifyAfter),
    maintenanceCycle: cycle,
  };
};
export const suppressForMaintenance = async (entry: INotificationOutbox): Promise<boolean> => {
  if (entry.maintenanceSuppressed) return true;
  const policy =
    (await maintenanceNotificationPolicy(
      String(entry.workspaceId),
      entry.snapshot.monitorId,
      entry.eventAt,
    )) ??
    (await maintenanceNotificationPolicy(String(entry.workspaceId), entry.snapshot.monitorId));
  if (!policy) return false;
  await NotificationOutbox.updateOne({ _id: entry._id }, { $set: policy });
  return true;
};
export const markIncidentDuringMaintenance = async (
  workspaceId: string,
  monitorId: string,
): Promise<void> => {
  const policy = await maintenanceNotificationPolicy(workspaceId, monitorId);
  if (!policy) return;
  const incident = await Incident.findOne({
    workspaceId,
    monitorId,
    status: { $in: ["open", "acknowledged"] },
  }).lean();
  if (!incident) return;
  await NotificationOutbox.updateOne(
    { eventId: "incident.opened:" + String(incident._id) },
    { $set: { ...policy, maintenanceResumed: false } },
  );
};
export const notifyAfterMaintenance = async (
  workspaceId: string,
  monitorId: string,
): Promise<void> => {
  if ((await matchingMaintenance(workspaceId, monitorId)).length) return;
  const entries = await NotificationOutbox.find({
    workspaceId,
    "snapshot.monitorId": monitorId,
    type: "incident.opened",
    maintenanceSuppressed: true,
    notifyAfterMaintenance: true,
    maintenanceResumed: { $ne: true },
  })
    .limit(100)
    .lean();
  for (const entry of entries) {
    const incident = await Incident.findById(entry.incidentId).lean();
    if (incident && incident.status !== "resolved") {
      const loaded = await loadIncidentSnapshot(String(incident._id));
      if (!loaded) continue;
      const now = new Date();
      const eventId =
        "incident.opened:" +
        String(incident._id) +
        ":after-maintenance:" +
        (entry.maintenanceCycle ?? "initial");
      await NotificationOutbox.updateOne(
        { eventId },
        {
          $setOnInsert: {
            eventId,
            type: "incident.opened",
            workspaceId: entry.workspaceId,
            userId: entry.userId,
            incidentId: entry.incidentId,
            snapshot: loaded.snapshot,
            status: "pending",
            attempts: 0,
            eventAt: now,
            nextAttemptAt: now,
            expiresAt: new Date(Date.now() + 30 * 86400000),
          },
        },
        { upsert: true },
      );
    }
    await NotificationOutbox.updateOne(
      { _id: entry._id, maintenanceCycle: entry.maintenanceCycle },
      { $set: { maintenanceResumed: true } },
    );
  }
};
export const suppressQueuedNotification = async (
  workspaceId: string,
  monitorId: string,
  eventId: string,
): Promise<boolean> => {
  const policy = await maintenanceNotificationPolicy(workspaceId, monitorId);
  if (!policy) return false;
  await NotificationOutbox.updateOne({ eventId }, { $set: policy });
  return true;
};

export const reconcileMaintenanceNotifications = async (): Promise<void> => {
  const entries = await NotificationOutbox.find({
    maintenanceSuppressed: true,
    notifyAfterMaintenance: true,
    maintenanceResumed: { $ne: true },
  })
    .limit(100)
    .lean();
  const scopes = new Map(
    entries
      .filter(
        (entry) =>
          isObjectIdOrHexString(entry.workspaceId) &&
          isObjectIdOrHexString(entry.snapshot?.monitorId),
      )
      .map((entry) => [
        String(entry.workspaceId) + ":" + entry.snapshot.monitorId,
        { workspaceId: String(entry.workspaceId), monitorId: entry.snapshot.monitorId },
      ]),
  );
  for (const scope of scopes.values())
    await notifyAfterMaintenance(scope.workspaceId, scope.monitorId);
};
