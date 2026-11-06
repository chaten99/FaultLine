import crypto from "node:crypto";
import dns from "node:dns/promises";
import { Types } from "mongoose";
import { createApiError } from "../../lib/errors/create-api-error.js";
import { acquireLock } from "../../lib/redis/redis.service.js";
import { User } from "../auth/user.model.js";
import { isValidSlackWebhookUrl } from "./channels/slack.channel.js";
import {
  encryptSecret,
  generateSigningSecret,
  isEncryptionConfigured,
} from "./notification-crypto.service.js";
import { NotificationDelivery } from "./notification-delivery.model.js";
import { deliveryRetentionDate, processDelivery } from "./notification-delivery.service.js";
import {
  NotificationIntegration,
  type INotificationIntegration,
} from "./notification-integration.model.js";
import { toDeliverySummary } from "./notification-presenter.js";
import {
  assertPermittedUrl,
  DestinationBlockedError,
  isForbiddenAddress,
} from "./secure-http.service.js";
import {
  testEventType,
  type IncidentEventType,
  type IntegrationType,
} from "./notification.types.js";

const maxIntegrationsPerType = 10;

const requireConfigured = () => {
  if (!isEncryptionConfigured()) {
    throw createApiError(
      "Notification integrations are not configured on this server.",
      503,
      "NOTIFICATION_NOT_CONFIGURED",
    );
  }
};

const assertObjectId = (id: string) => {
  if (!Types.ObjectId.isValid(id)) {
    throw createApiError("Integration not found.", 404, "INTEGRATION_NOT_FOUND");
  }
};

export const maskSlackUrl = (value: string): string => {
  const token = new URL(value).pathname.split("/").pop() ?? "";
  return `https://hooks.slack.com/services/••••${token.slice(-4)}`;
};

export const maskWebhookUrl = (value: string): string => `https://${new URL(value).host}/••••`;

export const validateSlackUrl = (value: string): void => {
  if (!isValidSlackWebhookUrl(value)) {
    throw createApiError(
      "Enter a valid Slack Incoming Webhook URL (https://hooks.slack.com/services/...).",
      400,
      "INVALID_INTEGRATION_URL",
      { webhookUrl: "Enter a valid Slack Incoming Webhook URL." },
    );
  }
};

export const validateWebhookUrl = async (value: string): Promise<void> => {
  const reject = (message: string) =>
    createApiError(message, 400, "INVALID_INTEGRATION_URL", { url: message });
  let parsed: URL;
  try {
    parsed = assertPermittedUrl(value);
  } catch (error) {
    if (error instanceof DestinationBlockedError) {
      throw reject("Use a public HTTPS URL (port 443 or 8443) without credentials.");
    }
    throw error;
  }
  const hostname = parsed.hostname.replace(/^\[|\]$/g, "");
  try {
    const addresses = await dns.lookup(hostname, { all: true });
    if (addresses.length === 0 || addresses.some(({ address }) => isForbiddenAddress(address))) {
      throw reject("This destination is not permitted.");
    }
  } catch (error) {
    if ((error as { code?: string }).code === "INVALID_INTEGRATION_URL") throw error;
    throw reject("We couldn't resolve this hostname.");
  }
};

type LastDelivery = { status: string; eventType: string; kind: string; at: string } | null;

export const toIntegrationView = (
  integration: INotificationIntegration,
  lastDelivery: LastDelivery = null,
) => ({
  id: String(integration._id),
  type: integration.type,
  name: integration.name,
  enabled: integration.enabled,
  events: integration.events,
  urlHint: integration.urlHint,
  hasSigningSecret: integration.type === "webhook",
  lastDelivery,
  createdAt: integration.createdAt.toISOString(),
  updatedAt: integration.updatedAt.toISOString(),
});

const loadLastDelivery = async (integrationId: Types.ObjectId): Promise<LastDelivery> => {
  const latest = await NotificationDelivery.findOne({ integrationId })
    .sort({ createdAt: -1 })
    .lean();
  if (!latest) return null;
  return {
    status: latest.status,
    eventType: latest.eventType,
    kind: latest.kind,
    at: (latest.deliveredAt ?? latest.lastAttemptAt ?? latest.createdAt).toISOString(),
  };
};

export const listIntegrations = async (userId: string) => {
  const items = await NotificationIntegration.find({ userId }).sort({ createdAt: -1 }).limit(50);
  const views = await Promise.all(
    items.map(async (item) => toIntegrationView(item, await loadLastDelivery(item._id))),
  );
  return { items: views };
};

const ensureCapacity = async (userId: string, type: IntegrationType) => {
  const count = await NotificationIntegration.countDocuments({ userId, type });
  if (count >= maxIntegrationsPerType) {
    throw createApiError(
      `You can configure up to ${maxIntegrationsPerType} ${type} integrations.`,
      409,
      "INTEGRATION_LIMIT_REACHED",
    );
  }
};

type CreateInput = {
  name: string;
  enabled: boolean;
  events: IncidentEventType[];
};

export const createSlackIntegration = async (
  userId: string,
  input: CreateInput & { webhookUrl: string },
) => {
  requireConfigured();
  validateSlackUrl(input.webhookUrl);
  await ensureCapacity(userId, "slack");
  const id = new Types.ObjectId();
  const created = await NotificationIntegration.create({
    _id: id,
    userId,
    type: "slack",
    name: input.name,
    enabled: input.enabled,
    events: input.events,
    encryptedUrl: encryptSecret(input.webhookUrl, `${userId}:${String(id)}:url`),
    urlHint: maskSlackUrl(input.webhookUrl),
  });
  return { integration: toIntegrationView(created) };
};

export const createWebhookIntegration = async (
  userId: string,
  input: CreateInput & { url: string },
) => {
  requireConfigured();
  await validateWebhookUrl(input.url);
  await ensureCapacity(userId, "webhook");
  const id = new Types.ObjectId();
  const signingSecret = generateSigningSecret();
  const created = await NotificationIntegration.create({
    _id: id,
    userId,
    type: "webhook",
    name: input.name,
    enabled: input.enabled,
    events: input.events,
    encryptedUrl: encryptSecret(input.url, `${userId}:${String(id)}:url`),
    encryptedSigningSecret: encryptSecret(signingSecret, `${userId}:${String(id)}:secret`),
    urlHint: maskWebhookUrl(input.url),
  });
  return { integration: toIntegrationView(created), signingSecret };
};

const findOwned = async (userId: string, id: string) => {
  assertObjectId(id);
  const integration = await NotificationIntegration.findOne({ _id: id, userId });
  if (!integration) throw createApiError("Integration not found.", 404, "INTEGRATION_NOT_FOUND");
  return integration;
};

export const updateIntegration = async (
  userId: string,
  id: string,
  patch: {
    name?: string;
    enabled?: boolean;
    events?: IncidentEventType[];
    webhookUrl?: string;
    url?: string;
  },
) => {
  const integration = await findOwned(userId, id);
  const set: Record<string, unknown> = {};
  if (patch.name !== undefined) set.name = patch.name;
  if (patch.enabled !== undefined) set.enabled = patch.enabled;
  if (patch.events !== undefined) set.events = patch.events;

  const replacement = integration.type === "slack" ? patch.webhookUrl : patch.url;
  const wrongField = integration.type === "slack" ? patch.url : patch.webhookUrl;
  if (wrongField !== undefined) {
    throw createApiError(
      "This field cannot be changed for this integration.",
      400,
      "INVALID_REQUEST",
      {
        [integration.type === "slack" ? "url" : "webhookUrl"]:
          "Not supported for this integration.",
      },
    );
  }
  if (replacement !== undefined) {
    requireConfigured();
    if (integration.type === "slack") {
      validateSlackUrl(replacement);
      set.urlHint = maskSlackUrl(replacement);
    } else {
      await validateWebhookUrl(replacement);
      set.urlHint = maskWebhookUrl(replacement);
    }
    set.encryptedUrl = encryptSecret(replacement, `${userId}:${id}:url`);
  }

  const updated = await NotificationIntegration.findOneAndUpdate(
    { _id: id, userId },
    { $set: set },
    { new: true },
  );
  if (!updated) throw createApiError("Integration not found.", 404, "INTEGRATION_NOT_FOUND");
  return { integration: toIntegrationView(updated, await loadLastDelivery(updated._id)) };
};

export const rotateSigningSecret = async (userId: string, id: string) => {
  const integration = await findOwned(userId, id);
  if (integration.type !== "webhook") {
    throw createApiError(
      "Only webhook integrations have a signing secret.",
      400,
      "INVALID_REQUEST",
    );
  }
  requireConfigured();
  const signingSecret = generateSigningSecret();
  const updated = await NotificationIntegration.findOneAndUpdate(
    { _id: id, userId },
    { $set: { encryptedSigningSecret: encryptSecret(signingSecret, `${userId}:${id}:secret`) } },
    { new: true },
  );
  if (!updated) throw createApiError("Integration not found.", 404, "INTEGRATION_NOT_FOUND");
  return { integration: toIntegrationView(updated), signingSecret };
};

export const deleteIntegration = async (userId: string, id: string) => {
  await findOwned(userId, id);
  await NotificationIntegration.deleteOne({ _id: id, userId });
  return { status: "ok" as const };
};

const runTestDelivery = async (input: {
  userId: string;
  channel: "email" | "slack" | "webhook";
  integration?: INotificationIntegration;
}) => {
  const testId = crypto.randomUUID();
  const eventId = `test:${testId}`;
  const created = await NotificationDelivery.create({
    deliveryKey: `test|${testId}`,
    kind: "test",
    eventId,
    eventType: testEventType,
    userId: input.userId,
    channel: input.channel,
    integrationId: input.integration?._id,
    integrationName: input.integration?.name,
    status: "queued",
    attempts: 0,
    generation: 0,
    eventCreatedAt: new Date(),
    expiresAt: deliveryRetentionDate(),
  });
  await processDelivery({ deliveryId: String(created._id), generation: 0 }, { maxAttempts: 1 });
  const finished = await NotificationDelivery.findById(created._id);
  if (!finished) throw createApiError("Delivery not found.", 404, "DELIVERY_NOT_FOUND");
  return { delivery: toDeliverySummary(finished) };
};

const enforceTestCooldown = async (userId: string, target: string) => {
  let allowed = true;
  try {
    allowed = await acquireLock(`cooldown:notification-test:${userId}:${target}`, "1", 10_000);
  } catch {
    allowed = true;
  }
  if (!allowed) {
    throw createApiError(
      "Please wait a few seconds before sending another test notification.",
      429,
      "RATE_LIMITED",
    );
  }
};

export const testIntegration = async (userId: string, id: string) => {
  const integration = await findOwned(userId, id);
  if (!integration.enabled) {
    throw createApiError(
      "Enable this integration before sending a test notification.",
      409,
      "INVALID_REQUEST",
    );
  }
  requireConfigured();
  await enforceTestCooldown(userId, id);
  return runTestDelivery({ userId, channel: integration.type, integration });
};

export const testEmail = async (userId: string) => {
  const user = await User.findById(userId).select("emailVerifiedAt").lean();
  if (!user?.emailVerifiedAt) {
    throw createApiError(
      "Verify your email address before sending test notifications.",
      409,
      "EMAIL_NOT_VERIFIED",
    );
  }
  await enforceTestCooldown(userId, "email");
  return runTestDelivery({ userId, channel: "email" });
};
