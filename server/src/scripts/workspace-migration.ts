import { Types, type Model } from "mongoose";
import { MonitorCheck } from "../modules/checks/monitor-check.model.js";
import { User } from "../modules/auth/user.model.js";
import { Incident } from "../modules/incidents/incident.model.js";
import { Monitor } from "../modules/monitors/monitor.model.js";
import { NotificationDelivery } from "../modules/notifications/notification-delivery.model.js";
import { NotificationIntegration } from "../modules/notifications/notification-integration.model.js";
import { NotificationOutbox } from "../modules/notifications/notification-outbox.model.js";
import { NotificationPreferences } from "../modules/notifications/notification-preferences.model.js";
import { StatusPageService } from "../modules/status-pages/status-page-service.model.js";
import { PublicStatusPage } from "../modules/status-pages/status-page.model.js";
import { ensurePersonalWorkspace } from "../modules/workspaces/workspace-core.service.js";
import { WorkspaceMember } from "../modules/workspaces/workspace-member.model.js";
import { Workspace } from "../modules/workspaces/workspace.model.js";

type Target = { label: string; model: Model<never>; ownerField: "userId" | "ownerId" };

const targets: Target[] = [
  { label: "monitors", model: Monitor as unknown as Model<never>, ownerField: "userId" },
  { label: "incidents", model: Incident as unknown as Model<never>, ownerField: "userId" },
  {
    label: "notificationIntegrations",
    model: NotificationIntegration as unknown as Model<never>,
    ownerField: "userId",
  },
  {
    label: "notificationPreferences",
    model: NotificationPreferences as unknown as Model<never>,
    ownerField: "userId",
  },
  {
    label: "notificationOutbox",
    model: NotificationOutbox as unknown as Model<never>,
    ownerField: "userId",
  },
  {
    label: "notificationDeliveries",
    model: NotificationDelivery as unknown as Model<never>,
    ownerField: "userId",
  },
  {
    label: "statusPages",
    model: PublicStatusPage as unknown as Model<never>,
    ownerField: "ownerId",
  },
  {
    label: "statusPageServices",
    model: StatusPageService as unknown as Model<never>,
    ownerField: "ownerId",
  },
];

export type MigrationReport = {
  mode: "dry-run" | "execute";
  users: number;
  personalWorkspacesExisting: number;
  personalWorkspacesCreated: number;
  backfilled: Record<string, { pending: number; updated: number }>;
  orphans: Record<string, number>;
  droppedLegacyIndexes: string[];
  verification: {
    passed: boolean;
    unmigratedResources: Record<string, number>;
    usersWithoutPersonalWorkspace: number;
    workspacesWithoutOwnerMembership: number;
    resourcesInForeignPersonalWorkspace: number;
  };
};

const legacyUserIndex = async (): Promise<string[]> => {
  const dropped: string[] = [];
  const indexes = await NotificationPreferences.collection.indexes().catch((error: unknown) => {
    if ((error as { code?: number }).code === 26) return [];
    throw error;
  });
  for (const index of indexes) {
    const keys = Object.keys(index.key ?? {});
    if (index.unique && keys.length === 1 && keys[0] === "userId" && index.name) {
      dropped.push(index.name);
    }
  }
  return dropped;
};

export const runWorkspaceMigration = async (options: {
  execute: boolean;
  log?: (message: string) => void;
}): Promise<MigrationReport> => {
  const log = options.log ?? (() => undefined);
  const report: MigrationReport = {
    mode: options.execute ? "execute" : "dry-run",
    users: 0,
    personalWorkspacesExisting: 0,
    personalWorkspacesCreated: 0,
    backfilled: Object.fromEntries(
      targets.map((target) => [target.label, { pending: 0, updated: 0 }]),
    ),
    orphans: Object.fromEntries(targets.map((target) => [target.label, 0])),
    droppedLegacyIndexes: [],
    verification: {
      passed: false,
      unmigratedResources: {},
      usersWithoutPersonalWorkspace: 0,
      workspacesWithoutOwnerMembership: 0,
      resourcesInForeignPersonalWorkspace: 0,
    },
  };

  const legacy = await legacyUserIndex();
  if (options.execute) {
    for (const name of legacy) {
      await NotificationPreferences.collection.dropIndex(name);
      report.droppedLegacyIndexes.push(name);
      log(`dropped legacy unique index ${name} on notificationpreferences`);
    }
  } else {
    report.droppedLegacyIndexes = legacy;
  }

  const userIds: Types.ObjectId[] = [];
  for await (const user of User.find({}).select("_id").lean().cursor()) {
    userIds.push(user._id as Types.ObjectId);
  }
  report.users = userIds.length;

  for (const userId of userIds) {
    const existing = await Workspace.findOne({ type: "personal", createdBy: userId })
      .select("_id")
      .lean();
    let workspaceId: Types.ObjectId | null = existing ? (existing._id as Types.ObjectId) : null;
    if (existing) {
      report.personalWorkspacesExisting += 1;
      if (options.execute) await ensurePersonalWorkspace(String(userId));
    } else if (options.execute) {
      workspaceId = (await ensurePersonalWorkspace(String(userId)))._id;
      report.personalWorkspacesCreated += 1;
      log(`created personal workspace for user ${String(userId)}`);
    } else {
      report.personalWorkspacesCreated += 1;
    }

    for (const target of targets) {
      const filter = { [target.ownerField]: userId, workspaceId: { $exists: false } };
      const pending = await target.model.collection.countDocuments(filter);
      report.backfilled[target.label]!.pending += pending;
      if (options.execute && pending > 0 && workspaceId) {
        const result = await target.model.collection.updateMany(filter, { $set: { workspaceId } });
        report.backfilled[target.label]!.updated += result.modifiedCount;
      }
    }
  }

  const knownUsers = new Set(userIds.map(String));
  for (const target of targets) {
    const owners = (await target.model.collection.distinct(target.ownerField, {
      workspaceId: { $exists: false },
    })) as unknown[];
    report.orphans[target.label] = owners.filter((owner) => !knownUsers.has(String(owner))).length;
  }

  const unmigrated: Record<string, number> = {};
  for (const target of targets) {
    unmigrated[target.label] = await target.model.collection.countDocuments({
      workspaceId: { $exists: false },
    });
  }
  const personal = await Workspace.find({ type: "personal" })
    .select("_id createdBy ownerId")
    .lean();
  const withMembership = new Set(
    (
      await WorkspaceMember.find({ role: "owner", status: "active" }).select("workspaceId").lean()
    ).map((member) => String(member.workspaceId)),
  );
  const createdBy = new Map(
    personal.map((workspace) => [String(workspace._id), String(workspace.createdBy)]),
  );
  let foreign = 0;
  for (const target of [targets[0]!, targets[1]!]) {
    const sample = target.model.collection.find(
      { workspaceId: { $exists: true } },
      { projection: { workspaceId: 1, userId: 1 } },
    );
    for await (const doc of sample) {
      const owner = createdBy.get(String(doc.workspaceId));
      if (owner && owner !== String(doc.userId)) foreign += 1;
    }
  }

  report.verification = {
    passed: false,
    unmigratedResources: unmigrated,
    usersWithoutPersonalWorkspace: options.execute
      ? userIds.filter(
          (id) => !personal.some((workspace) => String(workspace.createdBy) === String(id)),
        ).length
      : 0,
    workspacesWithoutOwnerMembership: personal.filter(
      (workspace) => !withMembership.has(String(workspace._id)),
    ).length,
    resourcesInForeignPersonalWorkspace: foreign,
  };
  const totalUnmigrated = Object.entries(unmigrated).reduce(
    (sum, [label, count]) => sum + Math.max(0, count - (report.orphans[label] ?? 0)),
    0,
  );
  report.verification.passed =
    options.execute &&
    totalUnmigrated === 0 &&
    report.verification.usersWithoutPersonalWorkspace === 0 &&
    report.verification.workspacesWithoutOwnerMembership === 0 &&
    foreign === 0;
  void MonitorCheck;
  return report;
};
