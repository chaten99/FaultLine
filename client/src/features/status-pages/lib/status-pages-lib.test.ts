import { AxiosError, type AxiosResponse } from "axios";
import { describe, expect, it } from "vitest";
import {
  appendPages,
  mergeIncidentIntoList,
  mergeIncidentIntoPayload,
  mergeStatusBlock,
} from "./public-cache";
import {
  getErrorCode,
  isNotFound,
  managementErrorMessage,
  subscribeErrorMessage,
  tokenErrorMessage,
} from "./errors";
import { moveItem, reorderAnnouncement } from "./reorder";
import { buildPublicUrl, originOf, slugify, validateSlug } from "./slug";
import {
  bannerMessage,
  formatDuration,
  formatPercent,
  monitorStatePresentation,
  publicStatusPresentation,
  serviceCountsNote,
  timelineStatePresentation,
} from "./status-presentation";
import { cellLabel, hasAnyData, legendStates } from "./uptime";
import type {
  IncidentList,
  PublicIncident,
  PublicStatusPayload,
  StatusBlock,
} from "../types/status-page.types";

const incident = (overrides: Partial<PublicIncident> = {}): PublicIncident => ({
  id: "i1",
  title: "API errors",
  status: "investigating",
  services: ["API"],
  startedAt: "2026-01-01T10:00:00.000Z",
  resolvedAt: null,
  durationMs: 60_000,
  ongoing: true,
  updates: [],
  ...overrides,
});

const statusBlock = (overall: StatusBlock["overall"] = "operational"): StatusBlock => ({
  overall,
  message: "",
  updatedAt: "2026-01-01T10:00:00.000Z",
  services: [],
});

const payload = (): PublicStatusPayload => ({
  page: {
    name: "Acme",
    slug: "acme",
    description: "",
    branding: { companyName: "Acme", logoUrl: null },
    subscribersEnabled: true,
    subscriberEvents: { opened: true, acknowledged: false, resolved: true },
  },
  status: statusBlock(),
  incidents: { active: [] },
});

const apiError = (status: number, data: Record<string, unknown> = {}) =>
  new AxiosError("failed", "ERR_BAD_REQUEST", undefined, undefined, {
    status,
    data,
  } as AxiosResponse);

describe("slug helpers", () => {
  it("generates URL-safe slugs from page names", () => {
    expect(slugify("Acme Service Status")).toBe("acme-service-status");
    expect(slugify("  Café & Co.  ")).toBe("cafe-co");
    expect(slugify("---Hello---World---")).toBe("hello-world");
    expect(slugify("日本語")).toBe("");
    expect(slugify("a".repeat(80)).length).toBe(48);
    expect(slugify("a".repeat(47) + " b").endsWith("-")).toBe(false);
  });

  it("validates slug rules", () => {
    expect(validateSlug("acme-status")).toBeNull();
    expect(validateSlug("ab")).toMatch(/at least 3/);
    expect(validateSlug("a".repeat(49))).toMatch(/48/);
    for (const bad of ["Acme", "-acme", "acme-", "ac--me", "ac me", "acme_status", "acme.io"]) {
      expect(validateSlug(bad)).not.toBeNull();
    }
  });

  it("builds public URLs from the configured origin", () => {
    expect(buildPublicUrl("https://app.example.com/", "acme")).toBe(
      "https://app.example.com/status/acme",
    );
    expect(buildPublicUrl("https://app.example.com", "")).toBe(
      "https://app.example.com/status/your-slug",
    );
    expect(originOf("https://app.example.com/status/acme", "http://localhost")).toBe(
      "https://app.example.com",
    );
    expect(originOf("not a url", "http://localhost")).toBe("http://localhost");
    expect(originOf(undefined, "http://localhost")).toBe("http://localhost");
  });
});

describe("status presentation", () => {
  it("never relies on colour alone: every state has a label and a symbol", () => {
    for (const status of ["operational", "partial_outage", "major_outage", "unknown"] as const) {
      const presentation = publicStatusPresentation[status];
      expect(presentation.label.length).toBeGreaterThan(0);
      expect(presentation.symbol.length).toBeGreaterThan(0);
    }
    const symbols = Object.values(publicStatusPresentation).map((item) => item.symbol);
    expect(new Set(symbols).size).toBe(symbols.length);
    expect(monitorStatePresentation.paused.label).toBe("Paused");
  });

  it("uses the specified banner language and never claims operational for unknown", () => {
    expect(publicStatusPresentation.operational.banner).toBe(
      "All monitored services are operating normally.",
    );
    expect(publicStatusPresentation.partial_outage.banner).toBe(
      "Some services are experiencing disruptions.",
    );
    expect(publicStatusPresentation.major_outage.banner).toBe(
      "One or more services are experiencing significant outages.",
    );
    expect(publicStatusPresentation.unknown.banner).toBe(
      "We are currently unable to determine the status of all services.",
    );
    expect(publicStatusPresentation.unknown.banner).not.toMatch(/normally/i);
  });

  it("prefers the server message and falls back to the default", () => {
    expect(bannerMessage("operational", "Custom text")).toBe("Custom text");
    expect(bannerMessage("operational", "  ")).toBe(publicStatusPresentation.operational.banner);
    expect(bannerMessage("unknown", undefined)).toBe(publicStatusPresentation.unknown.banner);
  });

  it("describes paused and unknown monitors honestly", () => {
    expect(serviceCountsNote({ total: 3, down: 0, paused: 0, unknown: 0 })).toBeNull();
    expect(serviceCountsNote({ total: 3, down: 1, paused: 1, unknown: 1 })).toBe(
      "1 of 3 down, 1 paused, 1 unknown",
    );
  });

  it("formats percentages and durations without inventing values", () => {
    expect(formatPercent(99.1234, "ok")).toBe("99.12%");
    expect(formatPercent(null, "ok")).toBe("Not enough data");
    expect(formatPercent(100, "insufficient")).toBe("Not enough data");
    expect(formatDuration(45_000)).toBe("45s");
    expect(formatDuration(5 * 60_000)).toBe("5m");
    expect(formatDuration(3 * 3_600_000 + 20 * 60_000)).toBe("3h 20m");
    expect(formatDuration(2 * 86_400_000 + 5 * 3_600_000)).toBe("2d 5h");
    expect(formatDuration(-5)).toBe("0s");
  });
});

describe("realtime cache merging", () => {
  it("replaces the status block without touching the rest of the page", () => {
    const next = statusBlock("major_outage");
    const merged = mergeStatusBlock(payload(), next);
    expect(merged?.status.overall).toBe("major_outage");
    expect(merged?.page.slug).toBe("acme");
    expect(mergeStatusBlock(undefined, next)).toBeUndefined();
  });

  it("adds, updates and removes active incidents", () => {
    const opened = mergeIncidentIntoPayload(payload(), incident());
    expect(opened?.incidents.active).toHaveLength(1);

    const updated = mergeIncidentIntoPayload(opened, incident({ status: "acknowledged" }));
    expect(updated?.incidents.active).toHaveLength(1);
    expect(updated?.incidents.active[0]?.status).toBe("acknowledged");

    const second = mergeIncidentIntoPayload(
      updated,
      incident({ id: "i2", startedAt: "2026-01-01T11:00:00.000Z" }),
    );
    expect(second?.incidents.active.map((item) => item.id)).toEqual(["i2", "i1"]);

    const resolved = mergeIncidentIntoPayload(
      second,
      incident({ status: "resolved", ongoing: false, resolvedAt: "2026-01-01T12:00:00.000Z" }),
    );
    expect(resolved?.incidents.active.map((item) => item.id)).toEqual(["i2"]);
    expect(mergeIncidentIntoPayload(undefined, incident())).toBeUndefined();
  });

  it("keeps incident lists consistent with their filter", () => {
    const list: IncidentList = { items: [], page: 1, pageSize: 10, total: 0, totalPages: 1 };
    const withActive = mergeIncidentIntoList(list, incident(), "active");
    expect(withActive?.total).toBe(1);
    const unchanged = mergeIncidentIntoList(list, incident(), "resolved");
    expect(unchanged?.items).toHaveLength(0);
    const removed = mergeIncidentIntoList(
      withActive,
      incident({ status: "resolved", ongoing: false }),
      "active",
    );
    expect(removed?.items).toHaveLength(0);
    expect(removed?.total).toBe(0);
    expect(mergeIncidentIntoList(undefined, incident(), "all")).toBeUndefined();
  });

  it("flattens paginated incidents without duplicates", () => {
    const page = (ids: string[]): IncidentList => ({
      items: ids.map((id) => incident({ id })),
      page: 1,
      pageSize: 10,
      total: 3,
      totalPages: 2,
    });
    expect(appendPages([page(["a", "b"]), page(["b", "c"])]).map((item) => item.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
    expect(appendPages(undefined)).toEqual([]);
  });
});

describe("uptime strip mapping", () => {
  const cell = (state: "up" | "down" | "paused" | "unknown" | "insufficient") => ({
    start: "2026-01-01T00:00:00.000Z",
    end: "2026-01-01T01:00:00.000Z",
    state,
  });

  it("treats only observed up or down cells as data", () => {
    expect(hasAnyData([cell("unknown"), cell("insufficient"), cell("paused")])).toBe(false);
    expect(hasAnyData([cell("unknown"), cell("up")])).toBe(true);
    expect(hasAnyData([])).toBe(false);
  });

  it("gives every state a label, a distinct colour and a non-colour pattern where needed", () => {
    expect(legendStates).toHaveLength(5);
    const colours = legendStates.map((state) => timelineStatePresentation[state].className);
    expect(new Set(colours).size).toBe(5);
    for (const state of ["down", "paused", "unknown", "insufficient"] as const) {
      expect(timelineStatePresentation[state].pattern).not.toBe("");
    }
  });

  it("produces accessible cell labels", () => {
    const label = cellLabel(cell("down"));
    expect(label.startsWith("Outage, ")).toBe(true);
    expect(label).toContain(" to ");
  });
});

describe("reordering", () => {
  it("moves items by one position and ignores out-of-range moves", () => {
    const items = ["a", "b", "c"];
    expect(moveItem(items, 1, -1)).toEqual(["b", "a", "c"]);
    expect(moveItem(items, 1, 1)).toEqual(["a", "c", "b"]);
    expect(moveItem(items, 0, -1)).toBe(items);
    expect(moveItem(items, 2, 1)).toBe(items);
    expect(items).toEqual(["a", "b", "c"]);
  });

  it("announces moves in human terms", () => {
    expect(reorderAnnouncement("API", 2, 1, 4)).toBe(
      "API moved from position 3 to position 2 of 4.",
    );
  });
});

describe("error mapping", () => {
  it("reads API error codes", () => {
    expect(getErrorCode(apiError(409, { code: "SLUG_TAKEN" }))).toBe("SLUG_TAKEN");
    expect(getErrorCode(new Error("x"))).toBeNull();
    expect(isNotFound(apiError(404))).toBe(true);
    expect(isNotFound(apiError(500))).toBe(false);
  });

  it("maps management errors", () => {
    expect(managementErrorMessage(apiError(409, { code: "SLUG_TAKEN" }))).toMatch(/already taken/);
    expect(managementErrorMessage(apiError(409, { code: "STATUS_PAGE_LIMIT_REACHED" }))).toMatch(
      /maximum/,
    );
    expect(managementErrorMessage(apiError(400, { message: "Name is required." }))).toBe(
      "Name is required.",
    );
    expect(managementErrorMessage(new Error("boom"))).toBe(
      "Something went wrong. Please try again.",
    );
  });

  it("maps subscription and token errors without leaking details", () => {
    expect(subscribeErrorMessage(apiError(429))).toMatch(/Too many requests/);
    expect(subscribeErrorMessage(apiError(404))).toMatch(/not accepting/);
    expect(tokenErrorMessage(apiError(400, { code: "INVALID_TOKEN" }))).toMatch(
      /invalid or has expired/,
    );
    expect(tokenErrorMessage(new Error("x"))).toBe("Something went wrong. Please try again.");
  });
});
