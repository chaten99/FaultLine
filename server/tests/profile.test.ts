import argon2 from "argon2";
import request from "supertest";
import { Types } from "mongoose";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../src/app.js";
import { createAccessToken } from "../src/modules/auth/auth-token.service.js";
import { describeDevice } from "../src/modules/auth/device-label.js";
import { RefreshTokenFamily } from "../src/modules/auth/refresh-token-family.model.js";
import { issueRefreshToken } from "../src/modules/auth/refresh-token.service.js";
import { currentFamilyId } from "../src/modules/auth/session.service.js";
import { User } from "../src/modules/auth/user.model.js";
import { Incident } from "../src/modules/incidents/incident.model.js";
import { Monitor } from "../src/modules/monitors/monitor.model.js";
import { bindMemoryModel } from "./helpers/memory-model.js";

const redis = vi.hoisted(() => {
  const counts = new Map<string, number>();
  return {
    counts,
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
  publishDomainEvent: vi.fn(),
  closeRedisConnections: vi.fn(),
  getRedisClient: () => redis.client,
  createRedisConnection: vi.fn(),
}));

const users = bindMemoryModel(User);
const families = bindMemoryModel(RefreshTokenFamily);
const monitors = bindMemoryModel(Monitor);
const incidents = bindMemoryModel(Incident);

const userA = new Types.ObjectId();
const userB = new Types.ObjectId();
const tokenA = createAccessToken(String(userA));
const tokenB = createAccessToken(String(userB));
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const password = "CorrectHorse1!";
let passwordHash = "";

const chrome =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const iphone =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

const newSession = async (userId: Types.ObjectId, userAgent?: string) => {
  const token = await issueRefreshToken(String(userId));
  const familyId = currentFamilyId(token) as string;
  if (userAgent) {
    const doc = families.docs.find((entry) => entry.familyId === familyId);
    if (doc) doc.userAgent = userAgent;
  }
  return { token, familyId };
};

beforeEach(async () => {
  [users, families, monitors, incidents].forEach((store) => store.reset());
  redis.counts.clear();
  passwordHash ||= await argon2.hash(password, { type: argon2.argon2id });
  users.docs.push(
    {
      _id: userA,
      name: "Asha Rao",
      email: "asha@example.com",
      passwordHash,
      emailVerifiedAt: new Date("2026-01-02T00:00:00Z"),
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date(),
    },
    {
      _id: userB,
      name: "Ben Stone",
      email: "ben@example.com",
      passwordHash,
      emailVerifiedAt: null,
      createdAt: new Date("2026-02-01T00:00:00Z"),
      updatedAt: new Date(),
    },
  );
});

describe("device labels", () => {
  it.each([
    [chrome, "Chrome on Windows"],
    [iphone, "Safari on iOS"],
    ["Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0", "Firefox on Linux"],
    [
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605 Version/17 Safari/605",
      "Safari on macOS",
    ],
    [
      "Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537 Chrome/124 Safari/537 Edg/124",
      "Edge on Windows",
    ],
    ["curl/8.0", "Unknown device"],
    ["", "Unknown device"],
    [undefined, "Unknown device"],
  ])("labels %s", (agent, label) => {
    expect(describeDevice(agent as string | undefined)).toBe(label);
  });
});

describe("profile", () => {
  it("requires authentication", async () => {
    await request(app).get("/api/profile").expect(401);
    await request(app).patch("/api/profile").send({ name: "x" }).expect(401);
  });

  it("returns the account, verification state and live stats without secrets", async () => {
    monitors.docs.push(
      { _id: new Types.ObjectId(), userId: userA, active: true },
      { _id: new Types.ObjectId(), userId: userA, active: false },
      { _id: new Types.ObjectId(), userId: userB, active: true },
    );
    incidents.docs.push(
      { _id: new Types.ObjectId(), userId: userA, status: "open" },
      { _id: new Types.ObjectId(), userId: userA, status: "acknowledged" },
      { _id: new Types.ObjectId(), userId: userA, status: "resolved" },
      { _id: new Types.ObjectId(), userId: userB, status: "open" },
    );
    const response = await request(app).get("/api/profile").set(auth(tokenA)).expect(200);
    expect(response.body.user).toEqual({
      id: String(userA),
      name: "Asha Rao",
      email: "asha@example.com",
      emailVerified: true,
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    expect(response.body.stats).toMatchObject({ monitors: 2, activeMonitors: 1, openIncidents: 2 });
    expect(response.headers["cache-control"]).toContain("no-store");
    expect(JSON.stringify(response.body)).not.toMatch(/passwordHash|\$argon2/);

    const other = await request(app).get("/api/profile").set(auth(tokenB)).expect(200);
    expect(other.body.user.emailVerified).toBe(false);
    expect(other.body.stats).toMatchObject({ monitors: 1, openIncidents: 1 });
  });

  it("updates only the caller's name with trimming and validation", async () => {
    const updated = await request(app)
      .patch("/api/profile")
      .set(auth(tokenA))
      .send({ name: "  Asha  Devi Rao  " })
      .expect(200);
    expect(updated.body.user.name).toBe("Asha  Devi Rao");
    expect(users.docs.find((doc) => String(doc._id) === String(userB))?.name).toBe("Ben Stone");

    for (const body of [
      { name: "A" },
      { name: "x".repeat(81) },
      { name: "<b>bold</b>" },
      { name: "Valid", email: "hijack@example.com" },
      { name: 123 },
      {},
    ]) {
      const response = await request(app).patch("/api/profile").set(auth(tokenA)).send(body);
      expect(response.status, JSON.stringify(body)).toBe(400);
    }
    expect(users.docs[0]?.email).toBe("asha@example.com");
  });
});

describe("password change", () => {
  const change = (body: Record<string, unknown>, cookie?: string, token = tokenA) => {
    const req = request(app).post("/api/auth/password").set(auth(token));
    return (cookie ? req.set("Cookie", `faultline_refresh=${cookie}`) : req).send(body);
  };
  const valid = {
    currentPassword: password,
    newPassword: "BrandNewPass9!",
    confirmPassword: "BrandNewPass9!",
  };

  it("requires authentication", async () => {
    await request(app).post("/api/auth/password").send(valid).expect(401);
  });

  it("changes the password, stores a new hash and keeps only the current session", async () => {
    const current = await newSession(userA, chrome);
    const other = await newSession(userA, iphone);
    const stranger = await newSession(userB, chrome);
    const response = await change(valid, current.token).expect(200);
    expect(response.body).toEqual({ status: "ok", revokedSessions: 1 });

    const stored = users.docs[0] as unknown as { passwordHash: string };
    expect(stored.passwordHash).not.toBe(passwordHash);
    expect(await argon2.verify(stored.passwordHash, valid.newPassword)).toBe(true);
    expect(await argon2.verify(stored.passwordHash, password)).toBe(false);

    const revoked = (id: string) => families.docs.find((doc) => doc.familyId === id)?.revokedAt;
    expect(revoked(current.familyId)).toBeFalsy();
    expect(revoked(other.familyId)).toBeInstanceOf(Date);
    expect(revoked(stranger.familyId)).toBeFalsy();
  });

  it("revokes every session when the current one cannot be identified", async () => {
    await newSession(userA);
    await newSession(userA);
    const response = await change(valid).expect(200);
    expect(response.body.revokedSessions).toBe(2);
  });

  it("rejects a wrong current password without changing anything", async () => {
    const response = await change({ ...valid, currentPassword: "WrongPassword1!" }).expect(400);
    expect(response.body.code).toBe("INVALID_CURRENT_PASSWORD");
    expect(response.body.fieldErrors.currentPassword).toBeDefined();
    expect((users.docs[0] as unknown as { passwordHash: string }).passwordHash).toBe(passwordHash);
  });

  it("validates the new password", async () => {
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ ...valid, newPassword: "short", confirmPassword: "short" }, "newPassword"],
      [{ ...valid, confirmPassword: "Different1!" }, "confirmPassword"],
      [{ ...valid, newPassword: password, confirmPassword: password }, "newPassword"],
      [{ ...valid, currentPassword: "" }, "currentPassword"],
      [{ ...valid, extra: true }, "request"],
    ];
    for (const [body, field] of cases) {
      const response = await change(body);
      expect(response.status, JSON.stringify(body)).toBe(400);
      expect(Object.keys(response.body.fieldErrors ?? {}).join(",")).toContain(
        field === "request" ? "" : field,
      );
    }
    expect((users.docs[0] as unknown as { passwordHash: string }).passwordHash).toBe(passwordHash);
  });

  it("rate limits repeated attempts", async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await change({ ...valid, currentPassword: "WrongPassword1!" }).expect(400);
    }
    const blocked = await change(valid);
    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe("RATE_LIMITED");
    expect((users.docs[0] as unknown as { passwordHash: string }).passwordHash).toBe(passwordHash);
  });
});

describe("sessions", () => {
  const withCookie = (
    path: string,
    method: "get" | "post" | "delete",
    cookie?: string,
    token = tokenA,
  ) => {
    const req = request(app)[method](path).set(auth(token));
    return cookie ? req.set("Cookie", `faultline_refresh=${cookie}`) : req;
  };

  it("lists active sessions with readable devices and marks the current one first", async () => {
    const older = await newSession(userA, iphone);
    const current = await newSession(userA, chrome);
    (
      families.docs.find((doc) => doc.familyId === older.familyId) as Record<string, unknown>
    ).lastUsedAt = new Date(Date.now() - 3_600_000);
    const revoked = await newSession(userA, chrome);
    (
      families.docs.find((doc) => doc.familyId === revoked.familyId) as Record<string, unknown>
    ).revokedAt = new Date();
    const expired = await newSession(userA, chrome);
    (
      families.docs.find((doc) => doc.familyId === expired.familyId) as Record<string, unknown>
    ).expiresAt = new Date(Date.now() - 1000);
    await newSession(userB, chrome);

    const response = await withCookie("/api/auth/sessions", "get", current.token).expect(200);
    expect(response.body.items).toHaveLength(2);
    expect(response.body.items[0]).toMatchObject({
      id: current.familyId,
      current: true,
      device: "Chrome on Windows",
    });
    expect(response.body.items[1]).toMatchObject({
      id: older.familyId,
      current: false,
      device: "Safari on iOS",
    });
    expect(response.headers["cache-control"]).toContain("no-store");
    expect(JSON.stringify(response.body)).not.toMatch(/tokenHash|userId|userAgent|Mozilla/);
  });

  it("requires authentication", async () => {
    await request(app).get("/api/auth/sessions").expect(401);
    await request(app).delete(`/api/auth/sessions/${crypto.randomUUID()}`).expect(401);
    await request(app).post("/api/auth/sessions/revoke-others").expect(401);
  });

  it("revokes another device without touching the current session or clearing the cookie", async () => {
    const current = await newSession(userA, chrome);
    const other = await newSession(userA, iphone);
    const response = await withCookie(
      `/api/auth/sessions/${other.familyId}`,
      "delete",
      current.token,
    ).expect(200);
    expect(response.body).toEqual({ status: "ok", current: false });
    expect(response.headers["set-cookie"]).toBeUndefined();
    expect(families.docs.find((doc) => doc.familyId === other.familyId)?.revokedAt).toBeInstanceOf(
      Date,
    );
    expect(families.docs.find((doc) => doc.familyId === current.familyId)?.revokedAt).toBeFalsy();
  });

  it("revoking the current session clears the refresh cookie", async () => {
    const current = await newSession(userA, chrome);
    const response = await withCookie(
      `/api/auth/sessions/${current.familyId}`,
      "delete",
      current.token,
    ).expect(200);
    expect(response.body.current).toBe(true);
    expect(String(response.headers["set-cookie"])).toMatch(/faultline_refresh=;/);
  });

  it("cannot revoke another user's session or an unknown one", async () => {
    const stranger = await newSession(userB, chrome);
    await withCookie(`/api/auth/sessions/${stranger.familyId}`, "delete").expect(404);
    expect(families.docs.find((doc) => doc.familyId === stranger.familyId)?.revokedAt).toBeFalsy();
    await withCookie(`/api/auth/sessions/${crypto.randomUUID()}`, "delete").expect(404);
    await withCookie("/api/auth/sessions/not-a-uuid", "delete").expect(400);
  });

  it("signs out other devices while keeping the current one", async () => {
    const current = await newSession(userA, chrome);
    await newSession(userA, iphone);
    await newSession(userA, iphone);
    const stranger = await newSession(userB, chrome);
    const response = await withCookie(
      "/api/auth/sessions/revoke-others",
      "post",
      current.token,
    ).expect(200);
    expect(response.body).toEqual({ status: "ok", revoked: 2 });
    const list = await withCookie("/api/auth/sessions", "get", current.token).expect(200);
    expect(list.body.items.map((item: { id: string }) => item.id)).toEqual([current.familyId]);
    expect(families.docs.find((doc) => doc.familyId === stranger.familyId)?.revokedAt).toBeFalsy();
  });
});
