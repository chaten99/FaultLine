import request from "supertest";
import { describe, expect, it } from "vitest";
import { app } from "../src/app.js";

describe("GET /api/health", () => {
  it("returns a runtime health status", async () => {
    const before = Date.now();
    const response = await request(app).get("/api/health");
    const after = Date.now();

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      status: "ok",
      service: "faultline-api",
    });
    expect(Date.parse(response.body.timestamp)).toBeGreaterThanOrEqual(before);
    expect(Date.parse(response.body.timestamp)).toBeLessThanOrEqual(after);
    expect(response.body.uptimeSeconds).toEqual(expect.any(Number));
  });

  it("returns a consistent 404 response", async () => {
    const response = await request(app).get("/api/missing");
    expect(response.status).toBe(404);
    expect(response.body).toEqual({ status: "error", message: "Route not found" });
  });
});
