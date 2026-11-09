import argon2 from "argon2";
import mongoose, { Types } from "mongoose";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { app } from "../src/app.js";
import { createAccessToken } from "../src/modules/auth/auth-token.service.js";
import { RefreshTokenFamily } from "../src/modules/auth/refresh-token-family.model.js";
import { issueRefreshToken } from "../src/modules/auth/refresh-token.service.js";
import { currentFamilyId } from "../src/modules/auth/session.service.js";
import { User } from "../src/modules/auth/user.model.js";

const baseUri = process.env.ANALYTICS_TEST_MONGODB_URI;
const uri = baseUri
  ? `${baseUri.slice(0, baseUri.lastIndexOf("/") + 1)}faultline_profile_integration`
  : undefined;

vi.mock("../src/lib/redis/redis.service.js", () => ({
  acquireLock: vi.fn().mockResolvedValue(true),
  releaseLock: vi.fn().mockResolvedValue(true),
  publishDomainEvent: vi.fn(),
  closeRedisConnections: vi.fn(),
  getRedisClient: () => ({ status: "ready", incr: async () => 1, expire: async () => 1 }),
  createRedisConnection: vi.fn(),
}));

describe.skipIf(!uri)("profile and sessions against MongoDB", () => {
  const userId = new Types.ObjectId();
  const strangerId = new Types.ObjectId();
  const token = createAccessToken(String(userId));
  const password = "CorrectHorse1!";
  const auth = { Authorization: `Bearer ${token}` };

  beforeAll(async () => {
    await mongoose.connect(uri as string);
    await mongoose.connection.dropDatabase();
    await User.create({
      _id: userId,
      name: "Asha Rao",
      email: "asha@example.com",
      passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
      emailVerifiedAt: new Date(),
    });
    await mongoose.connection.collection("publicstatuspages").insertMany([
      { ownerId: userId, slug: "one" },
      { ownerId: userId, slug: "two" },
      { ownerId: strangerId, slug: "three" },
    ]);
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  it("returns the profile with real counts including status pages", async () => {
    const response = await request(app).get("/api/profile").set(auth).expect(200);
    expect(response.body.user).toMatchObject({ name: "Asha Rao", emailVerified: true });
    expect(response.body.stats).toEqual({
      monitors: 0,
      activeMonitors: 0,
      openIncidents: 0,
      statusPages: 2,
    });
    const renamed = await request(app)
      .patch("/api/profile")
      .set(auth)
      .send({ name: "  Asha R  " })
      .expect(200);
    expect(renamed.body.user.name).toBe("Asha R");
  });

  it("lists, revokes and bulk-revokes sessions with real update counts", async () => {
    const current = await issueRefreshToken(String(userId));
    const second = await issueRefreshToken(String(userId));
    const third = await issueRefreshToken(String(userId));
    await issueRefreshToken(String(strangerId));
    await RefreshTokenFamily.updateOne(
      { familyId: currentFamilyId(second) },
      {
        $set: { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604.1" },
      },
    );
    const cookie = `faultline_refresh=${current}`;

    const list = await request(app)
      .get("/api/auth/sessions")
      .set(auth)
      .set("Cookie", cookie)
      .expect(200);
    expect(list.body.items).toHaveLength(3);
    expect(list.body.items[0].current).toBe(true);
    expect(
      list.body.items.find((item: { device: string }) => item.device === "Safari on iOS"),
    ).toBeTruthy();

    const single = await request(app)
      .delete(`/api/auth/sessions/${currentFamilyId(third)}`)
      .set(auth)
      .set("Cookie", cookie)
      .expect(200);
    expect(single.body).toEqual({ status: "ok", current: false });
    await request(app)
      .delete(`/api/auth/sessions/${currentFamilyId(third)}`)
      .set(auth)
      .expect(404);

    const others = await request(app)
      .post("/api/auth/sessions/revoke-others")
      .set(auth)
      .set("Cookie", cookie)
      .expect(200);
    expect(others.body).toEqual({ status: "ok", revoked: 1 });
    const remaining = await request(app)
      .get("/api/auth/sessions")
      .set(auth)
      .set("Cookie", cookie)
      .expect(200);
    expect(remaining.body.items).toHaveLength(1);
    expect(await RefreshTokenFamily.countDocuments({ userId: strangerId, revokedAt: null })).toBe(
      1,
    );
  });

  it("changes the password and signs out other devices", async () => {
    const current = await issueRefreshToken(String(userId));
    await issueRefreshToken(String(userId));
    const body = {
      currentPassword: password,
      newPassword: "BrandNewPass9!",
      confirmPassword: "BrandNewPass9!",
    };
    const wrong = await request(app)
      .post("/api/auth/password")
      .set(auth)
      .send({ ...body, currentPassword: "WrongPassword1!" })
      .expect(400);
    expect(wrong.body.code).toBe("INVALID_CURRENT_PASSWORD");
    const ok = await request(app)
      .post("/api/auth/password")
      .set(auth)
      .set("Cookie", `faultline_refresh=${current}`)
      .send(body)
      .expect(200);
    expect(ok.body.revokedSessions).toBeGreaterThanOrEqual(1);
    const stored = await User.findById(userId).select("+passwordHash");
    expect(await argon2.verify(stored?.passwordHash as string, body.newPassword)).toBe(true);
    expect(await RefreshTokenFamily.countDocuments({ userId, revokedAt: null })).toBe(1);
  });
});
