import argon2 from "argon2";
import crypto from "node:crypto";
import request from "supertest";
import { Types } from "mongoose";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../src/app.js";
import { sendNotificationEmail } from "../src/lib/email/email.service.js";
import { createAccessToken } from "../src/modules/auth/auth-token.service.js";
import { User } from "../src/modules/auth/user.model.js";
import { Monitor } from "../src/modules/monitors/monitor.model.js";
import { PublicStatusPage } from "../src/modules/status-pages/status-page.model.js";
import { WorkspaceAuditEvent } from "../src/modules/workspaces/workspace-audit.model.js";
import { WorkspaceInvitation } from "../src/modules/workspaces/workspace-invitation.model.js";
import { hashInvitationToken } from "../src/modules/workspaces/invitation.service.js";
import { bindMemoryModel } from "./helpers/memory-model.js";
import {
  bindWorkspaceModels,
  resetWorkspaceModels,
  seedWorkspace,
} from "./helpers/workspace-fixtures.js";

const state = vi.hoisted(() => {
  const counts = new Map<string, number>();
  return {
    counts,
    events: [] as Array<{ type: string; payload: Record<string, unknown> }>,
    client: {
      status: "ready",
      incr: async (key: string) => {
        counts.set(key, (counts.get(key) ?? 0) + 1);
        return counts.get(key) as number;
      },
      expire: async () => 1,
    },
  };
});

vi.mock("../src/lib/redis/redis.service.js", () => ({
  acquireLock: vi.fn().mockResolvedValue(true),
  releaseLock: vi.fn().mockResolvedValue(true),
  publishDomainEvent: vi.fn(async (type: string, payload: Record<string, unknown>) => {
    state.events.push({ type, payload });
  }),
  closeRedisConnections: vi.fn(),
  getRedisClient: () => state.client,
  createRedisConnection: vi.fn(),
}));

vi.mock("../src/queues/monitor-scheduler.service.js", () => ({
  scheduleMonitor: vi.fn(),
  unscheduleMonitor: vi.fn().mockResolvedValue(undefined),
  enqueueImmediateCheck: vi.fn(),
  reconcileSchedulers: vi.fn(),
}));

vi.mock("../src/lib/email/email.service.js", () => ({
  sendNotificationEmail: vi.fn().mockResolvedValue({ ok: true, responseCode: 200, durationMs: 3 }),
}));

const sendMock = vi.mocked(sendNotificationEmail);
const stores = bindWorkspaceModels();
const users = bindMemoryModel(User);
const invitations = bindMemoryModel(WorkspaceInvitation);
const audit = bindMemoryModel(WorkspaceAuditEvent);
const monitors = bindMemoryModel(Monitor);
const pages = bindMemoryModel(PublicStatusPage);

const ids = {
  owner: new Types.ObjectId(),
  admin: new Types.ObjectId(),
  member: new Types.ObjectId(),
  viewer: new Types.ObjectId(),
  outsider: new Types.ObjectId(),
  invitee: new Types.ObjectId(),
};
const token = (id: Types.ObjectId) => createAccessToken(String(id));
const auth = (id: Types.ObjectId) => ({ Authorization: `Bearer ${token(id)}` });
const password = "CorrectHorse1!";
let passwordHash = "";
let workspaceId: Types.ObjectId;

const userDoc = (id: Types.ObjectId, name: string, email: string, verified = true) => ({
  _id: id,
  name,
  email,
  passwordHash,
  emailVerifiedAt: verified ? new Date() : null,
  createdAt: new Date(),
  updatedAt: new Date(),
});

const invitationToken = (call = -1) => {
  const text = sendMock.mock.calls.at(call)?.[0].text ?? "";
  const match = /accept\?token=([\w-]+)/.exec(text);
  if (!match?.[1]) throw new Error("no invitation token in email");
  return match[1];
};

const invite = (as: Types.ObjectId, body: Record<string, unknown>, wid = workspaceId) =>
  request(app).post(`/api/workspaces/${wid}/invitations`).set(auth(as)).send(body);

const flush = () => vi.waitFor(() => expect(sendMock).toHaveBeenCalled());

beforeEach(async () => {
  resetWorkspaceModels(stores);
  [users, invitations, audit, monitors, pages].forEach((store) => store.reset());
  state.counts.clear();
  state.events.length = 0;
  sendMock.mockClear();
  passwordHash ||= await argon2.hash(password, { type: argon2.argon2id });
  users.docs.push(
    userDoc(ids.owner, "Olivia Owner", "owner@example.com"),
    userDoc(ids.admin, "Adam Admin", "admin@example.com"),
    userDoc(ids.member, "Maya Member", "member@example.com"),
    userDoc(ids.viewer, "Victor Viewer", "viewer@example.com"),
    userDoc(ids.outsider, "Oscar Outsider", "outsider@example.com"),
    userDoc(ids.invitee, "Ivy Invitee", "invitee@example.com"),
  );
  workspaceId = seedWorkspace(stores, {
    ownerId: ids.owner,
    name: "Acme Team",
    members: [
      { userId: ids.admin, role: "admin" },
      { userId: ids.member, role: "member" },
      { userId: ids.viewer, role: "viewer" },
    ],
  });
});

describe("workspace listing and access", () => {
  it("requires authentication", async () => {
    await request(app).get("/api/workspaces").expect(401);
    await request(app).get(`/api/workspaces/${workspaceId}`).expect(401);
  });

  it("lists each user's own workspaces with their role", async () => {
    const response = await request(app).get("/api/workspaces").set(auth(ids.member)).expect(200);
    expect(response.body.items).toHaveLength(1);
    expect(response.body.items[0]).toMatchObject({
      id: String(workspaceId),
      name: "Acme Team",
      type: "team",
      role: "member",
      ownerName: "Olivia Owner",
      memberCount: 4,
    });
    expect(
      (await request(app).get("/api/workspaces").set(auth(ids.outsider)).expect(200)).body.items,
    ).toEqual([]);
  });

  it("returns workspace details with the server's permission list for the caller's role", async () => {
    const owner = await request(app)
      .get(`/api/workspaces/${workspaceId}`)
      .set(auth(ids.owner))
      .expect(200);
    expect(owner.body.workspace).toMatchObject({
      name: "Acme Team",
      role: "owner",
      memberCount: 4,
      pendingInvitationCount: 0,
      owner: { name: "Olivia Owner", email: "owner@example.com" },
    });
    expect(owner.body.permissions).toContain("workspace:delete");
    const viewer = await request(app)
      .get(`/api/workspaces/${workspaceId}`)
      .set(auth(ids.viewer))
      .expect(200);
    expect(viewer.body.permissions).not.toContain("monitors:write");
    expect(viewer.body.permissions).toContain("monitors:view");
  });

  it("answers identically for non-members and unknown workspaces", async () => {
    const outsider = await request(app)
      .get(`/api/workspaces/${workspaceId}`)
      .set(auth(ids.outsider));
    const unknown = await request(app)
      .get(`/api/workspaces/${new Types.ObjectId()}`)
      .set(auth(ids.outsider));
    expect(outsider.status).toBe(404);
    expect(outsider.body).toEqual(unknown.body);
    expect(outsider.body.code).toBe("WORKSPACE_NOT_FOUND");
  });

  it("creates team workspaces with the creator as owner and records an audit event", async () => {
    const response = await request(app)
      .post("/api/workspaces")
      .set(auth(ids.outsider))
      .send({ name: "Side Project" })
      .expect(201);
    expect(response.body.workspace).toMatchObject({
      name: "Side Project",
      type: "team",
      role: "owner",
      memberCount: 1,
    });
    expect(audit.docs.some((doc) => doc.type === "workspace.created")).toBe(true);
    const list = await request(app).get("/api/workspaces").set(auth(ids.outsider)).expect(200);
    expect(list.body.items).toHaveLength(1);
  });

  it("validates workspace names", async () => {
    for (const body of [
      { name: "A" },
      { name: "x".repeat(61) },
      { name: "<b>x</b>" },
      {},
      { name: "Ok", type: "personal" },
    ]) {
      await request(app).post("/api/workspaces").set(auth(ids.outsider)).send(body).expect(400);
    }
  });

  it("limits the number of workspaces per user", async () => {
    for (let index = 0; index < 20; index += 1) {
      seedWorkspace(stores, { ownerId: ids.outsider, name: `Workspace ${index}` });
    }
    const response = await request(app)
      .post("/api/workspaces")
      .set(auth(ids.outsider))
      .send({ name: "One more" });
    expect(response.status).toBe(409);
    expect(response.body.code).toBe("WORKSPACE_LIMIT_REACHED");
  });
});

describe("workspace settings", () => {
  const rename = (as: Types.ObjectId, name = "Renamed Team") =>
    request(app).patch(`/api/workspaces/${workspaceId}`).set(auth(as)).send({ name });

  it("lets owners and admins rename, and records audit and realtime events", async () => {
    await rename(ids.admin).expect(200);
    expect(stores.workspaces.docs[0]?.name).toBe("Renamed Team");
    expect(
      audit.docs.find((doc) => doc.type === "workspace.settings_updated")?.metadata,
    ).toMatchObject({
      from: "Acme Team",
      to: "Renamed Team",
    });
    expect(
      state.events.some(
        (event) =>
          event.type === "workspace.settings_updated" &&
          event.payload.workspaceId === String(workspaceId),
      ),
    ).toBe(true);
    await rename(ids.owner, "Final Name").expect(200);
  });

  it("forbids members and viewers server-side", async () => {
    for (const actor of [ids.member, ids.viewer]) {
      const response = await rename(actor);
      expect(response.status).toBe(403);
      expect(response.body.code).toBe("INSUFFICIENT_PERMISSIONS");
    }
    expect(stores.workspaces.docs[0]?.name).toBe("Acme Team");
    await rename(ids.outsider).expect(404);
  });
});

describe("members", () => {
  const members = (as = ids.owner) =>
    request(app).get(`/api/workspaces/${workspaceId}/members`).set(auth(as));
  const memberId = (userId: Types.ObjectId) =>
    String(stores.members.docs.find((doc) => String(doc.userId) === String(userId))?._id);
  const setRole = (as: Types.ObjectId, target: Types.ObjectId, role: unknown) =>
    request(app)
      .patch(`/api/workspaces/${workspaceId}/members/${memberId(target)}`)
      .set(auth(as))
      .send({ role });
  const remove = (as: Types.ObjectId, target: Types.ObjectId) =>
    request(app)
      .delete(`/api/workspaces/${workspaceId}/members/${memberId(target)}`)
      .set(auth(as));

  it("lets every member view the roster without secrets", async () => {
    const response = await members(ids.viewer).expect(200);
    expect(response.body.items.map((item: { role: string }) => item.role)).toEqual([
      "owner",
      "admin",
      "member",
      "viewer",
    ]);
    expect(response.body.items.find((item: { isSelf: boolean }) => item.isSelf)?.email).toBe(
      "viewer@example.com",
    );
    expect(JSON.stringify(response.body)).not.toMatch(/passwordHash|argon2/);
    await members(ids.outsider).expect(404);
  });

  it("changes roles for owners and admins and notifies the member", async () => {
    const response = await setRole(ids.admin, ids.member, "viewer").expect(200);
    expect(response.body.member.role).toBe("viewer");
    expect(audit.docs.find((doc) => doc.type === "member.role_changed")?.metadata).toEqual({
      from: "member",
      to: "viewer",
    });
    expect(
      state.events.some(
        (event) =>
          event.type === "workspace.role_changed" &&
          (event.payload.payload as { role?: string }).role === "viewer",
      ),
    ).toBe(true);
    await setRole(ids.owner, ids.viewer, "admin").expect(200);
  });

  it("never lets anyone assign owner through role changes", async () => {
    for (const actor of [ids.owner, ids.admin]) {
      const response = await setRole(actor, ids.member, "owner");
      expect(response.status).toBe(400);
    }
    expect(stores.members.docs.filter((doc) => doc.role === "owner")).toHaveLength(1);
  });

  it("protects the owner and prevents self role changes", async () => {
    const demote = await setRole(ids.admin, ids.owner, "viewer");
    expect(demote.status).toBe(403);
    expect(demote.body.code).toBe("OWNER_PROTECTED");
    expect((await setRole(ids.admin, ids.admin, "member")).status).toBe(400);
    expect((await setRole(ids.owner, ids.member, "member")).status).toBe(400);
    expect((await remove(ids.admin, ids.owner)).body.code).toBe("OWNER_PROTECTED");
    expect(
      stores.members.docs.find((doc) => String(doc.userId) === String(ids.owner))?.status,
    ).toBe("active");
  });

  it("forbids members and viewers from managing roles or removing people", async () => {
    for (const actor of [ids.member, ids.viewer]) {
      expect((await setRole(actor, ids.viewer, "admin")).status).toBe(403);
      expect((await remove(actor, ids.viewer)).status).toBe(403);
    }
    expect(stores.members.docs.every((doc) => doc.status === "active")).toBe(true);
  });

  it("revokes access immediately when a member is removed", async () => {
    await request(app).get(`/api/workspaces/${workspaceId}`).set(auth(ids.member)).expect(200);
    await remove(ids.admin, ids.member).expect(200);
    const after = await request(app).get(`/api/workspaces/${workspaceId}`).set(auth(ids.member));
    expect(after.status).toBe(404);
    expect(after.body.code).toBe("WORKSPACE_NOT_FOUND");
    expect((await request(app).get("/api/workspaces").set(auth(ids.member))).body.items).toEqual(
      [],
    );
    expect(audit.docs.some((doc) => doc.type === "member.removed")).toBe(true);
    expect(
      state.events.some(
        (event) =>
          event.type === "workspace.access_revoked" &&
          (event.payload.payload as { workspaceId?: string }).workspaceId === String(workspaceId),
      ),
    ).toBe(true);
    await remove(ids.admin, ids.member).expect(404);
  });

  it("lets members leave but not owners or personal workspace users", async () => {
    await request(app)
      .post(`/api/workspaces/${workspaceId}/leave`)
      .set(auth(ids.member))
      .expect(200);
    await request(app).get(`/api/workspaces/${workspaceId}`).set(auth(ids.member)).expect(404);
    const owner = await request(app)
      .post(`/api/workspaces/${workspaceId}/leave`)
      .set(auth(ids.owner));
    expect(owner.status).toBe(409);
    expect(owner.body.code).toBe("OWNER_PROTECTED");
    const personal = seedWorkspace(stores, { ownerId: ids.outsider, type: "personal" });
    const response = await request(app)
      .post(`/api/workspaces/${personal}/leave`)
      .set(auth(ids.outsider));
    expect(response.body.code).toBe("PERSONAL_WORKSPACE");
  });
});

describe("invitations", () => {
  it("lets owners and admins invite with a hashed single-use token and a branded email", async () => {
    const response = await invite(ids.admin, {
      email: "New.Person@Example.com",
      role: "member",
      message: "Join us",
    }).expect(201);
    expect(response.body.invitation).toMatchObject({
      email: "new.person@example.com",
      role: "member",
      status: "pending",
      invitedBy: { name: "Adam Admin" },
      message: "Join us",
    });
    await flush();
    const message = sendMock.mock.calls[0]![0];
    expect(message.to).toBe("new.person@example.com");
    expect(message.subject).toBe("You've been invited to join a FaultLine workspace");
    expect(message.html).toContain("Acme Team");
    expect(message.html).toContain("Adam Admin");
    expect(message.text).toContain("https://app.faultline.test/invitations/accept?token=");
    const raw = invitationToken();
    const stored = invitations.docs[0] as unknown as { tokenHash: string };
    expect(stored.tokenHash).toBe(hashInvitationToken(raw));
    expect(JSON.stringify(invitations.docs)).not.toContain(raw);
    expect(raw.length).toBeGreaterThanOrEqual(43);
    expect(audit.docs.some((doc) => doc.type === "member.invited")).toBe(true);
  });

  it("escapes user-controlled values in the email", async () => {
    users.docs.find((doc) => String(doc._id) === String(ids.admin))!.name =
      "<script>alert(1)</script>";
    stores.workspaces.docs[0]!.name = "Team <img src=x>";
    await invite(ids.admin, { email: "x@example.com", role: "viewer", message: "hi" }).expect(201);
    await flush();
    const html = sendMock.mock.calls[0]![0].html;
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).not.toContain("<img src=x>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("prohibits owner invitations and validates input", async () => {
    for (const body of [
      { email: "a@example.com", role: "owner" },
      { email: "not-an-email", role: "member" },
      { email: "a@example.com", role: "superuser" },
      { email: "a@example.com", role: "member", message: "x".repeat(501) },
      { email: "a@example.com", role: "member", message: "<b>x</b>" },
      { role: "member" },
    ]) {
      await invite(ids.owner, body).expect(400);
    }
    expect(invitations.docs).toHaveLength(0);
  });

  it("forbids members, viewers and outsiders", async () => {
    for (const actor of [ids.member, ids.viewer]) {
      expect((await invite(actor, { email: "a@example.com", role: "member" })).status).toBe(403);
    }
    expect((await invite(ids.outsider, { email: "a@example.com", role: "member" })).status).toBe(
      404,
    );
    expect(invitations.docs).toHaveLength(0);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("prevents duplicate pending invitations and invitations to existing members", async () => {
    await invite(ids.owner, { email: "dup@example.com", role: "member" }).expect(201);
    const duplicate = await invite(ids.owner, { email: "DUP@example.com", role: "admin" });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.code).toBe("INVITATION_EXISTS");
    const existing = await invite(ids.owner, { email: "member@example.com", role: "viewer" });
    expect(existing.status).toBe(409);
    expect(existing.body.code).toBe("ALREADY_MEMBER");
    expect(invitations.docs).toHaveLength(1);
  });

  it("refreshes an expired pending invitation instead of duplicating it", async () => {
    await invite(ids.owner, { email: "late@example.com", role: "member" }).expect(201);
    invitations.docs[0]!.expiresAt = new Date(Date.now() - 1000);
    const again = await invite(ids.owner, { email: "late@example.com", role: "viewer" }).expect(
      201,
    );
    expect(invitations.docs).toHaveLength(1);
    expect(again.body.invitation.status).toBe("pending");
    expect(again.body.invitation.role).toBe("viewer");
  });

  it("lists pending, expired and all invitations with sender and expiry", async () => {
    await invite(ids.owner, { email: "a@example.com", role: "member" }).expect(201);
    await invite(ids.admin, { email: "b@example.com", role: "viewer" }).expect(201);
    invitations.docs[0]!.expiresAt = new Date(Date.now() - 1000);
    const list = (status: string) =>
      request(app)
        .get(`/api/workspaces/${workspaceId}/invitations?status=${status}`)
        .set(auth(ids.admin));
    expect((await list("pending")).body.items.map((item: { email: string }) => item.email)).toEqual(
      ["b@example.com"],
    );
    const expired = (await list("expired")).body.items;
    expect(expired.map((item: { email: string }) => item.email)).toEqual(["a@example.com"]);
    expect(expired[0].status).toBe("expired");
    expect((await list("all")).body.items).toHaveLength(2);
    expect((await list("pending")).body.items[0]).toMatchObject({
      invitedBy: { name: "Adam Admin" },
    });
    expect(JSON.stringify((await list("all")).body)).not.toMatch(/tokenHash/);
    await request(app)
      .get(`/api/workspaces/${workspaceId}/invitations`)
      .set(auth(ids.member))
      .expect(403);
  });

  it("resends with a fresh token, honours the cooldown and invalidates the old link", async () => {
    await invite(ids.owner, { email: "r@example.com", role: "member" }).expect(201);
    await flush();
    const first = invitationToken();
    const id = String(invitations.docs[0]!._id);
    const resend = () =>
      request(app)
        .post(`/api/workspaces/${workspaceId}/invitations/${id}/resend`)
        .set(auth(ids.owner));
    expect((await resend()).status).toBe(429);
    invitations.docs[0]!.lastSentAt = new Date(Date.now() - 120_000);
    await resend().expect(200);
    await vi.waitFor(() => expect(sendMock).toHaveBeenCalledTimes(2));
    const second = invitationToken();
    expect(second).not.toBe(first);
    expect(
      (await request(app).get("/api/invitations/validate").query({ token: first })).status,
    ).toBe(400);
    expect(
      (await request(app).get("/api/invitations/validate").query({ token: second })).status,
    ).toBe(200);
    expect(audit.docs.some((doc) => doc.type === "member.invitation_resent")).toBe(true);
  });

  it("revokes invitations and makes the link unusable", async () => {
    await invite(ids.owner, { email: "v@example.com", role: "member" }).expect(201);
    await flush();
    const raw = invitationToken();
    const id = String(invitations.docs[0]!._id);
    await request(app)
      .post(`/api/workspaces/${workspaceId}/invitations/${id}/revoke`)
      .set(auth(ids.member))
      .expect(403);
    const revoked = await request(app)
      .post(`/api/workspaces/${workspaceId}/invitations/${id}/revoke`)
      .set(auth(ids.admin))
      .expect(200);
    expect(revoked.body.invitation.status).toBe("revoked");
    expect((await request(app).get("/api/invitations/validate").query({ token: raw })).status).toBe(
      400,
    );
    await request(app)
      .post(`/api/workspaces/${workspaceId}/invitations/${id}/revoke`)
      .set(auth(ids.admin))
      .expect(404);
  });

  it("does not let another workspace's admins manage this workspace's invitations", async () => {
    await invite(ids.owner, { email: "iso@example.com", role: "member" }).expect(201);
    const other = seedWorkspace(stores, { ownerId: ids.outsider });
    const id = String(invitations.docs[0]!._id);
    await request(app)
      .post(`/api/workspaces/${other}/invitations/${id}/revoke`)
      .set(auth(ids.outsider))
      .expect(404);
    expect(invitations.docs[0]?.status).toBe("pending");
  });
});

describe("accepting invitations", () => {
  const send = async (email: string, role = "member") => {
    sendMock.mockClear();
    await invite(ids.owner, { email, role }).expect(201);
    await flush();
    return invitationToken();
  };
  const accept = (as: Types.ObjectId, raw: string) =>
    request(app).post("/api/invitations/accept").set(auth(as)).send({ token: raw });

  it("validates a token without authentication and reveals only safe details", async () => {
    const raw = await send("invitee@example.com", "viewer");
    const response = await request(app)
      .get("/api/invitations/validate")
      .query({ token: raw })
      .expect(200);
    expect(response.body).toMatchObject({
      workspaceName: "Acme Team",
      inviterName: "Olivia Owner",
      role: "viewer",
      emailMasked: "i******@example.com",
    });
    expect(JSON.stringify(response.body)).not.toContain("invitee@example.com");
  });

  it("returns the same generic error for invalid, expired, revoked and accepted tokens", async () => {
    const expiredToken = await send("a@example.com");
    invitations.docs[0]!.expiresAt = new Date(Date.now() - 1000);
    const revokedToken = await send("b@example.com");
    invitations.docs[1]!.status = "revoked";
    const acceptedToken = await send("invitee@example.com");
    await accept(ids.invitee, acceptedToken).expect(200);
    const bodies = [];
    for (const raw of ["x".repeat(43), expiredToken, revokedToken, acceptedToken]) {
      const response = await request(app).get("/api/invitations/validate").query({ token: raw });
      expect(response.status).toBe(400);
      bodies.push(JSON.stringify(response.body));
    }
    expect(new Set(bodies).size).toBe(1);
    await request(app).get("/api/invitations/validate").query({ token: "short" }).expect(400);
  });

  it("creates a membership with the invited role for the matching verified account", async () => {
    const raw = await send("invitee@example.com", "viewer");
    await request(app).post("/api/invitations/accept").send({ token: raw }).expect(401);
    const response = await accept(ids.invitee, raw).expect(200);
    expect(response.body).toEqual({
      workspaceId: String(workspaceId),
      role: "viewer",
      alreadyMember: false,
    });
    const member = stores.members.docs.find((doc) => String(doc.userId) === String(ids.invitee));
    expect(member).toMatchObject({ role: "viewer", status: "active" });
    expect(invitations.docs[0]).toMatchObject({ status: "accepted" });
    expect(String(invitations.docs[0]?.acceptedBy)).toBe(String(ids.invitee));
    expect(audit.docs.some((doc) => doc.type === "member.invitation_accepted")).toBe(true);
    expect(state.events.some((event) => event.type === "workspace.member.accepted")).toBe(true);
    await request(app)
      .get(`/api/workspaces/${workspaceId}/members`)
      .set(auth(ids.invitee))
      .expect(200);
    await request(app)
      .post(`/api/workspaces/${workspaceId}/invitations`)
      .set(auth(ids.invitee))
      .send({ email: "z@example.com", role: "member" })
      .expect(403);
  });

  it("rejects an account whose email differs, without consuming the invitation", async () => {
    const raw = await send("invitee@example.com");
    const response = await accept(ids.outsider, raw);
    expect(response.status).toBe(403);
    expect(response.body.code).toBe("EMAIL_MISMATCH");
    expect(response.body.data.expectedEmailMasked).toBe("i******@example.com");
    expect(invitations.docs[0]?.status).toBe("pending");
    expect(stores.members.docs.some((doc) => String(doc.userId) === String(ids.outsider))).toBe(
      false,
    );
    await accept(ids.invitee, raw).expect(200);
  });

  it("requires a verified email address", async () => {
    users.docs.find((doc) => String(doc._id) === String(ids.invitee))!.emailVerifiedAt = null;
    const raw = await send("invitee@example.com");
    const response = await accept(ids.invitee, raw);
    expect(response.status).toBe(403);
    expect(response.body.code).toBe("EMAIL_NOT_VERIFIED");
    expect(invitations.docs[0]?.status).toBe("pending");
  });

  it("is single use and rejects expired or revoked invitations", async () => {
    const raw = await send("invitee@example.com");
    await accept(ids.invitee, raw).expect(200);
    const reuse = await accept(ids.outsider, raw);
    expect(reuse.status).toBe(400);
    expect(reuse.body.code).toBe("INVITATION_INVALID");

    const second = await send("outsider@example.com");
    invitations.docs.at(-1)!.expiresAt = new Date(Date.now() - 1000);
    expect((await accept(ids.outsider, second)).status).toBe(400);
    expect(stores.members.docs.some((doc) => String(doc.userId) === String(ids.outsider))).toBe(
      false,
    );
  });

  it("is idempotent for the same user and keeps a single membership under concurrent acceptance", async () => {
    const raw = await send("invitee@example.com");
    const results = await Promise.all([
      accept(ids.invitee, raw),
      accept(ids.invitee, raw),
      accept(ids.invitee, raw),
    ]);
    expect(results.every((result) => result.status === 200)).toBe(true);
    expect(
      stores.members.docs.filter((doc) => String(doc.userId) === String(ids.invitee)),
    ).toHaveLength(1);
    expect(audit.docs.filter((doc) => doc.type === "member.invitation_accepted")).toHaveLength(1);
  });

  it("keeps an existing member's role and reactivates removed members with the invited role", async () => {
    const raw = await send("invitee@example.com", "admin");
    stores.members.docs.push({
      _id: new Types.ObjectId(),
      workspaceId,
      userId: ids.invitee,
      role: "viewer",
      status: "active",
      joinedAt: new Date(),
    });
    const existing = await accept(ids.invitee, raw).expect(200);
    expect(existing.body).toMatchObject({ alreadyMember: true, role: "viewer" });

    stores.members.docs.find((doc) => String(doc.userId) === String(ids.viewer))!.status =
      "removed";
    const again = await send("viewer@example.com", "admin");
    const rejoined = await accept(ids.viewer, again).expect(200);
    expect(rejoined.body).toMatchObject({ alreadyMember: false, role: "admin" });
    expect(
      stores.members.docs.filter((doc) => String(doc.userId) === String(ids.viewer)),
    ).toHaveLength(1);
  });

  it("does not accept invitations for deleted workspaces", async () => {
    const raw = await send("invitee@example.com");
    stores.workspaces.docs[0]!.status = "deleted";
    expect((await accept(ids.invitee, raw)).status).toBe(400);
    expect((await request(app).get("/api/invitations/validate").query({ token: raw })).status).toBe(
      400,
    );
  });
});

describe("ownership transfer", () => {
  const transfer = (as: Types.ObjectId, body: Record<string, unknown>) =>
    request(app).post(`/api/workspaces/${workspaceId}/transfer-ownership`).set(auth(as)).send(body);

  it("only lets the owner transfer ownership", async () => {
    for (const actor of [ids.admin, ids.member, ids.viewer]) {
      const response = await transfer(actor, { userId: String(ids.admin), password });
      expect(response.status).toBe(403);
      expect(response.body.code).toBe("INSUFFICIENT_PERMISSIONS");
    }
    expect(String(stores.workspaces.docs[0]?.ownerId)).toBe(String(ids.owner));
  });

  it("requires the correct password and an existing active member", async () => {
    const wrong = await transfer(ids.owner, {
      userId: String(ids.admin),
      password: "WrongPassword1!",
    });
    expect(wrong.status).toBe(400);
    expect(wrong.body.code).toBe("REAUTHENTICATION_REQUIRED");
    expect((await transfer(ids.owner, { userId: String(ids.outsider), password })).body.code).toBe(
      "MEMBER_NOT_FOUND",
    );
    expect((await transfer(ids.owner, { userId: String(ids.owner), password })).status).toBe(400);
    expect(String(stores.workspaces.docs[0]?.ownerId)).toBe(String(ids.owner));
  });

  it("promotes the new owner, demotes the previous one and records the change", async () => {
    const response = await transfer(ids.owner, { userId: String(ids.admin), password }).expect(200);
    expect(response.body.workspace.owner.name).toBe("Adam Admin");
    expect(String(stores.workspaces.docs[0]?.ownerId)).toBe(String(ids.admin));
    const role = (userId: Types.ObjectId) =>
      stores.members.docs.find((doc) => String(doc.userId) === String(userId))?.role;
    expect(role(ids.admin)).toBe("owner");
    expect(role(ids.owner)).toBe("admin");
    expect(audit.docs.some((doc) => doc.type === "workspace.ownership_transferred")).toBe(true);
    const former = await request(app)
      .get(`/api/workspaces/${workspaceId}`)
      .set(auth(ids.owner))
      .expect(200);
    expect(former.body.workspace.role).toBe("admin");
    expect((await transfer(ids.owner, { userId: String(ids.member), password })).status).toBe(403);
    await request(app)
      .delete(`/api/workspaces/${workspaceId}`)
      .set(auth(ids.owner))
      .send({ confirmName: "Acme Team", password })
      .expect(403);
  });

  it("never leaves the workspace without exactly one effective owner, even for concurrent transfers", async () => {
    const results = await Promise.all([
      transfer(ids.owner, { userId: String(ids.admin), password }),
      transfer(ids.owner, { userId: String(ids.member), password }),
    ]);
    const statuses = results.map((result) => result.status).sort();
    expect(statuses[0]).toBe(200);
    expect([403, 409]).toContain(statuses[1]);
    const owners = stores.members.docs.filter(
      (doc) => String(doc.userId) === String(stores.workspaces.docs[0]?.ownerId),
    );
    expect(owners).toHaveLength(1);
  });

  it("does not allow transferring a personal workspace", async () => {
    const personal = seedWorkspace(stores, {
      ownerId: ids.outsider,
      type: "personal",
      members: [{ userId: ids.viewer, role: "member" }],
    });
    const response = await request(app)
      .post(`/api/workspaces/${personal}/transfer-ownership`)
      .set(auth(ids.outsider))
      .send({ userId: String(ids.viewer), password });
    expect(response.body.code).toBe("PERSONAL_WORKSPACE");
  });
});

describe("workspace deletion", () => {
  const remove = (as: Types.ObjectId, body: Record<string, unknown>, wid = workspaceId) =>
    request(app).delete(`/api/workspaces/${wid}`).set(auth(as)).send(body);

  it("only lets the owner delete, with the exact name and password", async () => {
    for (const actor of [ids.admin, ids.member, ids.viewer]) {
      expect((await remove(actor, { confirmName: "Acme Team", password })).status).toBe(403);
    }
    expect((await remove(ids.owner, { confirmName: "acme team", password })).status).toBe(400);
    expect(
      (await remove(ids.owner, { confirmName: "Acme Team", password: "WrongPassword1!" })).body
        .code,
    ).toBe("REAUTHENTICATION_REQUIRED");
    expect(stores.workspaces.docs[0]?.status).toBe("active");
  });

  it("soft-deletes, stops monitoring, unpublishes pages, revokes invitations and denies access", async () => {
    monitors.docs.push({ _id: new Types.ObjectId(), workspaceId, userId: ids.owner, active: true });
    pages.docs.push({ _id: new Types.ObjectId(), workspaceId, slug: "acme", status: "published" });
    await invite(ids.owner, { email: "pending@example.com", role: "member" }).expect(201);
    const response = await remove(ids.owner, { confirmName: "Acme Team", password }).expect(200);
    expect(response.body.status).toBe("deleted");
    expect(new Date(response.body.purgeAfter).getTime()).toBeGreaterThan(
      Date.now() + 29 * 86_400_000,
    );
    expect(stores.workspaces.docs[0]).toMatchObject({ status: "deleted" });
    expect(monitors.docs[0]?.active).toBe(false);
    expect(pages.docs[0]?.status).toBe("unpublished");
    expect(invitations.docs[0]?.status).toBe("revoked");
    expect(audit.docs.some((doc) => doc.type === "workspace.deleted")).toBe(true);
    expect(state.events.some((event) => event.type === "workspace.deleted")).toBe(true);
    for (const actor of [ids.owner, ids.admin, ids.member]) {
      expect(
        (await request(app).get(`/api/workspaces/${workspaceId}`).set(auth(actor))).status,
      ).toBe(404);
    }
    expect((await request(app).get("/api/workspaces").set(auth(ids.owner))).body.items).toEqual([]);
    expect((await remove(ids.owner, { confirmName: "Acme Team", password })).status).toBe(404);
  });

  it("does not touch other workspaces or let the personal workspace be deleted", async () => {
    const other = seedWorkspace(stores, { ownerId: ids.outsider, name: "Other" });
    monitors.docs.push({
      _id: new Types.ObjectId(),
      workspaceId: other,
      userId: ids.outsider,
      active: true,
    });
    await remove(ids.owner, { confirmName: "Acme Team", password }).expect(200);
    expect(monitors.docs[0]?.active).toBe(true);
    const personal = seedWorkspace(stores, {
      ownerId: ids.admin,
      type: "personal",
      name: "Adam's Workspace",
    });
    const response = await remove(
      ids.admin,
      { confirmName: "Adam's Workspace", password },
      personal,
    );
    expect(response.body.code).toBe("PERSONAL_WORKSPACE");
  });
});

describe("audit log", () => {
  const log = (as: Types.ObjectId, query = "") =>
    request(app).get(`/api/workspaces/${workspaceId}/audit-logs${query}`).set(auth(as));

  beforeEach(async () => {
    await request(app)
      .patch(`/api/workspaces/${workspaceId}`)
      .set(auth(ids.owner))
      .send({ name: "Acme Two" });
    await invite(ids.owner, { email: "log@example.com", role: "viewer" });
    await request(app)
      .patch(
        `/api/workspaces/${workspaceId}/members/${stores.members.docs.find((doc) => String(doc.userId) === String(ids.member))!._id}`,
      )
      .set(auth(ids.owner))
      .send({ role: "viewer" });
  });

  it("is limited to owners and admins", async () => {
    await log(ids.owner).expect(200);
    await log(ids.admin).expect(200);
    for (const actor of [ids.member, ids.viewer]) expect((await log(actor)).status).toBe(403);
    expect((await log(ids.outsider)).status).toBe(404);
  });

  it("lists events newest first with names, filters and pagination", async () => {
    const all = await log(ids.owner).expect(200);
    expect(all.body.total).toBe(3);
    expect(all.body.items[0]).toMatchObject({
      type: "member.role_changed",
      actor: { name: "Olivia Owner" },
      target: { name: "Maya Member" },
    });
    expect(JSON.stringify(all.body)).not.toMatch(/token|password|secret/i);
    const filtered = await log(ids.owner, "?type=member.invited").expect(200);
    expect(filtered.body.items.map((item: { type: string }) => item.type)).toEqual([
      "member.invited",
    ]);
    const page = await log(ids.owner, "?page=2&pageSize=2").expect(200);
    expect(page.body).toMatchObject({ page: 2, pageSize: 2, total: 3, totalPages: 2 });
    expect(page.body.items).toHaveLength(1);
    await log(ids.owner, "?pageSize=500").expect(400);
  });

  it("is scoped to the workspace and offers no way to modify entries", async () => {
    const other = seedWorkspace(stores, { ownerId: ids.outsider });
    audit.docs.push({
      _id: new Types.ObjectId(),
      workspaceId: other,
      actorId: ids.outsider,
      type: "workspace.created",
      metadata: {},
      createdAt: new Date(),
    });
    expect((await log(ids.owner)).body.total).toBe(3);
    const id = String(audit.docs[0]!._id);
    for (const method of ["patch", "put", "delete"] as const) {
      const response = await request(app)
        [method](`/api/workspaces/${workspaceId}/audit-logs/${id}`)
        .set(auth(ids.owner));
      expect(response.status).toBe(404);
    }
    expect(audit.docs).toHaveLength(4);
  });

  it("never stores invitation tokens in audit metadata", async () => {
    const raw = invitationToken(0);
    expect(JSON.stringify(audit.docs)).not.toContain(raw);
    expect(crypto.createHash("sha256").update(raw).digest("hex")).toHaveLength(64);
  });
});
