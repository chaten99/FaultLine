import argon2 from "argon2";
import mongoose, { Types } from "mongoose";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { app } from "../src/app.js";
import { sendNotificationEmail } from "../src/lib/email/email.service.js";
import { createAccessToken } from "../src/modules/auth/auth-token.service.js";
import { User } from "../src/modules/auth/user.model.js";
import { MonitorCheck } from "../src/modules/checks/monitor-check.model.js";
import { Incident } from "../src/modules/incidents/incident.model.js";
import { Monitor } from "../src/modules/monitors/monitor.model.js";
import { NotificationPreferences } from "../src/modules/notifications/notification-preferences.model.js";
import { PublicStatusPage } from "../src/modules/status-pages/status-page.model.js";
import {
  acceptInvitation,
  createInvitation,
} from "../src/modules/workspaces/invitation.service.js";
import { WorkspaceAuditEvent } from "../src/modules/workspaces/workspace-audit.model.js";
import { WorkspaceInvitation } from "../src/modules/workspaces/workspace-invitation.model.js";
import { WorkspaceMember } from "../src/modules/workspaces/workspace-member.model.js";
import { purgeWorkspace } from "../src/modules/workspaces/workspace-purge.service.js";
import { Workspace } from "../src/modules/workspaces/workspace.model.js";
import { transferOwnership } from "../src/modules/workspaces/workspace.service.js";
import { runWorkspaceMigration } from "../src/scripts/workspace-migration.js";

const baseUri = process.env.ANALYTICS_TEST_MONGODB_URI;
const uri = baseUri
  ? `${baseUri.slice(0, baseUri.lastIndexOf("/") + 1)}faultline_workspaces_integration`
  : undefined;

vi.mock("../src/lib/redis/redis.service.js", () => ({
  acquireLock: vi.fn().mockResolvedValue(true),
  releaseLock: vi.fn().mockResolvedValue(true),
  publishDomainEvent: vi.fn().mockResolvedValue(undefined),
  closeRedisConnections: vi.fn(),
  getRedisClient: () => ({ status: "ready", incr: async () => 1, expire: async () => 1 }),
  createRedisConnection: vi.fn(),
}));

vi.mock("../src/queues/monitor-scheduler.service.js", () => ({
  scheduleMonitor: vi.fn().mockResolvedValue(undefined),
  unscheduleMonitor: vi.fn().mockResolvedValue(undefined),
  enqueueImmediateCheck: vi.fn().mockResolvedValue("run"),
  reconcileSchedulers: vi.fn(),
}));

vi.mock("../src/lib/email/email.service.js", () => ({
  sendNotificationEmail: vi.fn().mockResolvedValue({ ok: true, responseCode: 200, durationMs: 3 }),
}));

const sendMock = vi.mocked(sendNotificationEmail);

describe.skipIf(!uri)("workspaces against MongoDB", () => {
  const password = "CorrectHorse1!";
  const owner = new Types.ObjectId();
  const admin = new Types.ObjectId();
  const member = new Types.ObjectId();
  const viewer = new Types.ObjectId();
  const stranger = new Types.ObjectId();
  const headers = (id: Types.ObjectId, workspaceId?: string) => ({
    Authorization: `Bearer ${createAccessToken(String(id))}`,
    ...(workspaceId ? { "X-Workspace-Id": workspaceId } : {}),
  });

  const user = async (id: Types.ObjectId, name: string, email: string) =>
    User.create({
      _id: id,
      name,
      email,
      passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
      emailVerifiedAt: new Date(),
    });

  beforeAll(async () => {
    await mongoose.connect(uri as string);
    await mongoose.connection.dropDatabase();
    await Promise.all(
      [
        Workspace,
        WorkspaceMember,
        WorkspaceInvitation,
        WorkspaceAuditEvent,
        Monitor,
        PublicStatusPage,
      ].map((model) => model.syncIndexes()),
    );
    await user(owner, "Olivia Owner", "owner@example.com");
    await user(admin, "Adam Admin", "admin@example.com");
    await user(member, "Maya Member", "member@example.com");
    await user(viewer, "Victor Viewer", "viewer@example.com");
    await user(stranger, "Sam Stranger", "stranger@example.com");
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  describe("legacy data migration", () => {
    const legacyOwner = new Types.ObjectId();
    const secondOwner = new Types.ObjectId();
    const orphanOwner = new Types.ObjectId();
    const ids = {
      monitorA: new Types.ObjectId(),
      monitorB: new Types.ObjectId(),
      incidentA: new Types.ObjectId(),
      pageA: new Types.ObjectId(),
      serviceA: new Types.ObjectId(),
      orphanMonitor: new Types.ObjectId(),
    };

    beforeAll(async () => {
      await user(legacyOwner, "Legacy One", "legacy1@example.com");
      await user(secondOwner, "Legacy Two", "legacy2@example.com");
      const monitor = (id: Types.ObjectId, userId: Types.ObjectId, name: string) => ({
        _id: id,
        userId,
        name,
        url: "https://example.com",
        method: "GET",
        intervalSeconds: 60,
        timeoutMs: 5000,
        expectedStatusCodes: [200],
        active: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await Monitor.collection.insertMany([
        monitor(ids.monitorA, legacyOwner, "Legacy A"),
        monitor(ids.monitorB, secondOwner, "Legacy B"),
        monitor(ids.orphanMonitor, orphanOwner, "Orphaned"),
      ]);
      await Incident.collection.insertOne({
        _id: ids.incidentA,
        monitorId: ids.monitorA,
        userId: legacyOwner,
        title: "Legacy incident",
        status: "resolved",
        firstFailureAt: new Date(),
        openedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await PublicStatusPage.collection.insertOne({
        _id: ids.pageA,
        ownerId: legacyOwner,
        name: "Legacy page",
        slug: "legacy-page",
        status: "published",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await mongoose.connection.collection("statuspageservices").insertOne({
        _id: ids.serviceA,
        pageId: ids.pageA,
        ownerId: legacyOwner,
        name: "Legacy service",
        monitorIds: [ids.monitorA],
        order: 0,
        enabled: true,
      });
      await NotificationPreferences.collection.createIndex(
        { userId: 1 },
        { unique: true, name: "userId_1" },
      );
      await NotificationPreferences.collection.insertOne({ userId: legacyOwner, enabled: true });
    });

    it("reports what it would do in dry-run mode without changing anything", async () => {
      const before = await Monitor.collection.countDocuments({ workspaceId: { $exists: true } });
      const report = await runWorkspaceMigration({ execute: false });
      expect(report.mode).toBe("dry-run");
      expect(report.backfilled.monitors?.pending).toBe(2);
      expect(report.backfilled.incidents?.pending).toBe(1);
      expect(report.backfilled.statusPages?.pending).toBe(1);
      expect(report.backfilled.statusPageServices?.pending).toBe(1);
      expect(report.backfilled.notificationPreferences?.pending).toBe(1);
      expect(report.droppedLegacyIndexes).toContain("userId_1");
      expect(report.verification.passed).toBe(false);
      expect(await Monitor.collection.countDocuments({ workspaceId: { $exists: true } })).toBe(
        before,
      );
      expect(await Workspace.countDocuments({ createdBy: legacyOwner })).toBe(0);
      const indexes = await NotificationPreferences.collection.indexes();
      expect(indexes.some((index) => index.name === "userId_1")).toBe(true);
    });

    it("migrates every resource into the owner's personal workspace and preserves ids", async () => {
      const report = await runWorkspaceMigration({ execute: true });
      expect(report.mode).toBe("execute");
      expect(report.backfilled.monitors?.updated).toBe(2);
      expect(report.orphans.monitors).toBe(1);
      expect(report.droppedLegacyIndexes).toContain("userId_1");

      const workspace = await Workspace.findOne({ type: "personal", createdBy: legacyOwner });
      expect(workspace).toBeTruthy();
      const monitor = await Monitor.collection.findOne({ _id: ids.monitorA });
      expect(String(monitor?.workspaceId)).toBe(String(workspace?._id));
      expect(String(monitor?.userId)).toBe(String(legacyOwner));
      const incident = await Incident.collection.findOne({ _id: ids.incidentA });
      expect(String(incident?.workspaceId)).toBe(String(workspace?._id));
      const page = await PublicStatusPage.collection.findOne({ _id: ids.pageA });
      expect(String(page?.workspaceId)).toBe(String(workspace?._id));
      expect(String(page?.ownerId)).toBe(String(legacyOwner));
      const service = await mongoose.connection
        .collection("statuspageservices")
        .findOne({ _id: ids.serviceA });
      expect(String(service?.workspaceId)).toBe(String(workspace?._id));
      expect(String(workspace?.ownerId)).toBe(String(legacyOwner));
      const membership = await WorkspaceMember.findOne({
        workspaceId: workspace?._id,
        userId: legacyOwner,
      });
      expect(membership).toMatchObject({ role: "owner", status: "active" });
      const orphan = await Monitor.collection.findOne({ _id: ids.orphanMonitor });
      expect(orphan?.workspaceId).toBeUndefined();
      expect(report.verification.usersWithoutPersonalWorkspace).toBe(0);
      expect(report.verification.resourcesInForeignPersonalWorkspace).toBe(0);
    });

    it("lets migrated owners reach their data through the new API and isolates other users", async () => {
      const workspace = await Workspace.findOne({ type: "personal", createdBy: legacyOwner });
      const list = await request(app)
        .get("/api/monitors")
        .set(headers(legacyOwner, String(workspace?._id)))
        .expect(200);
      expect(list.body.items.map((item: { name: string }) => item.name)).toEqual(["Legacy A"]);
      await request(app)
        .get(`/api/monitors/${ids.monitorB}`)
        .set(headers(legacyOwner, String(workspace?._id)))
        .expect(404);
      const fallback = await request(app)
        .get("/api/monitors")
        .set(headers(secondOwner))
        .expect(200);
      expect(fallback.body.items.map((item: { name: string }) => item.name)).toEqual(["Legacy B"]);
    });

    it("is idempotent: a second run changes nothing", async () => {
      const workspaces = await Workspace.countDocuments({});
      const members = await WorkspaceMember.countDocuments({});
      const report = await runWorkspaceMigration({ execute: true });
      expect(report.personalWorkspacesCreated).toBe(0);
      expect(
        Object.values(report.backfilled).every(
          (entry) => entry.updated === 0 && entry.pending === 0,
        ),
      ).toBe(true);
      expect(await Workspace.countDocuments({})).toBe(workspaces);
      expect(await WorkspaceMember.countDocuments({})).toBe(members);
    });

    it("resumes after an interruption and only fills what is missing", async () => {
      const late = new Types.ObjectId();
      await user(late, "Late User", "late@example.com");
      const lateMonitor = new Types.ObjectId();
      await Monitor.collection.insertOne({
        _id: lateMonitor,
        userId: late,
        name: "Late",
        url: "https://example.com",
        method: "GET",
        intervalSeconds: 60,
        timeoutMs: 5000,
        expectedStatusCodes: [200],
        active: true,
      });
      const partial = await Workspace.create({
        name: "Late User's Workspace",
        slug: "late-user-partial",
        type: "personal",
        createdBy: late,
        ownerId: late,
      });
      const report = await runWorkspaceMigration({ execute: true });
      expect(report.personalWorkspacesCreated).toBe(0);
      expect(report.backfilled.monitors?.updated).toBe(1);
      const monitor = await Monitor.collection.findOne({ _id: lateMonitor });
      expect(String(monitor?.workspaceId)).toBe(String(partial._id));
      expect(
        await WorkspaceMember.countDocuments({ workspaceId: partial._id, role: "owner" }),
      ).toBe(1);
    });

    it("allows several workspaces per user once the legacy unique index is gone", async () => {
      const other = await Workspace.create({
        name: "Second",
        slug: "legacy-second",
        type: "team",
        createdBy: legacyOwner,
        ownerId: legacyOwner,
      });
      const personal = await Workspace.findOne({ type: "personal", createdBy: legacyOwner });
      await NotificationPreferences.create({
        userId: legacyOwner,
        workspaceId: other._id,
        enabled: false,
      });
      expect(personal).toBeTruthy();
      expect(
        await NotificationPreferences.countDocuments({ userId: legacyOwner }),
      ).toBeGreaterThanOrEqual(2);
    });
  });

  describe("database guarantees", () => {
    it("enforces one membership per user per workspace and one personal workspace per user", async () => {
      const ws = await Workspace.create({
        name: "Unique Team",
        slug: "unique-team",
        type: "team",
        createdBy: owner,
        ownerId: owner,
      });
      await WorkspaceMember.create({ workspaceId: ws._id, userId: owner, role: "owner" });
      await expect(
        WorkspaceMember.create({ workspaceId: ws._id, userId: owner, role: "admin" }),
      ).rejects.toMatchObject({ code: 11000 });
      const solo = new Types.ObjectId();
      await Workspace.create({
        name: "P1",
        slug: "personal-one-x",
        type: "personal",
        createdBy: solo,
        ownerId: solo,
      });
      await expect(
        Workspace.create({
          name: "P2",
          slug: "personal-two-x",
          type: "personal",
          createdBy: solo,
          ownerId: solo,
        }),
      ).rejects.toMatchObject({ code: 11000 });
      await expect(
        Workspace.create({
          name: "Dup",
          slug: "unique-team",
          type: "team",
          createdBy: owner,
          ownerId: owner,
        }),
      ).rejects.toMatchObject({ code: 11000 });
    });

    it("allows only one pending invitation per email and workspace", async () => {
      const ws = await Workspace.create({
        name: "Invite Team",
        slug: "invite-team",
        type: "team",
        createdBy: owner,
        ownerId: owner,
      });
      const base = {
        workspaceId: ws._id,
        email: "dup@example.com",
        role: "member",
        invitedBy: owner,
        tokenHash: "a".repeat(64),
        expiresAt: new Date(Date.now() + 86_400_000),
        lastSentAt: new Date(),
      };
      const first = await WorkspaceInvitation.create(base);
      await expect(
        WorkspaceInvitation.create({ ...base, tokenHash: "b".repeat(64) }),
      ).rejects.toMatchObject({ code: 11000 });
      await WorkspaceInvitation.updateOne({ _id: first._id }, { $set: { status: "revoked" } });
      await expect(
        WorkspaceInvitation.create({ ...base, tokenHash: "c".repeat(64) }),
      ).resolves.toBeTruthy();
    });

    it("makes audit events immutable", async () => {
      const event = await WorkspaceAuditEvent.create({
        workspaceId: new Types.ObjectId(),
        actorId: owner,
        type: "workspace.created",
        metadata: {},
      });
      await expect(
        WorkspaceAuditEvent.updateOne({ _id: event._id }, { $set: { type: "workspace.deleted" } }),
      ).rejects.toThrow(/immutable/);
      await expect(WorkspaceAuditEvent.deleteMany({ _id: event._id })).rejects.toThrow(/immutable/);
      await expect(
        WorkspaceAuditEvent.findOneAndUpdate({ _id: event._id }, { $set: { actorId: stranger } }),
      ).rejects.toThrow(/immutable/);
      expect(await WorkspaceAuditEvent.countDocuments({ _id: event._id })).toBe(1);
    });
  });

  describe("team collaboration end to end", () => {
    let workspaceId = "";

    it("creates a team workspace, invites members and shares monitors", async () => {
      const created = await request(app)
        .post("/api/workspaces")
        .set(headers(owner))
        .send({ name: "Platform Team" })
        .expect(201);
      workspaceId = created.body.workspace.id;

      for (const [target, email, role] of [
        [admin, "admin@example.com", "admin"],
        [member, "member@example.com", "member"],
        [viewer, "viewer@example.com", "viewer"],
      ] as const) {
        sendMock.mockClear();
        await request(app)
          .post(`/api/workspaces/${workspaceId}/invitations`)
          .set(headers(owner))
          .send({ email, role })
          .expect(201);
        await vi.waitFor(() => expect(sendMock).toHaveBeenCalled());
        const raw = /accept\?token=([\w-]+)/.exec(sendMock.mock.calls[0]![0].text)![1]!;
        const accepted = await request(app)
          .post("/api/invitations/accept")
          .set(headers(target))
          .send({ token: raw })
          .expect(200);
        expect(accepted.body).toMatchObject({ workspaceId, role, alreadyMember: false });
      }
      expect(await WorkspaceMember.countDocuments({ workspaceId, status: "active" })).toBe(4);

      const monitor = await request(app)
        .post("/api/monitors")
        .set(headers(member, workspaceId))
        .send({
          name: "Shared API",
          url: "https://example.com/health",
          intervalSeconds: 60,
          timeoutMs: 5000,
          expectedStatusCodes: [200],
        })
        .expect(201);
      const monitorId = monitor.body._id as string;
      expect(String(monitor.body.workspaceId)).toBe(workspaceId);
      expect(String(monitor.body.userId)).toBe(String(member));

      for (const reader of [owner, admin, viewer]) {
        const list = await request(app)
          .get("/api/monitors")
          .set(headers(reader, workspaceId))
          .expect(200);
        expect(list.body.items.map((item: { name: string }) => item.name)).toEqual(["Shared API"]);
      }
      const denied = await request(app)
        .patch(`/api/monitors/${monitorId}`)
        .set(headers(viewer, workspaceId))
        .send({ name: "Hacked" });
      expect(denied.status).toBe(403);
      await request(app)
        .delete(`/api/monitors/${monitorId}`)
        .set(headers(viewer, workspaceId))
        .expect(403);
      await request(app)
        .patch(`/api/monitors/${monitorId}`)
        .set(headers(admin, workspaceId))
        .send({ name: "Renamed API" })
        .expect(200);
      await request(app)
        .get(`/api/monitors/${monitorId}`)
        .set(headers(stranger, workspaceId))
        .expect(404);
    });

    it("keeps workspaces isolated even for users who belong to both", async () => {
      const personal = await request(app).get("/api/workspaces").set(headers(owner)).expect(200);
      const own = personal.body.items.find((item: { type: string }) => item.type === "personal");
      const shared = await request(app)
        .get("/api/monitors")
        .set(headers(owner, own.id))
        .expect(200);
      expect(shared.body.items).toEqual([]);
      const incidents = await request(app)
        .get("/api/incidents")
        .set(headers(viewer, workspaceId))
        .expect(200);
      expect(incidents.body.items).toEqual([]);
    });

    it("denies a removed member immediately", async () => {
      const members = await request(app)
        .get(`/api/workspaces/${workspaceId}/members`)
        .set(headers(owner))
        .expect(200);
      const target = members.body.items.find(
        (item: { email: string }) => item.email === "member@example.com",
      );
      await request(app)
        .delete(`/api/workspaces/${workspaceId}/members/${target.id}`)
        .set(headers(admin))
        .expect(200);
      await request(app).get("/api/monitors").set(headers(member, workspaceId)).expect(404);
      await request(app).get(`/api/workspaces/${workspaceId}`).set(headers(member)).expect(404);
    });

    it("records the team history in the audit log", async () => {
      const log = await request(app)
        .get(`/api/workspaces/${workspaceId}/audit-logs?pageSize=50`)
        .set(headers(owner))
        .expect(200);
      const types = log.body.items.map((item: { type: string }) => item.type);
      expect(types).toEqual(
        expect.arrayContaining([
          "workspace.created",
          "member.invited",
          "member.invitation_accepted",
          "member.removed",
        ]),
      );
      await request(app)
        .get(`/api/workspaces/${workspaceId}/audit-logs`)
        .set(headers(viewer))
        .expect(403);
    });
  });

  describe("concurrency", () => {
    it("lets exactly one concurrent acceptance create the membership", async () => {
      const ws = await Workspace.create({
        name: "Race Team",
        slug: "race-team",
        type: "team",
        createdBy: owner,
        ownerId: owner,
      });
      await WorkspaceMember.create({ workspaceId: ws._id, userId: owner, role: "owner" });
      sendMock.mockClear();
      await createInvitation(
        { workspaceId: String(ws._id), userId: String(owner), role: "owner" },
        { email: "stranger@example.com", role: "member" },
      );
      await vi.waitFor(() => expect(sendMock).toHaveBeenCalled());
      const raw = /accept\?token=([\w-]+)/.exec(sendMock.mock.calls[0]![0].text)![1]!;
      const results = await Promise.allSettled(
        Array.from({ length: 6 }, () => acceptInvitation(String(stranger), raw)),
      );
      expect(results.every((result) => result.status === "fulfilled")).toBe(true);
      expect(await WorkspaceMember.countDocuments({ workspaceId: ws._id, userId: stranger })).toBe(
        1,
      );
      expect(
        await WorkspaceAuditEvent.countDocuments({
          workspaceId: ws._id,
          type: "member.invitation_accepted",
        }),
      ).toBe(1);
      const other = await Promise.allSettled([acceptInvitation(String(viewer), raw)]);
      expect(other[0]?.status).toBe("rejected");
    });

    it("serializes concurrent ownership transfers so only one wins", async () => {
      const ws = await Workspace.create({
        name: "Transfer Team",
        slug: "transfer-team",
        type: "team",
        createdBy: owner,
        ownerId: owner,
      });
      for (const [userId, role] of [
        [owner, "owner"],
        [admin, "admin"],
        [member, "member"],
      ] as const) {
        await WorkspaceMember.create({ workspaceId: ws._id, userId, role });
      }
      const ctx = { workspaceId: String(ws._id), userId: String(owner), role: "owner" as const };
      const results = await Promise.allSettled([
        transferOwnership(ctx, { userId: String(admin), password }),
        transferOwnership(ctx, { userId: String(member), password }),
      ]);
      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      const fresh = await Workspace.findById(ws._id);
      expect([String(admin), String(member)]).toContain(String(fresh?.ownerId));
      const effectiveOwners = await WorkspaceMember.find({
        workspaceId: ws._id,
        userId: fresh?.ownerId,
      });
      expect(effectiveOwners).toHaveLength(1);
    });
  });

  describe("purging deleted workspaces", () => {
    it("removes only the purged workspace's data", async () => {
      const doomed = await Workspace.create({
        name: "Doomed",
        slug: "doomed-team",
        type: "team",
        createdBy: owner,
        ownerId: owner,
        status: "deleted",
        purgeAfter: new Date(Date.now() - 1000),
      });
      const safe = await Workspace.create({
        name: "Safe",
        slug: "safe-team",
        type: "team",
        createdBy: owner,
        ownerId: owner,
      });
      const monitorDoc = (workspaceId: Types.ObjectId, name: string) => ({
        userId: owner,
        workspaceId,
        name,
        url: "https://example.com",
        method: "GET",
        intervalSeconds: 60,
        timeoutMs: 5000,
        expectedStatusCodes: [200],
      });
      const doomedMonitor = await Monitor.create(monitorDoc(doomed._id, "Doomed monitor"));
      const safeMonitor = await Monitor.create(monitorDoc(safe._id, "Safe monitor"));
      for (const monitor of [doomedMonitor, safeMonitor]) {
        await MonitorCheck.create({
          monitorId: monitor._id,
          userId: owner,
          runId: `run-${String(monitor._id)}`,
          status: "success",
          completedAt: new Date(),
          expiresAt: new Date(Date.now() + 86_400_000),
        });
      }
      await WorkspaceAuditEvent.create({
        workspaceId: doomed._id,
        actorId: owner,
        type: "workspace.created",
        metadata: {},
      });
      await WorkspaceMember.create({ workspaceId: doomed._id, userId: owner, role: "owner" });

      await purgeWorkspace(String(doomed._id));
      await purgeWorkspace(String(doomed._id));

      expect(await Monitor.countDocuments({ workspaceId: doomed._id })).toBe(0);
      expect(await MonitorCheck.countDocuments({ monitorId: doomedMonitor._id })).toBe(0);
      expect(await WorkspaceMember.countDocuments({ workspaceId: doomed._id })).toBe(0);
      expect(await WorkspaceAuditEvent.countDocuments({ workspaceId: doomed._id })).toBe(0);
      expect(await Monitor.countDocuments({ workspaceId: safe._id })).toBe(1);
      expect(await MonitorCheck.countDocuments({ monitorId: safeMonitor._id })).toBe(1);
      expect((await Workspace.findById(doomed._id))?.purgedAt).toBeInstanceOf(Date);
      expect(await User.countDocuments({ _id: owner })).toBe(1);
    });
  });
});
