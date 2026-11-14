import { Types } from "mongoose";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Monitor } from "../src/modules/monitors/monitor.model.js";
import { MonitorLifecycleEvent } from "../src/modules/monitors/monitor-lifecycle.model.js";
import {
  deleteMonitorLifecycle,
  ensureLifecycleBaselines,
  recordMonitorActiveChange,
  recordMonitorCreated,
} from "../src/modules/monitors/monitor-lifecycle.service.js";
import { publishPublicStatusForMonitor } from "../src/modules/status-pages/status-page-realtime.service.js";
import { bindMemoryModel } from "./helpers/memory-model.js";

vi.mock("../src/modules/status-pages/status-page-realtime.service.js", () => ({
  publishPublicStatusForMonitor: vi.fn().mockResolvedValue(undefined),
}));

const monitors = bindMemoryModel(Monitor);
const events = bindMemoryModel(MonitorLifecycleEvent);
const userId = new Types.ObjectId();
const workspaceId = new Types.ObjectId();
const otherWorkspaceId = new Types.ObjectId();

const addMonitor = (active = true, workspace = workspaceId) => {
  const _id = new Types.ObjectId();
  monitors.docs.push({
    _id,
    userId,
    workspaceId: workspace,
    active,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date(),
  });
  return _id;
};

beforeEach(() => {
  monitors.reset();
  events.reset();
});

describe("monitor lifecycle history", () => {
  it("records creation once, timestamped with the monitor's real creation time", async () => {
    const _id = addMonitor();
    const monitor = { _id, userId, active: true, createdAt: new Date("2026-01-01T00:00:00Z") };
    await recordMonitorCreated(monitor);
    await recordMonitorCreated(monitor);
    expect(events.docs).toHaveLength(1);
    expect(events.docs[0]).toMatchObject({ type: "created", active: true });
    expect((events.docs[0]?.at as Date).toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });

  it("records pause and resume only when the active flag actually changes", async () => {
    const _id = addMonitor();
    const at = new Date("2026-01-02T00:00:00Z");
    await recordMonitorActiveChange({ _id, userId, active: true }, true, at);
    expect(events.docs).toHaveLength(0);
    await recordMonitorActiveChange({ _id, userId, active: false }, true, at);
    await recordMonitorActiveChange(
      { _id, userId, active: true },
      false,
      new Date("2026-01-03T00:00:00Z"),
    );
    expect(events.docs.map((event) => [event.type, event.active])).toEqual([
      ["paused", false],
      ["resumed", true],
    ]);
  });

  it("creates a baseline only for monitors without history and never invents earlier events", async () => {
    const legacy = addMonitor(false);
    const tracked = addMonitor();
    events.docs.push({
      _id: new Types.ObjectId(),
      monitorId: tracked,
      userId,
      type: "created",
      active: true,
      at: new Date("2026-01-01T00:00:00Z"),
    });
    const now = new Date("2026-02-01T00:00:00Z");
    expect(await ensureLifecycleBaselines(String(workspaceId), now)).toBe(1);
    expect(await ensureLifecycleBaselines(String(workspaceId), now)).toBe(0);
    const baseline = events.docs.find((event) => String(event.monitorId) === String(legacy));
    expect(baseline).toMatchObject({ type: "tracking_started", active: false });
    expect((baseline?.at as Date).toISOString()).toBe(now.toISOString());
    expect(events.docs.filter((event) => String(event.monitorId) === String(tracked))).toHaveLength(
      1,
    );
  });

  it("scopes baselines to the requested workspace and covers all workspaces when omitted", async () => {
    const inWorkspace = addMonitor(true, workspaceId);
    const elsewhere = addMonitor(true, otherWorkspaceId);
    const now = new Date("2026-02-01T00:00:00Z");

    expect(await ensureLifecycleBaselines(String(workspaceId), now)).toBe(1);
    const ids = events.docs.map((event) => String(event.monitorId));
    expect(ids).toEqual([String(inWorkspace)]);
    expect(ids).not.toContain(String(elsewhere));

    expect(await ensureLifecycleBaselines(undefined, now)).toBe(1);
    expect(events.docs.map((event) => String(event.monitorId)).sort()).toEqual(
      [String(inWorkspace), String(elsewhere)].sort(),
    );
  });

  it("refreshes the public status of the monitor's workspace when it is paused or resumed", async () => {
    const _id = addMonitor();
    vi.mocked(publishPublicStatusForMonitor).mockClear();
    await recordMonitorActiveChange(
      { _id, userId, workspaceId, active: false },
      true,
      new Date("2026-01-02T00:00:00Z"),
    );
    expect(publishPublicStatusForMonitor).toHaveBeenCalledWith(String(workspaceId), String(_id));

    vi.mocked(publishPublicStatusForMonitor).mockClear();
    await recordMonitorActiveChange({ _id, userId, workspaceId, active: false }, false);
    expect(publishPublicStatusForMonitor).not.toHaveBeenCalled();
  });

  it("deletes only the given monitor's history", async () => {
    const first = addMonitor();
    const second = addMonitor();
    await recordMonitorCreated({ _id: first, userId, active: true, createdAt: new Date() });
    await recordMonitorCreated({ _id: second, userId, active: true, createdAt: new Date() });
    await deleteMonitorLifecycle(String(first));
    expect(events.docs).toHaveLength(1);
    expect(String(events.docs[0]?.monitorId)).toBe(String(second));
  });
});
