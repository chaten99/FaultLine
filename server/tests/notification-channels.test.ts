import crypto from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildSlackPayload,
  isValidSlackWebhookUrl,
} from "../src/modules/notifications/channels/slack.channel.js";
import {
  buildWebhookPayload,
  sendWebhookNotification,
  signWebhookBody,
  verifyWebhookSignature,
} from "../src/modules/notifications/channels/webhook.channel.js";
import { renderNotificationEmail } from "../src/lib/email/notification-email-template.service.js";
import type { IncidentNotificationSnapshot } from "../src/modules/notifications/notification.types.js";
import type { SecureTransport } from "../src/modules/notifications/secure-http.service.js";

const resendSend = vi.hoisted(() => vi.fn());
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: resendSend };
  },
}));

const { sendNotificationEmail } = await import("../src/lib/email/email.service.js");

const snapshot = (
  overrides: Partial<IncidentNotificationSnapshot> = {},
): IncidentNotificationSnapshot => ({
  incidentId: "65f000000000000000000001",
  monitorId: "65f000000000000000000002",
  monitorName: "Checkout API",
  title: "Incident on Checkout API: UNEXPECTED_STATUS",
  status: "open",
  openedAt: "2026-11-06T10:00:00.000Z",
  firstFailureAt: "2026-11-06T09:58:00.000Z",
  acknowledgedAt: null,
  acknowledgedByName: null,
  resolvedAt: null,
  resolutionType: null,
  durationMs: null,
  failureCategory: "UNEXPECTED_STATUS",
  statusCode: 503,
  failureThreshold: 3,
  recoveryThreshold: 2,
  recoveryCheckCount: null,
  incidentUrl: "https://app.faultline.test/incidents/65f000000000000000000001",
  ...overrides,
});

describe("Slack channel", () => {
  it("accepts only the documented Slack Incoming Webhook shape", () => {
    expect(isValidSlackWebhookUrl("https://hooks.slack.com/services/T0001/B0002/abcDEF123")).toBe(
      true,
    );
    for (const bad of [
      "http://hooks.slack.com/services/T0001/B0002/abcDEF123",
      "https://hooks.slack.com.evil.com/services/T0001/B0002/abcDEF123",
      "https://evil.com/services/T0001/B0002/abcDEF123",
      "https://hooks.slack.com/services/T0001/B0002",
      "https://hooks.slack.com/services/T0001/B0002/abc?x=1",
      "https://user:pw@hooks.slack.com/services/T0001/B0002/abc",
      "https://hooks.slack.com:8443/services/T0001/B0002/abc",
      "https://127.0.0.1/services/T0001/B0002/abc",
      "garbage",
    ]) {
      expect(isValidSlackWebhookUrl(bad)).toBe(false);
    }
  });

  it("builds an opened message with Block Kit, fallback text and a link", () => {
    const payload = buildSlackPayload("incident.opened", snapshot()) as {
      text: string;
      blocks: Array<{ type: string; text?: { text: string }; elements?: Array<{ url: string }> }>;
    };
    expect(payload.text).toContain("Incident detected: Checkout API");
    expect(payload.text).toContain("HTTP 503");
    expect(payload.blocks[0]).toMatchObject({ type: "header" });
    expect(payload.blocks.at(-1)?.elements?.[0]?.url).toBe(snapshot().incidentUrl);
  });

  it("escapes control characters in user-controlled text", () => {
    const payload = buildSlackPayload(
      "incident.opened",
      snapshot({ monitorName: "<!channel> A&B <@U123>" }),
    ) as {
      text: string;
      blocks: Array<{ fields?: Array<{ type: string; text: string }> }>;
    };
    expect(payload.text).not.toContain("<!channel>");
    expect(payload.text).toContain("&lt;!channel&gt;");
    const mrkdwn = payload.blocks
      .flatMap((block) => block.fields ?? [])
      .map((f) => f.text)
      .join(" | ");
    expect(mrkdwn).not.toContain("<!channel>");
    expect(mrkdwn).not.toContain("<@U123>");
    expect(mrkdwn).toContain("A&amp;B");
  });

  it("builds acknowledged and resolved messages", () => {
    const ack = buildSlackPayload(
      "incident.acknowledged",
      snapshot({
        status: "acknowledged",
        acknowledgedAt: "2026-11-06T10:05:00.000Z",
        acknowledgedByName: "Asha",
      }),
    ) as { text: string };
    expect(ack.text).toContain("acknowledged");
    expect(ack.text).toContain("Asha");
    const resolved = buildSlackPayload(
      "incident.resolved",
      snapshot({
        status: "resolved",
        resolvedAt: "2026-11-06T10:09:00.000Z",
        durationMs: 660_000,
        resolutionType: "automatic",
      }),
    ) as { text: string };
    expect(resolved.text).toContain("Service recovered: Checkout API");
    expect(resolved.text).toContain("11m 0s");
  });

  it("marks test messages clearly", () => {
    const payload = buildSlackPayload("notification.test", null) as { text: string };
    expect(payload.text).toContain("test notification");
  });
});

describe("webhook channel", () => {
  const secret = "whsec_test_secret_value";

  it("builds the versioned payload from persisted incident values only", () => {
    const payload = buildWebhookPayload({
      eventId: "incident.opened:65f000000000000000000001",
      eventType: "incident.opened",
      createdAt: "2026-11-06T10:00:00.000Z",
      snapshot: snapshot(),
    }) as {
      id: string;
      type: string;
      version: number;
      createdAt: string;
      data: Record<string, unknown>;
    };
    expect(payload).toMatchObject({
      id: "incident.opened:65f000000000000000000001",
      type: "incident.opened",
      version: 1,
      createdAt: "2026-11-06T10:00:00.000Z",
    });
    expect(payload.data).toMatchObject({
      incidentId: "65f000000000000000000001",
      monitorId: "65f000000000000000000002",
      status: "open",
      statusCode: 503,
    });
    expect(Object.keys(payload.data)).not.toContain("url");
    expect(JSON.stringify(payload)).not.toMatch(/password|token|authorization|secret/i);
  });

  it("signs timestamp.body with HMAC-SHA256 and verifies in constant time", () => {
    const body = '{"hello":"world"}';
    const timestamp = "1762423200";
    const expected = `v1=${crypto.createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;
    const signature = signWebhookBody(secret, timestamp, body);
    expect(signature).toBe(expected);
    expect(verifyWebhookSignature(secret, timestamp, body, signature)).toBe(true);
    expect(verifyWebhookSignature(secret, timestamp, `${body} `, signature)).toBe(false);
    expect(verifyWebhookSignature(secret, "1762423201", body, signature)).toBe(false);
    expect(verifyWebhookSignature("whsec_other", timestamp, body, signature)).toBe(false);
    expect(verifyWebhookSignature(secret, timestamp, body, "v1=short")).toBe(false);
  });

  it("sends signed headers that a receiver can verify against the exact body", async () => {
    let seen: { headers: Record<string, string>; body: string } | null = null;
    const transport = ((
      options: { headers: Record<string, string> },
      callback: (res: unknown) => void,
    ) => {
      const chunks: string[] = [];
      const listeners: Record<string, () => void> = {};
      const request = {
        on: (event: string, handler: () => void) => {
          listeners[event] = handler;
          return request;
        },
        write: (chunk: string) => chunks.push(chunk),
        destroy: () => undefined,
        end: () => {
          seen = { headers: options.headers, body: chunks.join("") };
          const response = {
            statusCode: 200,
            headers: {},
            destroy: () => undefined,
            on: (event: string, handler: () => void) => {
              if (event === "end") queueMicrotask(handler);
              return response;
            },
          };
          callback(response);
        },
      };
      return request;
    }) as unknown as SecureTransport;

    const result = await sendWebhookNotification(
      {
        url: "https://hooks.example.com/faultline",
        signingSecret: secret,
        deliveryId: "delivery-1",
        eventId: "incident.opened:65f000000000000000000001",
        eventType: "incident.opened",
        createdAt: "2026-11-06T10:00:00.000Z",
        snapshot: snapshot(),
      },
      {
        transport,
        lookup: (_h, _o, cb) => cb(null, [{ address: "93.184.216.34", family: 4 }]),
        now: () => 1_762_423_200_000,
      },
    );

    expect(result).toMatchObject({ ok: true });
    expect(seen).not.toBeNull();
    const { headers, body } = seen as unknown as { headers: Record<string, string>; body: string };
    expect(headers["X-FaultLine-Event"]).toBe("incident.opened");
    expect(headers["X-FaultLine-Delivery"]).toBe("delivery-1");
    expect(headers["X-FaultLine-Timestamp"]).toBe("1762423200");
    expect(
      verifyWebhookSignature(
        secret,
        headers["X-FaultLine-Timestamp"] as string,
        body,
        headers["X-FaultLine-Signature"] as string,
      ),
    ).toBe(true);
    expect(JSON.parse(body).id).toBe("incident.opened:65f000000000000000000001");
    expect(JSON.stringify(headers)).not.toContain(secret);
  });
});

describe("notification emails", () => {
  it("renders the incident opened email with details, link and plain text", async () => {
    const rendered = await renderNotificationEmail("incident.opened", {
      snapshot: snapshot(),
      recipient: "owner@example.com",
    });
    expect(rendered.subject).toBe("[FaultLine] Incident detected: Checkout API");
    expect(rendered.html).toContain("Incident detected: Checkout API");
    expect(rendered.html).toContain("Unexpected HTTP status (HTTP 503)");
    expect(rendered.html).toContain("3 consecutive failed checks");
    expect(rendered.html).toContain(
      'href="https://app.faultline.test/incidents/65f000000000000000000001"',
    );
    expect(rendered.html).toContain("FaultLine");
    expect(rendered.text).toContain("Incident detected: Checkout API");
    expect(rendered.text).toContain("Failure threshold: 3 consecutive failed checks");
    expect(rendered.text).toContain("View incident: https://app.faultline.test/incidents/");
    expect(rendered.text).not.toContain("<");
  });

  it("renders the acknowledged email", async () => {
    const rendered = await renderNotificationEmail("incident.acknowledged", {
      snapshot: snapshot({
        status: "acknowledged",
        acknowledgedAt: "2026-11-06T10:05:00.000Z",
        acknowledgedByName: "Asha Rao",
      }),
      recipient: "owner@example.com",
    });
    expect(rendered.subject).toBe("[FaultLine] Incident acknowledged: Checkout API");
    expect(rendered.html).toContain("Asha Rao");
    expect(rendered.html).toContain("2026-11-06 10:05 UTC");
    expect(rendered.text).toContain("Acknowledged by: Asha Rao");
  });

  it("renders the resolved email with duration and recovery threshold", async () => {
    const rendered = await renderNotificationEmail("incident.resolved", {
      snapshot: snapshot({
        status: "resolved",
        resolvedAt: "2026-11-06T10:09:00.000Z",
        durationMs: 660_000,
        resolutionType: "automatic",
        recoveryCheckCount: 2,
      }),
      recipient: "owner@example.com",
    });
    expect(rendered.subject).toBe("[FaultLine] Service recovered: Checkout API");
    expect(rendered.html).toContain("11m 0s");
    expect(rendered.html).toContain("2 consecutive successful checks");
    expect(rendered.text).toContain("Duration: 11m 0s");
  });

  it("escapes user-controlled values in html and strips line breaks from subjects", async () => {
    const rendered = await renderNotificationEmail("incident.opened", {
      snapshot: snapshot({
        monitorName: '<script>alert("x")</script>\r\nBcc: attacker@example.com',
        title: "<img src=x onerror=alert(1)>",
      }),
      recipient: "owner@example.com",
    });
    expect(rendered.html).not.toContain("<script>");
    expect(rendered.html).not.toContain("<img src=x");
    expect(rendered.html).toContain("&lt;script&gt;");
    expect(rendered.subject).not.toMatch(/[\r\n]/);
  });

  it("renders the test email without incident data", async () => {
    const rendered = await renderNotificationEmail("notification.test", {
      snapshot: null,
      recipient: "owner@example.com",
    });
    expect(rendered.subject).toBe("[FaultLine] Test notification");
    expect(rendered.html).toContain("No incident was created");
  });

  it("never includes credentials in rendered output", async () => {
    const rendered = await renderNotificationEmail("incident.opened", {
      snapshot: snapshot(),
      recipient: "owner@example.com",
    });
    expect(`${rendered.html}${rendered.text}`).not.toMatch(/password|jwt|bearer|otp/i);
  });
});

describe("Resend delivery mapping", () => {
  const message = { to: "owner@example.com", subject: "s", html: "<p>h</p>", text: "t" };

  beforeEach(() => {
    resendSend.mockReset();
  });

  it("reports success when the provider accepts the message", async () => {
    resendSend.mockResolvedValue({ data: { id: "abc" }, error: null });
    expect(await sendNotificationEmail(message)).toMatchObject({ ok: true });
    expect(resendSend).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "owner@example.com",
        subject: "s",
        text: "t",
        html: "<p>h</p>",
      }),
    );
  });

  it.each([
    [429, "RATE_LIMITED", true],
    [500, "PROVIDER_ERROR", true],
    [503, "PROVIDER_ERROR", true],
    [401, "INVALID_CREDENTIALS", false],
    [403, "INVALID_CREDENTIALS", false],
    [422, "INVALID_PAYLOAD", false],
  ])("maps provider status %i to %s", async (statusCode, category, transient) => {
    resendSend.mockResolvedValue({ data: null, error: { statusCode, name: "x", message: "m" } });
    expect(await sendNotificationEmail(message)).toMatchObject({ ok: false, category, transient });
  });

  it("treats thrown SDK errors as transient network failures", async () => {
    resendSend.mockRejectedValue(new Error("socket hang up"));
    expect(await sendNotificationEmail(message)).toMatchObject({
      ok: false,
      category: "NETWORK_ERROR",
      transient: true,
    });
  });
});
