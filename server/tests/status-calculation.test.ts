import { describe, expect, it } from "vitest";
import {
  aggregateOverall,
  aggregateService,
  buildServiceBlock,
  classifyMonitor,
  freshnessMs,
  hostOf,
  statusMessages,
  type MonitorSnapshot,
} from "../src/modules/status-pages/status-calculation.js";
import { toPublicIncident } from "../src/modules/status-pages/status-page-snapshot.service.js";
import { maskEmail } from "../src/modules/status-pages/status-page-view.js";

const NOW = Date.UTC(2026, 5, 1, 12, 0, 0);
const S = 1000;

const monitor = (overrides: Partial<MonitorSnapshot> = {}): MonitorSnapshot => ({
  id: "m1",
  name: "Internal Checkout Monitor",
  url: "https://api.example.com/health?token=SECRET",
  active: true,
  intervalSeconds: 60,
  hasActiveIncident: false,
  latest: { status: "success", completedAt: NOW - 30 * S },
  ...overrides,
});

describe("monitor state classification", () => {
  it("is operational only with a fresh successful eligible check", () => {
    expect(classifyMonitor(monitor(), NOW)).toBe("operational");
  });

  it("uses a documented freshness window of two intervals plus grace", () => {
    expect(freshnessMs(60)).toBe(150_000);
    expect(freshnessMs(3600)).toBe(9_000_000);
    expect(
      classifyMonitor(monitor({ latest: { status: "success", completedAt: NOW - 149 * S } }), NOW),
    ).toBe("operational");
    expect(
      classifyMonitor(monitor({ latest: { status: "success", completedAt: NOW - 151 * S } }), NOW),
    ).toBe("unknown");
  });

  it("never treats stale or missing results as successful", () => {
    expect(classifyMonitor(monitor({ latest: null }), NOW)).toBe("unknown");
    expect(
      classifyMonitor(
        monitor({ latest: { status: "success", completedAt: NOW - 24 * 3600 * S } }),
        NOW,
      ),
    ).toBe("unknown");
  });

  it("does not claim operational when the latest check failed but no incident confirmed it", () => {
    expect(
      classifyMonitor(monitor({ latest: { status: "failure", completedAt: NOW - 10 * S } }), NOW),
    ).toBe("unknown");
    expect(
      classifyMonitor(monitor({ latest: { status: "timeout", completedAt: NOW - 10 * S } }), NOW),
    ).toBe("unknown");
  });

  it("is down when an actual incident is active, even if the latest check recovered", () => {
    expect(classifyMonitor(monitor({ hasActiveIncident: true }), NOW)).toBe("down");
  });

  it("is paused when the monitor is paused, regardless of old results", () => {
    expect(classifyMonitor(monitor({ active: false }), NOW)).toBe("paused");
    expect(classifyMonitor(monitor({ active: false, hasActiveIncident: true }), NOW)).toBe(
      "paused",
    );
  });
});

describe("service and page aggregation", () => {
  it("covers operational, partial outage, major outage and unknown", () => {
    expect(aggregateService(["operational", "operational"])).toBe("operational");
    expect(aggregateService(["operational", "down"])).toBe("partial_outage");
    expect(aggregateService(["down", "unknown"])).toBe("partial_outage");
    expect(aggregateService(["down", "down"])).toBe("major_outage");
    expect(aggregateService(["operational", "unknown"])).toBe("unknown");
    expect(aggregateService(["unknown"])).toBe("unknown");
  });

  it("excludes paused monitors and reports unknown when nothing eligible remains", () => {
    expect(aggregateService(["paused", "paused"])).toBe("unknown");
    expect(aggregateService([])).toBe("unknown");
    expect(aggregateService(["paused", "operational"])).toBe("operational");
    expect(aggregateService(["paused", "down"])).toBe("major_outage");
  });

  it("derives the overall page status from services", () => {
    expect(aggregateOverall(["operational", "operational"])).toBe("operational");
    expect(aggregateOverall(["operational", "partial_outage"])).toBe("partial_outage");
    expect(aggregateOverall(["operational", "major_outage"])).toBe("major_outage");
    expect(aggregateOverall(["operational", "unknown"])).toBe("unknown");
    expect(aggregateOverall([])).toBe("unknown");
  });

  it("never uses operational wording for unknown status", () => {
    expect(statusMessages.unknown).not.toMatch(/operating normally/i);
    expect(statusMessages.operational).toBe("All monitored services are operating normally.");
    expect(statusMessages.partial_outage).toBe("Some services are experiencing disruptions.");
    expect(statusMessages.major_outage).toBe(
      "One or more services are experiencing significant outages.",
    );
  });
});

describe("service blocks", () => {
  const service = {
    id: "s1",
    name: "API",
    description: "Public API",
    monitorIds: ["a", "b", "ghost"],
  };

  it("counts monitor states, ignores deleted monitors and reports the latest check time", () => {
    const monitors = new Map<string, MonitorSnapshot>([
      ["a", monitor({ id: "a", latest: { status: "success", completedAt: NOW - 20 * S } })],
      [
        "b",
        monitor({
          id: "b",
          hasActiveIncident: true,
          latest: { status: "failure", completedAt: NOW - 5 * S },
        }),
      ],
    ]);
    const block = buildServiceBlock(service, monitors, NOW);
    expect(block).toMatchObject({
      id: "s1",
      name: "API",
      status: "partial_outage",
      monitorCounts: { total: 2, operational: 1, down: 1, paused: 0, unknown: 0 },
      lastCheckAt: new Date(NOW - 5 * S).toISOString(),
    });
  });

  it("is unknown for a service whose monitors are all paused or deleted", () => {
    const paused = new Map([["a", monitor({ id: "a", active: false })]]);
    expect(buildServiceBlock({ ...service, monitorIds: ["a"] }, paused, NOW)).toMatchObject({
      status: "unknown",
      monitorCounts: { total: 1, paused: 1 },
    });
    expect(buildServiceBlock(service, new Map(), NOW)).toMatchObject({
      status: "unknown",
      monitorCounts: { total: 0 },
      lastCheckAt: null,
    });
  });

  it("does not include monitor names or URLs in the block", () => {
    const monitors = new Map([["a", monitor({ id: "a" })]]);
    const serialized = JSON.stringify(
      buildServiceBlock({ ...service, monitorIds: ["a"] }, monitors, NOW),
    );
    expect(serialized).not.toContain("Internal Checkout");
    expect(serialized).not.toContain("SECRET");
    expect(serialized).not.toContain("api.example.com");
  });

  it("extracts only the hostname for display", () => {
    expect(hostOf("https://api.example.com:8443/x?token=SECRET")).toBe("api.example.com");
    expect(hostOf("not a url")).toBeNull();
  });
});

describe("public incident serializer", () => {
  const base = {
    id: "i1",
    monitorId: "m1",
    status: "open" as const,
    firstFailureAt: NOW - 3_600_000,
    openedAt: NOW - 3_500_000,
    acknowledgedAt: null,
    resolvedAt: null,
  };

  it("builds a generic public title and an ongoing timeline from persisted timestamps", () => {
    const incident = toPublicIncident(base, ["Public API", "Website"], NOW);
    expect(incident).toMatchObject({
      id: "i1",
      title: "Service disruption: Public API, Website",
      status: "investigating",
      services: ["Public API", "Website"],
      ongoing: true,
      resolvedAt: null,
      durationMs: 3_600_000,
    });
    expect(incident.updates).toHaveLength(1);
    expect(incident.updates[0]?.status).toBe("investigating");
  });

  it("adds acknowledgement and resolution updates and fixes the duration once resolved", () => {
    const incident = toPublicIncident(
      {
        ...base,
        status: "resolved",
        acknowledgedAt: NOW - 3_000_000,
        resolvedAt: NOW - 1_800_000,
      },
      ["API"],
      NOW,
    );
    expect(incident.status).toBe("resolved");
    expect(incident.ongoing).toBe(false);
    expect(incident.durationMs).toBe(1_800_000);
    expect(incident.updates.map((update) => update.status)).toEqual([
      "investigating",
      "acknowledged",
      "resolved",
    ]);
  });

  it("exposes no internal fields", () => {
    const serialized = JSON.stringify(toPublicIncident(base, ["API"], NOW));
    expect(serialized).not.toMatch(
      /monitor|userId|ownerId|reason|error|status_code|failureCategory/i,
    );
  });
});

describe("masking", () => {
  it("masks subscriber emails for owner display", () => {
    expect(maskEmail("jane.doe@example.com")).toBe("j******@example.com");
    expect(maskEmail("a@example.com")).toBe("a**@example.com");
  });
});
