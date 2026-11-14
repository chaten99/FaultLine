import { beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import type { Job } from "bullmq";
import { processMonitorCheckJob } from "../src/workers/monitor-check.worker.js";
import { Monitor } from "../src/modules/monitors/monitor.model.js";
import { MonitorCheck } from "../src/modules/checks/monitor-check.model.js";
import * as redisService from "../src/lib/redis/redis.service.js";
import * as executorService from "../src/modules/monitors/monitor-executor.service.js";
import type { MonitorCheckJobData } from "../src/queues/monitor-check.queue.js";

describe("Monitor Check Worker", () => {
  const mockJob = {
    id: "job-1",
    data: {
      monitorId: "mon-123",
      manual: false,
    },
  } as unknown as Job<MonitorCheckJobData>;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("retries when distributed lock cannot be acquired", async () => {
    vi.spyOn(redisService, "acquireLock").mockResolvedValue(false);
    const releaseSpy = vi.spyOn(redisService, "releaseLock").mockResolvedValue(true);
    const findSpy = vi.spyOn(Monitor, "findById");

    await expect(processMonitorCheckJob(mockJob)).rejects.toThrow("lock is active");

    expect(findSpy).not.toHaveBeenCalled();
    expect(releaseSpy).not.toHaveBeenCalled();
  });

  it("skips scheduled check when monitor is paused", async () => {
    vi.spyOn(redisService, "acquireLock").mockResolvedValue(true);
    const releaseSpy = vi.spyOn(redisService, "releaseLock").mockResolvedValue(true);
    vi.spyOn(Monitor, "findById").mockResolvedValue({
      _id: "mon-123",
      active: false,
    } as unknown as ReturnType<typeof Monitor.findById>);
    const executeSpy = vi.spyOn(executorService, "executeMonitorHttpCheck");

    await processMonitorCheckJob(mockJob);

    expect(executeSpy).not.toHaveBeenCalled();
    expect(releaseSpy).toHaveBeenCalledWith("lock:monitor:mon-123", expect.any(String));
  });

  it("executes probe, updates check, updates monitor with configRevision, and publishes event", async () => {
    vi.spyOn(redisService, "acquireLock").mockResolvedValue(true);
    const releaseSpy = vi.spyOn(redisService, "releaseLock").mockResolvedValue(true);
    const publishSpy = vi.spyOn(redisService, "publishDomainEvent").mockResolvedValue(undefined);

    vi.spyOn(Monitor, "findById").mockResolvedValue({
      _id: "mon-123",
      userId: "507f1f77bcf86cd799439011",
      workspaceId: "607f1f77bcf86cd799439022",
      url: "https://example.com/api",
      timeoutMs: 5000,
      expectedStatusCodes: [200],
      active: true,
      configRevision: 3,
    } as unknown as ReturnType<typeof Monitor.findById>);

    (vi.spyOn(MonitorCheck, "findOneAndUpdate") as unknown as MockInstance).mockResolvedValue({
      _id: "check-789",
    });

    const updateCheckSpy = vi
      .spyOn(MonitorCheck, "findByIdAndUpdate")
      .mockResolvedValue({} as unknown as ReturnType<typeof MonitorCheck.findByIdAndUpdate>);

    vi.spyOn(executorService, "executeMonitorHttpCheck").mockResolvedValue({
      success: true,
      durationMs: 145,
      statusCode: 200,
    });

    const updateMonitorSpy = vi.spyOn(Monitor, "findOneAndUpdate").mockResolvedValue({
      _id: "mon-123",
    } as unknown as ReturnType<typeof Monitor.findOneAndUpdate>);

    await processMonitorCheckJob(mockJob);

    expect(updateCheckSpy).toHaveBeenCalledWith("check-789", {
      $set: expect.objectContaining({
        status: "success",
        responseDurationMs: 145,
        statusCode: 200,
      }),
    });

    expect(updateMonitorSpy).toHaveBeenLastCalledWith(
      { _id: "mon-123", configRevision: 3, active: true },
      {
        $set: expect.objectContaining({
          lastCheckStatus: "success",
          lastResponseDurationMs: 145,
          lastStatusCode: 200,
        }),
      },
    );

    expect(publishSpy).toHaveBeenCalledWith(
      "monitor.check.completed",
      expect.objectContaining({
        workspaceId: "607f1f77bcf86cd799439022",
        payload: expect.objectContaining({
          monitorId: "mon-123",
          status: "success",
          durationMs: 145,
          statusCode: 200,
        }),
      }),
    );

    const completed = publishSpy.mock.calls.find(([type]) => type === "monitor.check.completed");
    expect(completed?.[1]).not.toHaveProperty("userId");
    for (const [, payload] of publishSpy.mock.calls) {
      expect(payload).toMatchObject({ workspaceId: "607f1f77bcf86cd799439022" });
    }

    expect(releaseSpy).toHaveBeenCalledWith("lock:monitor:mon-123", expect.any(String));
  });

  it("publishes failures and paused skips to the monitor's workspace", async () => {
    vi.spyOn(redisService, "acquireLock").mockResolvedValue(true);
    vi.spyOn(redisService, "releaseLock").mockResolvedValue(true);
    const publishSpy = vi.spyOn(redisService, "publishDomainEvent").mockResolvedValue(undefined);

    vi.spyOn(Monitor, "findById").mockResolvedValue({
      _id: "mon-123",
      userId: "507f1f77bcf86cd799439011",
      workspaceId: "607f1f77bcf86cd799439022",
      url: "https://example.com/api",
      timeoutMs: 5000,
      expectedStatusCodes: [200],
      active: false,
      configRevision: 1,
    } as unknown as ReturnType<typeof Monitor.findById>);
    (vi.spyOn(MonitorCheck, "findOneAndUpdate") as unknown as MockInstance).mockResolvedValue({
      _id: "check-1",
    });

    await processMonitorCheckJob({
      id: "job-2",
      data: { monitorId: "mon-123", runId: "run-paused", manual: false },
    } as unknown as Job<MonitorCheckJobData>);

    const failed = publishSpy.mock.calls.find(([type]) => type === "monitor.check.failed");
    expect(failed?.[1]).toMatchObject({
      workspaceId: "607f1f77bcf86cd799439022",
      payload: expect.objectContaining({ failureCategory: "MONITOR_PAUSED" }),
    });
    expect(failed?.[1]).not.toHaveProperty("userId");
  });

  it("safely handles configRevision mismatch when monitor was modified during probe", async () => {
    vi.spyOn(redisService, "acquireLock").mockResolvedValue(true);
    vi.spyOn(redisService, "releaseLock").mockResolvedValue(true);
    vi.spyOn(redisService, "publishDomainEvent").mockResolvedValue(undefined);

    vi.spyOn(Monitor, "findById").mockResolvedValue({
      _id: "mon-123",
      userId: "507f1f77bcf86cd799439011",
      workspaceId: "607f1f77bcf86cd799439022",
      url: "https://example.com/api",
      timeoutMs: 5000,
      expectedStatusCodes: [200],
      active: true,
      configRevision: 2,
    } as unknown as ReturnType<typeof Monitor.findById>);

    (vi.spyOn(MonitorCheck, "findOneAndUpdate") as unknown as MockInstance).mockResolvedValue({
      _id: "check-789",
    });

    vi.spyOn(MonitorCheck, "findByIdAndUpdate").mockResolvedValue(
      {} as unknown as ReturnType<typeof MonitorCheck.findByIdAndUpdate>,
    );
    vi.spyOn(executorService, "executeMonitorHttpCheck").mockResolvedValue({
      success: false,
      durationMs: 5005,
      failureCategory: "TIMEOUT",
      errorMessage: "Request timed out",
    });

    vi.spyOn(Monitor, "findOneAndUpdate").mockResolvedValue(null);

    await expect(processMonitorCheckJob(mockJob)).resolves.not.toThrow();
  });
});
