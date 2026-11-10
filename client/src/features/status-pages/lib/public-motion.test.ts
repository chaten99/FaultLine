import { describe, expect, it } from "vitest";
import {
  barsForWidth,
  bucketTimeline,
  clamp,
  connectionLabel,
  countUpValue,
  diffStatus,
  easeOutCubic,
  formatRelativeTime,
  groupIncidentsByDay,
  nextConnectionState,
  staggerStyle,
} from "./public-motion";
import type {
  PublicIncident,
  StatusBlock,
  TimelineCell,
  TimelineState,
} from "../types/status-page.types";

const NOW = Date.parse("2026-06-10T12:00:00.000Z");

const incident = (id: string, startedAt: string): PublicIncident => ({
  id,
  title: id,
  status: "resolved",
  services: [],
  startedAt,
  resolvedAt: startedAt,
  durationMs: 0,
  ongoing: false,
  updates: [],
});

const cell = (index: number, state: TimelineState): TimelineCell => ({
  start: new Date(NOW + index * 3_600_000).toISOString(),
  end: new Date(NOW + (index + 1) * 3_600_000).toISOString(),
  state,
});

describe("motion helpers", () => {
  it("clamps and eases within bounds", () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
    expect(easeOutCubic(2)).toBe(1);
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5);
  });

  it("counts up to the exact target and never overshoots", () => {
    expect(countUpValue(99.98, 0)).toBe(0);
    expect(countUpValue(99.98, 1)).toBe(99.98);
    expect(countUpValue(99.98, 3)).toBe(99.98);
    expect(countUpValue(99.98, 0.5)).toBeLessThan(99.98);
  });

  it("builds a capped stagger delay variable", () => {
    expect(staggerStyle(0)).toEqual({ "--ps-delay": "0ms" });
    expect(staggerStyle(3)).toEqual({ "--ps-delay": "180ms" });
    expect(staggerStyle(50)).toEqual({ "--ps-delay": "420ms" });
  });
});

describe("relative time", () => {
  it.each([
    [NOW - 3_000, "just now"],
    [NOW - 30_000, "30s ago"],
    [NOW - 5 * 60_000, "5 min ago"],
    [NOW - 3 * 3_600_000, "3h ago"],
    [NOW - 2 * 86_400_000, "2d ago"],
    [NOW + 60_000, "just now"],
  ])("formats %i", (time, expected) => {
    expect(formatRelativeTime(new Date(time).toISOString(), NOW)).toBe(expected);
  });

  it("handles missing and invalid input", () => {
    expect(formatRelativeTime(null, NOW)).toBe("—");
    expect(formatRelativeTime("nope", NOW)).toBe("—");
  });
});

describe("incident day grouping", () => {
  it("groups by local day, newest first, with friendly labels", () => {
    const today = new Date(NOW - 3_600_000).toISOString();
    const todayEarlier = new Date(NOW - 2 * 3_600_000).toISOString();
    const yesterday = new Date(NOW - 26 * 3_600_000).toISOString();
    const older = new Date(NOW - 10 * 86_400_000).toISOString();
    const groups = groupIncidentsByDay(
      [
        incident("old", older),
        incident("a", todayEarlier),
        incident("b", today),
        incident("y", yesterday),
      ],
      NOW,
    );
    expect(groups.map((group) => group.label).slice(0, 2)).toEqual(["Today", "Yesterday"]);
    expect(groups[0]?.items.map((item) => item.id)).toEqual(["b", "a"]);
    expect(groups).toHaveLength(3);
    expect(groups[2]?.items[0]?.id).toBe("old");
  });

  it("returns nothing for no incidents and skips invalid dates", () => {
    expect(groupIncidentsByDay([], NOW)).toEqual([]);
    expect(groupIncidentsByDay([incident("bad", "nope")], NOW)).toEqual([]);
  });
});

describe("uptime bar bucketing", () => {
  it("keeps one bar per cell when they fit", () => {
    const bars = bucketTimeline([cell(0, "up"), cell(1, "down")], 10);
    expect(bars.map((bar) => bar.state)).toEqual(["up", "down"]);
    expect(bars.every((bar) => bar.count === 1)).toBe(true);
  });

  it("merges cells, with any outage always visible", () => {
    const cells = Array.from({ length: 12 }, (_, index) =>
      cell(index, index === 5 ? "down" : "up"),
    );
    const bars = bucketTimeline(cells, 4);
    expect(bars).toHaveLength(4);
    expect(bars.reduce((sum, bar) => sum + bar.count, 0)).toBe(12);
    expect(bars.filter((bar) => bar.state === "down")).toHaveLength(1);
    expect(bars.find((bar) => bar.state === "down")?.downCount).toBe(1);
    expect(bars[0]?.start).toBe(cells[0]?.start);
    expect(bars[3]?.end).toBe(cells[11]?.end);
  });

  it("uses the majority state otherwise and never invents uptime from unknown data", () => {
    const bars = bucketTimeline([cell(0, "unknown"), cell(1, "unknown"), cell(2, "up")], 1);
    expect(bars[0]?.state).toBe("unknown");
    expect(bucketTimeline([], 5)).toEqual([]);
  });

  it("chooses a bar count from the available width", () => {
    expect(barsForWidth(0)).toBe(90);
    expect(barsForWidth(300)).toBe(50);
    expect(barsForWidth(100)).toBe(24);
    expect(barsForWidth(2000)).toBe(90);
  });
});

describe("status diff", () => {
  const block = (
    overall: StatusBlock["overall"],
    statuses: Record<string, StatusBlock["overall"]>,
  ): StatusBlock => ({
    overall,
    message: "",
    updatedAt: "2026-01-01T00:00:00.000Z",
    services: Object.entries(statuses).map(([id, status]) => ({
      id,
      name: id,
      description: "",
      status,
      monitorCounts: { total: 1, operational: 0, down: 0, paused: 0, unknown: 0 },
      lastCheckAt: null,
    })),
  });

  it("reports changed services and overall changes", () => {
    const diff = diffStatus(
      block("operational", { a: "operational", b: "operational" }),
      block("partial_outage", { a: "operational", b: "major_outage", c: "unknown" }),
    );
    expect(diff).toEqual({ overallChanged: true, changedServiceIds: ["b"] });
  });

  it("reports nothing without a previous value or changes", () => {
    const same = block("operational", { a: "operational" });
    expect(diffStatus(undefined, same)).toEqual({ overallChanged: false, changedServiceIds: [] });
    expect(diffStatus(same, same)).toEqual({ overallChanged: false, changedServiceIds: [] });
  });
});

describe("connection state", () => {
  it("never claims live unless connected", () => {
    expect(nextConnectionState("connect", false)).toBe("live");
    expect(nextConnectionState("disconnect", true)).toBe("reconnecting");
    expect(nextConnectionState("error", false)).toBe("offline");
    expect(connectionLabel("live")).toBe("Live");
    expect(connectionLabel("reconnecting")).toBe("Reconnecting…");
    expect(connectionLabel("offline")).toBeNull();
  });
});
