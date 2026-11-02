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
    await scheduleMonitor({ _id: "mon-1", intervalSeconds: 60 });

    expect(mockQueue.upsertJobScheduler).toHaveBeenCalledWith(
      "monitor:mon-1",
      { every: 60000 },
      expect.objectContaining({
        name: "execute-monitor-check",
        data: expect.objectContaining({ monitorId: "mon-1", scheduled: true }),
      }),
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
      expect.objectContaining({ jobId: expect.stringMatching(/^manual:/) }),
    );
  });

  it("enqueues immediate check job for initial check with unique jobId", async () => {
    const id = await enqueueImmediateCheck("mon-1", false);

    expect(id).toBe("job-abc-123");
    expect(mockQueue.add).toHaveBeenCalledWith(
      "initial-monitor-check",
      expect.objectContaining({ monitorId: "mon-1", manual: false }),
      expect.objectContaining({ jobId: expect.stringMatching(/^init:mon-1:/) }),
    );
  });

  it("reconciles schedulers by removing stale, updating mismatched, and adding missing schedulers", async () => {
    const activeMonitors = [
      { _id: "mon-active-1", intervalSeconds: 60 },
      { _id: "mon-active-2", intervalSeconds: 300 },
    ];

    vi.spyOn(Monitor, "find").mockReturnValue({
      lean: vi.fn().mockResolvedValue(activeMonitors),
    } as unknown as ReturnType<typeof Monitor.find>);

    mockQueue.getJobSchedulers.mockResolvedValue([
      { id: "monitor:mon-active-1", every: 120000 },
      { id: "monitor:mon-stale-old", every: 60000 },
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
