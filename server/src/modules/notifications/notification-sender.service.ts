import { logger } from "../../config/logger.js";
import { sendNotificationEmail } from "../../lib/email/email.service.js";
import { renderNotificationEmail } from "../../lib/email/notification-email-template.service.js";
import { User } from "../auth/user.model.js";
import { WorkspaceMember } from "../workspaces/workspace-member.model.js";
import { decryptSecret } from "./notification-crypto.service.js";
import { NotificationIntegration } from "./notification-integration.model.js";
import type { INotificationDelivery } from "./notification-delivery.model.js";
import { sendSlackNotification } from "./channels/slack.channel.js";
import { sendWebhookNotification } from "./channels/webhook.channel.js";
import type { ChannelResult, FailureCategory } from "./notification.types.js";
import type { SecureClientDeps } from "./secure-http.service.js";

const permanent = (category: FailureCategory): ChannelResult => ({
  ok: false,
  category,
  transient: false,
  responseCode: null,
  retryAfterMs: null,
  durationMs: 0,
});

export const sendDelivery = async (
  delivery: INotificationDelivery,
  deps?: SecureClientDeps,
): Promise<ChannelResult> => {
  const snapshot = delivery.snapshot ?? null;

  if (delivery.channel === "email") {
    const membership = await WorkspaceMember.findOne({
      workspaceId: delivery.workspaceId,
      userId: delivery.userId,
      status: "active",
    }).lean();
    if (!membership) return permanent("SUBSCRIPTION_INACTIVE");
    const user = await User.findById(delivery.userId).select("email emailVerifiedAt");
    if (!user?.emailVerifiedAt) return permanent("EMAIL_NOT_VERIFIED");
    const rendered = await renderNotificationEmail(delivery.eventType, {
      snapshot,
      recipient: user.email,
    });
    return sendNotificationEmail({
      to: user.email,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    });
  }

  const integration = delivery.integrationId
    ? await NotificationIntegration.findOne({
        _id: delivery.integrationId,
        workspaceId: delivery.workspaceId,
      }).select("+encryptedUrl +encryptedSigningSecret")
    : null;
  if (!integration || !integration.enabled) return permanent("INTEGRATION_UNAVAILABLE");

  let url: string;
  let signingSecret: string | null = null;
  try {
    const context = `${String(integration.userId)}:${String(integration._id)}`;
    url = decryptSecret(integration.encryptedUrl, `${context}:url`);
    if (integration.type === "webhook") {
      if (!integration.encryptedSigningSecret) return permanent("CONFIGURATION_ERROR");
      signingSecret = decryptSecret(integration.encryptedSigningSecret, `${context}:secret`);
    }
  } catch {
    logger.error({ integrationId: String(integration._id) }, "Failed to decrypt integration");
    return permanent("CONFIGURATION_ERROR");
  }

  if (integration.type === "slack") {
    return sendSlackNotification(url, delivery.eventType, snapshot, deps);
  }
  if (!signingSecret) return permanent("CONFIGURATION_ERROR");
  return sendWebhookNotification(
    {
      url,
      signingSecret,
      deliveryId: String(delivery._id),
      eventId: delivery.eventId,
      eventType: delivery.eventType,
      createdAt: delivery.eventCreatedAt.toISOString(),
      snapshot,
    },
    deps,
  );
};
