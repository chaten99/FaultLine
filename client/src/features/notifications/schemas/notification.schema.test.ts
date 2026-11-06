import { describe, expect, it } from "vitest";
import {
  editIntegrationSchema,
  replaceSlackUrlSchema,
  replaceWebhookUrlSchema,
  slackIntegrationSchema,
  webhookIntegrationSchema,
} from "./notification.schema";

const slackUrl = "https://hooks.slack.com/services/T00000000/B00000000/abcdefGHIJ123456";

describe("slack integration schema", () => {
  it("accepts a valid slack webhook", () => {
    const result = slackIntegrationSchema.safeParse({
      name: " Ops channel ",
      webhookUrl: slackUrl,
      events: ["incident.opened"],
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.name).toBe("Ops channel");
  });

  it.each([
    "http://hooks.slack.com/services/T0/B0/x",
    "https://example.com/services/T0/B0/x",
    "https://hooks.slack.com/services/T0/B0",
    "https://hooks.slack.com.evil.test/services/T0/B0/x",
    "not a url",
  ])("rejects %s", (webhookUrl) => {
    expect(
      slackIntegrationSchema.safeParse({ name: "x", webhookUrl, events: ["incident.opened"] })
        .success,
    ).toBe(false);
    expect(replaceSlackUrlSchema.safeParse({ webhookUrl }).success).toBe(false);
  });

  it("requires a name and at least one event", () => {
    expect(
      slackIntegrationSchema.safeParse({
        name: "",
        webhookUrl: slackUrl,
        events: ["incident.opened"],
      }).success,
    ).toBe(false);
    expect(
      slackIntegrationSchema.safeParse({ name: "a", webhookUrl: slackUrl, events: [] }).success,
    ).toBe(false);
  });
});

describe("webhook integration schema", () => {
  const base = { name: "Pager", events: ["incident.opened", "incident.resolved"] };

  it("accepts https endpoints", () => {
    expect(
      webhookIntegrationSchema.safeParse({ ...base, url: "https://hooks.example.com/faultline" })
        .success,
    ).toBe(true);
  });

  it.each([
    "http://example.com/hook",
    "https://user:pass@example.com/hook",
    "ftp://example.com",
    "example.com/hook",
  ])("rejects %s", (url) => {
    expect(webhookIntegrationSchema.safeParse({ ...base, url }).success).toBe(false);
    expect(replaceWebhookUrlSchema.safeParse({ url }).success).toBe(false);
  });

  it("rejects unknown events", () => {
    expect(
      webhookIntegrationSchema.safeParse({
        name: "a",
        url: "https://example.com",
        events: ["incident.exploded"],
      }).success,
    ).toBe(false);
  });
});

describe("edit integration schema", () => {
  it("validates name length", () => {
    expect(
      editIntegrationSchema.safeParse({ name: "a".repeat(61), events: ["incident.opened"] })
        .success,
    ).toBe(false);
    expect(
      editIntegrationSchema.safeParse({ name: "ok", events: ["incident.opened"] }).success,
    ).toBe(true);
  });
});
