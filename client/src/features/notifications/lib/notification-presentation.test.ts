import { describe, expect, it } from "vitest";
import {
  buildDeliveryQuery,
  defaultDeliveryFilters,
  eventLabels,
  failureCategoryLabel,
  formatDurationMs,
  formatRelativeTime,
  hasActiveFilters,
  isDeliveryRetryable,
  statusLabels,
  statusTone,
  summarizeEvents,
  toggleEvent,
} from "./notification-presentation";

describe("notification presentation helpers", () => {
  it("labels every status and event", () => {
    expect(statusLabels.delivered).toBe("Delivered");
    expect(statusLabels.retrying).toBe("Retrying");
    expect(eventLabels["incident.opened"]).toBe("Incident opened");
    expect(eventLabels["notification.test"]).toBe("Test notification");
  });

  it("maps statuses to tones", () => {
    expect(statusTone("delivered")).toBe("success");
    expect(statusTone("failed")).toBe("danger");
    expect(statusTone("retrying")).toBe("warning");
    expect(statusTone("queued")).toBe("neutral");
    expect(statusTone("sending")).toBe("neutral");
  });

  it("only treats failed retryable deliveries as retryable", () => {
    expect(isDeliveryRetryable({ status: "failed", retryable: true })).toBe(true);
    expect(isDeliveryRetryable({ status: "failed", retryable: false })).toBe(false);
    expect(isDeliveryRetryable({ status: "delivered", retryable: true })).toBe(false);
    expect(isDeliveryRetryable({ status: "retrying", retryable: true })).toBe(false);
  });

  it("formats relative time", () => {
    const now = new Date("2026-01-10T12:00:00Z").getTime();
    expect(formatRelativeTime(null, now)).toBe("Never");
    expect(formatRelativeTime("garbage", now)).toBe("Unknown");
    expect(formatRelativeTime("2026-01-10T11:59:50Z", now)).toBe("just now");
    expect(formatRelativeTime("2026-01-10T11:55:00Z", now)).toBe("5 minutes ago");
    expect(formatRelativeTime("2026-01-10T11:00:00Z", now)).toBe("1 hour ago");
    expect(formatRelativeTime("2026-01-08T12:00:00Z", now)).toBe("2 days ago");
    expect(formatRelativeTime("2026-01-10T12:10:00Z", now)).toBe("in 10 minutes");
  });

  it("formats durations and failure categories", () => {
    expect(formatDurationMs(null)).toBe("—");
    expect(formatDurationMs(240)).toBe("240 ms");
    expect(formatDurationMs(1500)).toBe("1.5 s");
    expect(failureCategoryLabel(null)).toBe("None");
    expect(failureCategoryLabel("TIMEOUT")).toBe("Request timed out");
    expect(failureCategoryLabel("SOME_NEW_CATEGORY")).toBe("Some new category");
  });

  it("builds delivery queries and omits default filters", () => {
    expect(buildDeliveryQuery(defaultDeliveryFilters, 1, 10)).toEqual({ page: 1, pageSize: 10 });
    const query = buildDeliveryQuery(
      {
        status: "failed",
        channel: "slack",
        eventType: "incident.resolved",
        from: "2026-01-01",
        to: "2026-01-31",
      },
      2,
      10,
    );
    expect(query).toMatchObject({
      page: 2,
      pageSize: 10,
      status: "failed",
      channel: "slack",
      eventType: "incident.resolved",
    });
    expect(new Date(query.from ?? "").getTime()).toBeLessThan(new Date(query.to ?? "").getTime());
  });

  it("ignores malformed dates", () => {
    const query = buildDeliveryQuery({ ...defaultDeliveryFilters, from: "nope", to: "" }, 1, 10);
    expect(query.from).toBeUndefined();
    expect(query.to).toBeUndefined();
  });

  it("detects active filters", () => {
    expect(hasActiveFilters(defaultDeliveryFilters)).toBe(false);
    expect(hasActiveFilters({ ...defaultDeliveryFilters, status: "failed" })).toBe(true);
    expect(hasActiveFilters({ ...defaultDeliveryFilters, from: "2026-01-01" })).toBe(true);
  });

  it("toggles events in canonical order", () => {
    expect(toggleEvent(["incident.resolved"], "incident.opened", true)).toEqual([
      "incident.opened",
      "incident.resolved",
    ]);
    expect(toggleEvent(["incident.opened", "incident.resolved"], "incident.opened", false)).toEqual(
      ["incident.resolved"],
    );
    expect(summarizeEvents([])).toBe("No events");
    expect(summarizeEvents(["incident.opened", "incident.resolved"])).toBe("opened, resolved");
  });
});
