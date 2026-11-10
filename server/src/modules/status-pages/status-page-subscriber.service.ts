import crypto from "node:crypto";
import { Types } from "mongoose";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { sendNotificationEmail } from "../../lib/email/email.service.js";
import {
  renderConfirmationEmail,
  renderUnsubscribedEmail,
} from "../../lib/email/status-page-email-template.service.js";
import { createApiError } from "../../lib/errors/create-api-error.js";
import { consumeRateLimit } from "../../lib/rate-limit.js";
import { StatusPageSubscriber } from "./status-page-subscriber.model.js";
import type { IPublicStatusPage } from "./status-page.model.js";
import { maskEmail, publicUrlFor } from "./status-page-view.js";
import type { SubscriberEvents } from "./status-page.types.js";

export const confirmationTtlMs = 24 * 60 * 60 * 1000;
export const resendCooldownMs = 60 * 1000;

export const genericSubscribeResponse = {
  status: "ok" as const,
  message:
    "If this address can be subscribed, we have sent a confirmation email. Open it to finish subscribing.",
};

export const generateToken = (): string => crypto.randomBytes(32).toString("base64url");

export const hashToken = (token: string): string =>
  crypto.createHash("sha256").update(token).digest("hex");

const unsubscribeSignature = (pageId: string, subscriberId: string): string =>
  crypto
    .createHmac("sha256", env.STATUS_PAGE_TOKEN_SECRET)
    .update(`status-page-unsubscribe:${pageId}:${subscriberId}`)
    .digest("base64url");

export const createUnsubscribeToken = (pageId: string, subscriberId: string): string =>
  `${subscriberId}.${unsubscribeSignature(pageId, subscriberId)}`;

export const unsubscribeUrlFor = (slug: string, pageId: string, subscriberId: string): string =>
  `${publicUrlFor(slug)}/unsubscribe?token=${createUnsubscribeToken(pageId, subscriberId)}`;

const confirmUrlFor = (slug: string, token: string): string =>
  `${publicUrlFor(slug)}/confirm?token=${token}`;

const invalidToken = () =>
  createApiError("This link is invalid or has expired.", 400, "INVALID_TOKEN");

const sendInBackground = (task: () => Promise<void>, context: string) => {
  void task().catch((error: unknown) => {
    logger.warn({ err: error }, `${context} failed`);
  });
};

const deliverConfirmation = async (
  page: Pick<IPublicStatusPage, "name" | "slug">,
  email: string,
  token: string,
) => {
  const rendered = await renderConfirmationEmail({
    pageName: page.name,
    confirmUrl: confirmUrlFor(page.slug, token),
    expiryHours: Math.round(confirmationTtlMs / 3_600_000),
  });
  const result = await sendNotificationEmail({
    to: email,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
  });
  if (!result.ok) {
    logger.warn({ category: result.category }, "Status page confirmation email was not delivered");
  }
};

const resolveEvents = (
  page: Pick<IPublicStatusPage, "subscriberEvents">,
  requested: Partial<SubscriberEvents> | undefined,
): SubscriberEvents => {
  const offered = page.subscriberEvents ?? { opened: true, acknowledged: false, resolved: true };
  const events: SubscriberEvents = {
    opened: offered.opened && (requested?.opened ?? true),
    acknowledged: offered.acknowledged && (requested?.acknowledged ?? false),
    resolved: offered.resolved && (requested?.resolved ?? true),
  };
  if (!events.opened && !events.acknowledged && !events.resolved) {
    throw createApiError("Choose at least one type of update.", 400, "INVALID_REQUEST", {
      events: "Choose at least one type of update.",
    });
  }
  return events;
};

const emailLimitKey = (pageId: string, email: string) =>
  `ratelimit:status-sub:${hashToken(`${pageId}:${email}`)}`;

const issueConfirmation = async (
  page: IPublicStatusPage,
  email: string,
  subscriberFilter: Record<string, unknown>,
  update: Record<string, unknown>,
) => {
  const token = generateToken();
  const now = new Date();
  await StatusPageSubscriber.updateOne(subscriberFilter, {
    $set: {
      ...update,
      confirmationTokenHash: hashToken(token),
      confirmationExpiresAt: new Date(now.getTime() + confirmationTtlMs),
      lastConfirmationSentAt: now,
    },
  });
  sendInBackground(() => deliverConfirmation(page, email, token), "Confirmation email");
};

export const requestSubscription = async (
  page: IPublicStatusPage,
  input: { email: string; events?: Partial<SubscriberEvents> },
  now = new Date(),
) => {
  if (!page.subscribersEnabled) {
    throw createApiError("Status page not found.", 404, "STATUS_PAGE_NOT_FOUND");
  }
  const events = resolveEvents(page, input.events);
  const pageId = String(page._id);
  const allowed = await consumeRateLimit(emailLimitKey(pageId, input.email), 3, 3600);
  if (!allowed) return genericSubscribeResponse;

  const existing = await StatusPageSubscriber.findOne({
    pageId: new Types.ObjectId(pageId),
    email: input.email,
  });
  if (!existing) {
    try {
      const created = await StatusPageSubscriber.create({
        pageId: new Types.ObjectId(pageId),
        email: input.email,
        status: "pending",
        events,
      });
      await issueConfirmation(page, input.email, { _id: created._id }, {});
    } catch (error) {
      if ((error as { code?: number }).code !== 11000) throw error;
    }
    return genericSubscribeResponse;
  }

  if (existing.status === "active") return genericSubscribeResponse;
  const lastSent = existing.lastConfirmationSentAt
    ? new Date(existing.lastConfirmationSentAt).getTime()
    : 0;
  if (existing.status === "pending" && now.getTime() - lastSent < resendCooldownMs) {
    return genericSubscribeResponse;
  }
  await issueConfirmation(page, input.email, { _id: existing._id }, { status: "pending", events });
  return genericSubscribeResponse;
};

export const resendConfirmation = async (
  page: IPublicStatusPage,
  email: string,
  now = new Date(),
) => {
  const pageId = String(page._id);
  const allowed = await consumeRateLimit(emailLimitKey(pageId, email), 3, 3600);
  if (!allowed || !page.subscribersEnabled) return genericSubscribeResponse;
  const existing = await StatusPageSubscriber.findOne({
    pageId: new Types.ObjectId(pageId),
    email,
    status: "pending",
  });
  if (!existing) return genericSubscribeResponse;
  const lastSent = existing.lastConfirmationSentAt
    ? new Date(existing.lastConfirmationSentAt).getTime()
    : 0;
  if (now.getTime() - lastSent < resendCooldownMs) return genericSubscribeResponse;
  await issueConfirmation(page, email, { _id: existing._id }, {});
  return genericSubscribeResponse;
};

export const verifySubscription = async (
  page: IPublicStatusPage,
  token: string,
  now = new Date(),
) => {
  const digest = hashToken(token);
  const confirmed = await StatusPageSubscriber.findOneAndUpdate(
    {
      pageId: new Types.ObjectId(String(page._id)),
      status: "pending",
      confirmationTokenHash: digest,
      confirmationExpiresAt: { $gt: now },
    },
    {
      $set: { status: "active", verifiedAt: now },
      $unset: { confirmationTokenHash: "", confirmationExpiresAt: "" },
    },
    { new: true },
  );
  if (!confirmed) throw invalidToken();
  return { status: "confirmed" as const, pageName: page.name };
};

const parseUnsubscribeToken = (
  token: string,
): { subscriberId: string; signature: string } | null => {
  const [subscriberId, signature, ...rest] = token.split(".");
  if (!subscriberId || !signature || rest.length > 0 || !/^[a-f\d]{24}$/i.test(subscriberId)) {
    return null;
  }
  return { subscriberId, signature };
};

const authorizeUnsubscribe = async (page: IPublicStatusPage | null, token: string) => {
  const parsed = parseUnsubscribeToken(token);
  if (!page || !parsed) throw invalidToken();
  const expected = Buffer.from(unsubscribeSignature(String(page._id), parsed.subscriberId));
  const received = Buffer.from(parsed.signature);
  if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) {
    throw invalidToken();
  }
  const subscriber = await StatusPageSubscriber.findOne({
    _id: new Types.ObjectId(parsed.subscriberId),
    pageId: new Types.ObjectId(String(page._id)),
  });
  if (!subscriber) throw invalidToken();
  return subscriber;
};

export const getUnsubscribeInfo = async (page: IPublicStatusPage | null, token: string) => {
  const subscriber = await authorizeUnsubscribe(page, token);
  return {
    pageName: (page as IPublicStatusPage).name,
    emailMasked: maskEmail(subscriber.email),
    alreadyUnsubscribed: subscriber.status === "unsubscribed",
  };
};

export const unsubscribe = async (page: IPublicStatusPage | null, token: string) => {
  const subscriber = await authorizeUnsubscribe(page, token);
  const target = page as IPublicStatusPage;
  if (subscriber.status !== "unsubscribed") {
    const changed = await StatusPageSubscriber.findOneAndUpdate(
      { _id: subscriber._id, status: { $in: ["pending", "active"] } },
      {
        $set: { status: "unsubscribed", unsubscribedAt: new Date() },
        $unset: { confirmationTokenHash: "", confirmationExpiresAt: "" },
      },
      { new: true },
    );
    if (changed && subscriber.status === "active") {
      sendInBackground(async () => {
        const rendered = await renderUnsubscribedEmail({
          pageName: target.name,
          statusUrl: publicUrlFor(target.slug),
        });
        await sendNotificationEmail({
          to: subscriber.email,
          subject: rendered.subject,
          html: rendered.html,
          text: rendered.text,
        });
      }, "Unsubscribe confirmation email");
    }
  }
  return { status: "unsubscribed" as const, pageName: target.name };
};
