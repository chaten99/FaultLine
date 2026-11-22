import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  enqueueImmediateCheck,
  getSchedulerId,
  reconcileSchedulers,
  scheduleMonitor,
  unscheduleMonitor,
} from "../src/queues/monitor-scheduler.service.js";
import { Monitor } from "../src/modules/monitors/monitor.model.js";

const mockQueue = {
  upsertJobScheduler: vi.fn().mockResolvedValue({}),
  removeJobScheduler: vi.fn().mockResolvedValue({}),
  add: vi.fn().mockResolvedValue({ id: "job-abc-123" }),
  getJobSchedulers: vi.fn().mockResolvedValue([]),
};

vi.mock("../src/queues/monitor-check.queue.js", () => ({
  getMonitorCheckQueue: () => mockQueue,
}));

describe("Monitor Scheduler Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("computes stable scheduler ID format", () => {
    expect(getSchedulerId("12345")).toBe("monitor:12345");
  });

  it("schedules recurring monitor check with upsertJobScheduler", async () => {
    await scheduleMonitor({
      _id: "mon-1",
      intervalSeconds: 60,
      workspaceId: "607f1f77bcf86cd799439022",
    });

    expect(mockQueue.upsertJobScheduler).toHaveBeenCalledWith(
      "monitor:mon-1",
      { every: 60000 },
      expect.objectContaining({
        name: "execute-monitor-check",
        data: expect.objectContaining({ monitorId: "mon-1", scheduled: true }),
      }),
    );
  });

  it.each([undefined, null, "undefined", "malformed"])(
    "does not schedule a monitor with invalid workspace %s",
    async (workspaceId) => {
      await scheduleMonitor({ _id: "legacy-monitor", intervalSeconds: 60, workspaceId });
      expect(mockQueue.upsertJobScheduler).not.toHaveBeenCalled();
      expect(mockQueue.removeJobScheduler).toHaveBeenCalledWith("monitor:legacy-monitor");
    },
  );

  it("removes legacy schedulers and recreates them only after workspace migration", async () => {
    const legacy = {
      _id: "legacy-monitor",
      intervalSeconds: 60,
      workspaceId: undefined as string | undefined,
    };
    vi.spyOn(Monitor, "find").mockReturnValue({
      lean: vi.fn().mockResolvedValue([legacy]),
    } as never);
    mockQueue.getJobSchedulers.mockResolvedValue([{ key: "monitor:legacy-monitor", every: 60000 }]);
    await reconcileSchedulers();
    expect(mockQueue.removeJobScheduler).toHaveBeenCalledWith("monitor:legacy-monitor");
    expect(mockQueue.upsertJobScheduler).not.toHaveBeenCalled();
    legacy.workspaceId = "607f1f77bcf86cd799439022";
    mockQueue.getJobSchedulers.mockResolvedValue([]);
    await reconcileSchedulers();
    expect(mockQueue.upsertJobScheduler).toHaveBeenCalledWith(
      "monitor:legacy-monitor",
      { every: 60000 },
      expect.anything(),
    );
  });

  it("unschedules monitor by calling removeJobScheduler", async () => {
    await unscheduleMonitor("mon-1");
    expect(mockQueue.removeJobScheduler).toHaveBeenCalledWith("monitor:mon-1");
  });

  it("enqueues immediate check job for manual check", async () => {
    const id = await enqueueImmediateCheck("mon-1", true);

    expect(id).toBe("job-abc-123");
    expect(mockQueue.add).toHaveBeenCalledWith(
      "manual-monitor-check",
      expect.objectContaining({ monitorId: "mon-1", manual: true }),
      expect.objectContaining({ jobId: expect.stringMatching(/^manual-/) }),
    );
  });

  it("enqueues immediate check job for initial check with unique jobId", async () => {
    const id = await enqueueImmediateCheck("mon-1", false);

    expect(id).toBe("job-abc-123");
    expect(mockQueue.add).toHaveBeenCalledWith(
      "initial-monitor-check",
      expect.objectContaining({ monitorId: "mon-1", manual: false }),
      expect.objectContaining({ jobId: expect.stringMatching(/^init-mon-1-/) }),
    );
  });

  it("reuses matching BullMQ scheduler keys without recreating recurring jobs", async () => {
    vi.spyOn(Monitor, "find").mockReturnValue({
      lean: vi
        .fn()
        .mockResolvedValue([
          { _id: "scoped-monitor", intervalSeconds: 60, workspaceId: "607f1f77bcf86cd799439022" },
        ]),
    } as never);
    mockQueue.getJobSchedulers.mockResolvedValue([{ key: "monitor:scoped-monitor", every: 60000 }]);
    await reconcileSchedulers();
    await reconcileSchedulers();
    expect(mockQueue.upsertJobScheduler).not.toHaveBeenCalled();
    expect(mockQueue.removeJobScheduler).not.toHaveBeenCalled();
  });

  it("reconciles schedulers by removing stale, updating mismatched, and adding missing schedulers", async () => {
    const activeMonitors = [
      { _id: "mon-active-1", intervalSeconds: 60, workspaceId: "607f1f77bcf86cd799439022" },
      { _id: "mon-active-2", intervalSeconds: 300, workspaceId: "607f1f77bcf86cd799439022" },
    ];

    vi.spyOn(Monitor, "find").mockReturnValue({
      lean: vi.fn().mockResolvedValue(activeMonitors),
    } as unknown as ReturnType<typeof Monitor.find>);

    mockQueue.getJobSchedulers.mockResolvedValue([
      { key: "monitor:mon-active-1", every: 120000 },
      { key: "monitor:mon-stale-old", every: 60000 },
    ]);

    await reconcileSchedulers();

    expect(mockQueue.removeJobScheduler).toHaveBeenCalledWith("monitor:mon-stale-old");
    expect(mockQueue.upsertJobScheduler).toHaveBeenCalledWith(
      "monitor:mon-active-1",
      { every: 60000 },
      expect.anything(),
    );
    expect(mockQueue.upsertJobScheduler).toHaveBeenCalledWith(
      "monitor:mon-active-2",
      { every: 300000 },
      expect.anything(),
    );
  });
});
