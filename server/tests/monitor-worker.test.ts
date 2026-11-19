import { beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import type { Job } from "bullmq";
import { processMonitorCheckJob } from "../src/workers/monitor-check.worker.js";
import { unscheduleMonitor } from "../src/queues/monitor-scheduler.service.js";
import { evaluateCheckForIncident } from "../src/modules/incidents/incident.service.js";
import { matchingMaintenance } from "../src/modules/maintenance/maintenance.service.js";
import { Monitor } from "../src/modules/monitors/monitor.model.js";
import { MonitorCheck } from "../src/modules/checks/monitor-check.model.js";
import * as redisService from "../src/lib/redis/redis.service.js";
import * as executorService from "../src/modules/monitors/monitor-executor.service.js";
import type { MonitorCheckJobData } from "../src/queues/monitor-check.queue.js";

vi.mock("../src/modules/incidents/incident.service.js", () => ({
  evaluateCheckForIncident: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../src/queues/monitor-scheduler.service.js", () => ({
  unscheduleMonitor: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../src/modules/maintenance/maintenance.service.js", () => ({
  matchingMaintenance: vi.fn().mockResolvedValue([]),
}));
vi.mock("../src/modules/maintenance/maintenance-notifications.service.js", () => ({
  notifyAfterMaintenance: vi.fn().mockResolvedValue(undefined),
  markIncidentDuringMaintenance: vi.fn().mockResolvedValue(undefined),
}));

describe("Monitor Check Worker", () => {
  const mockJob = {
    id: "job-1",
    data: {
      monitorId: "507f1f77bcf86cd799439123",
      manual: false,
    },
  } as unknown as Job<MonitorCheckJobData>;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it.each([undefined, null, "undefined", "not-an-object-id"])(
    "ignores malformed queued monitor IDs (%s) before locks or database queries",
    async (monitorId) => {
      const find = vi.spyOn(Monitor, "findById");
      const lock = vi.spyOn(redisService, "acquireLock");
      await expect(
        processMonitorCheckJob({ data: { monitorId } } as unknown as Job<MonitorCheckJobData>),
      ).resolves.toBeUndefined();
      expect(find).not.toHaveBeenCalled();
      expect(lock).not.toHaveBeenCalled();
    },
  );

  it.each([undefined, null, "undefined", "not-an-object-id"])(
    "unschedules unscoped monitors (%s) without executing or publishing",
    async (workspaceId) => {
      vi.spyOn(redisService, "acquireLock").mockResolvedValue(true);
      const release = vi.spyOn(redisService, "releaseLock").mockResolvedValue(true);
      const publish = vi.spyOn(redisService, "publishDomainEvent").mockResolvedValue(undefined);
      vi.spyOn(Monitor, "findById").mockResolvedValue({
        _id: mockJob.data.monitorId,
        userId: "507f1f77bcf86cd799439011",
        workspaceId,
        active: true,
      } as never);
      const execute = vi.spyOn(executorService, "executeMonitorHttpCheck");
      const persist = vi.spyOn(MonitorCheck, "findOneAndUpdate");
      await expect(processMonitorCheckJob(mockJob)).resolves.toBeUndefined();
      expect(unscheduleMonitor).toHaveBeenCalledWith(mockJob.data.monitorId);
      expect(execute).not.toHaveBeenCalled();
      expect(evaluateCheckForIncident).not.toHaveBeenCalled();
      expect(matchingMaintenance).not.toHaveBeenCalled();
      expect(persist).not.toHaveBeenCalled();
      expect(publish).not.toHaveBeenCalled();
      expect(release).toHaveBeenCalledWith(
        "lock:monitor:" + mockJob.data.monitorId,
        expect.any(String),
      );
    },
  );

  it("settles an already queued manual check as a non-health migration error", async () => {
    vi.spyOn(redisService, "acquireLock").mockResolvedValue(true);
    vi.spyOn(redisService, "releaseLock").mockResolvedValue(true);
    vi.spyOn(Monitor, "findById").mockResolvedValue({
      _id: mockJob.data.monitorId,
      active: true,
    } as never);
    const persist = vi.spyOn(MonitorCheck, "findOneAndUpdate").mockResolvedValue(null);
    const summary = vi.spyOn(Monitor, "findOneAndUpdate");
    await expect(
      processMonitorCheckJob({
        ...mockJob,
        data: { ...mockJob.data, manual: true, runId: "legacy-manual" },
      } as Job<MonitorCheckJobData>),
    ).resolves.toBeUndefined();
    expect(persist).toHaveBeenCalledWith(
      {
        monitorId: mockJob.data.monitorId,
        runId: "legacy-manual",
        status: { $in: ["queued", "running"] },
      },
      { $set: expect.objectContaining({ status: "error", failureCategory: "WORKSPACE_REQUIRED" }) },
    );
    expect(summary).not.toHaveBeenCalled();
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
      _id: "507f1f77bcf86cd799439123",
      active: false,
      workspaceId: "607f1f77bcf86cd799439022",
    } as unknown as ReturnType<typeof Monitor.findById>);
    const executeSpy = vi.spyOn(executorService, "executeMonitorHttpCheck");

    await processMonitorCheckJob(mockJob);

    expect(executeSpy).not.toHaveBeenCalled();
    expect(releaseSpy).toHaveBeenCalledWith(
      "lock:monitor:507f1f77bcf86cd799439123",
      expect.any(String),
    );
  });

  it("executes probe, updates check, updates monitor with configRevision, and publishes event", async () => {
    vi.spyOn(redisService, "acquireLock").mockResolvedValue(true);
    const releaseSpy = vi.spyOn(redisService, "releaseLock").mockResolvedValue(true);
    const publishSpy = vi.spyOn(redisService, "publishDomainEvent").mockResolvedValue(undefined);

    vi.spyOn(Monitor, "findById").mockResolvedValue({
      _id: "507f1f77bcf86cd799439123",
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
      _id: "507f1f77bcf86cd799439123",
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
      { _id: "507f1f77bcf86cd799439123", configRevision: 3, active: true },
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
          monitorId: "507f1f77bcf86cd799439123",
          status: "success",
          durationMs: 145,
          statusCode: 200,
        }),
      }),
    );

    expect(evaluateCheckForIncident).toHaveBeenCalledWith(
      mockJob.data.monitorId,
      expect.objectContaining({ success: true }),
    );
    const completed = publishSpy.mock.calls.find(([type]) => type === "monitor.check.completed");
    expect(completed?.[1]).not.toHaveProperty("userId");
    for (const [, payload] of publishSpy.mock.calls) {
      expect(payload).toMatchObject({ workspaceId: "607f1f77bcf86cd799439022" });
    }

    expect(releaseSpy).toHaveBeenCalledWith(
      "lock:monitor:507f1f77bcf86cd799439123",
      expect.any(String),
    );
  });

  it("publishes failures and paused skips to the monitor's workspace", async () => {
    vi.spyOn(redisService, "acquireLock").mockResolvedValue(true);
    vi.spyOn(redisService, "releaseLock").mockResolvedValue(true);
    const publishSpy = vi.spyOn(redisService, "publishDomainEvent").mockResolvedValue(undefined);

    vi.spyOn(Monitor, "findById").mockResolvedValue({
      _id: "507f1f77bcf86cd799439123",
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
      data: { monitorId: "507f1f77bcf86cd799439123", runId: "run-paused", manual: false },
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
      _id: "507f1f77bcf86cd799439123",
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
