import { Types } from "mongoose";
import { logger } from "../../config/logger.js";
import { MonitorCheck } from "../checks/monitor-check.model.js";
import { IncidentTimeline } from "../incidents/incident-timeline.model.js";
import { Incident } from "../incidents/incident.model.js";
import { MonitorLifecycleEvent } from "../monitors/monitor-lifecycle.model.js";
import { Monitor } from "../monitors/monitor.model.js";
import { NotificationDelivery } from "../notifications/notification-delivery.model.js";
import { NotificationIntegration } from "../notifications/notification-integration.model.js";
import { NotificationOutbox } from "../notifications/notification-outbox.model.js";
import { NotificationPreferences } from "../notifications/notification-preferences.model.js";
import { StatusPageDelivery } from "../status-pages/status-page-delivery.model.js";
import { StatusPageService } from "../status-pages/status-page-service.model.js";
import { StatusPageSubscriber } from "../status-pages/status-page-subscriber.model.js";
import { PublicStatusPage } from "../status-pages/status-page.model.js";
import { WorkspaceAuditEvent } from "./workspace-audit.model.js";
import { WorkspaceInvitation } from "./workspace-invitation.model.js";
import { WorkspaceMember } from "./workspace-member.model.js";
import { Workspace } from "./workspace.model.js";

export const purgeWorkspace = async (workspaceId: string): Promise<void> => {
  const id = new Types.ObjectId(workspaceId);
  const monitorIds = (await Monitor.find({ workspaceId: id }).select("_id").lean()).map(
    (monitor) => monitor._id,
  );
  const incidentIds = (await Incident.find({ workspaceId: id }).select("_id").lean()).map(
    (incident) => incident._id,
  );
  const pageIds = (await PublicStatusPage.find({ workspaceId: id }).select("_id").lean()).map(
    (page) => page._id,
  );

  if (monitorIds.length > 0) {
    await MonitorCheck.deleteMany({ monitorId: { $in: monitorIds } });
    await MonitorLifecycleEvent.deleteMany({ monitorId: { $in: monitorIds } });
  }
  if (incidentIds.length > 0)
    await IncidentTimeline.deleteMany({ incidentId: { $in: incidentIds } });
  if (pageIds.length > 0) {
    await StatusPageSubscriber.deleteMany({ pageId: { $in: pageIds } });
    await StatusPageDelivery.deleteMany({ pageId: { $in: pageIds } });
  }
  await StatusPageService.deleteMany({ workspaceId: id });
  await PublicStatusPage.deleteMany({ workspaceId: id });
  await Incident.deleteMany({ workspaceId: id });
  await Monitor.deleteMany({ workspaceId: id });
  await NotificationDelivery.deleteMany({ workspaceId: id });
  await NotificationOutbox.deleteMany({ workspaceId: id });
  await NotificationIntegration.deleteMany({ workspaceId: id });
  await NotificationPreferences.deleteMany({ workspaceId: id });
  await WorkspaceInvitation.deleteMany({ workspaceId: id });
  await WorkspaceMember.deleteMany({ workspaceId: id });
  await WorkspaceAuditEvent.collection.deleteMany({ workspaceId: id });
  await Workspace.updateOne({ _id: id }, { $set: { purgedAt: new Date() } });
};

export const purgeExpiredWorkspaces = async (now = new Date()): Promise<number> => {
  const due = await Workspace.find({
    status: "deleted",
    purgeAfter: { $lte: now },
    purgedAt: null,
  })
    .select("_id")
    .limit(10)
    .lean();
  let purged = 0;
  for (const workspace of due) {
    try {
      await purgeWorkspace(String(workspace._id));
      purged += 1;
    } catch (error) {
      logger.error({ err: error, workspaceId: String(workspace._id) }, "Workspace purge failed");
    }
  }
  return purged;
};

export const warnIfUnmigrated = async (): Promise<number> => {
  const count = await Monitor.collection.countDocuments({ workspaceId: { $exists: false } });
  if (count > 0) {
    logger.warn(
      { unmigratedMonitors: count },
      "Resources without a workspace were found. Run npm run migrate:workspaces -- --execute (dry-run by default) before serving traffic.",
    );
  }
  return count;
};
