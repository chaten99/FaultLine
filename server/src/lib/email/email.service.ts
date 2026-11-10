import { Resend } from "resend";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { renderAuthenticationEmail } from "./email-template.service.js";
import type { ChannelResult } from "../../modules/notifications/notification.types.js";

const resend = new Resend(env.RESEND_API_KEY);

export const sendVerificationEmail = async (email: string, code: string, name = "there") => {
  return sendEmail(email, "Verify your FaultLine email", code, "verification", name);
};

export const sendPasswordResetEmail = async (email: string, code: string, name = "there") => {
  return sendEmail(email, "Reset your FaultLine password", code, "password-reset", name);
};

const sendEmail = async (
  email: string,
  subject: string,
  code: string,
  purpose: "verification" | "password-reset",
  name: string,
) => {
  const rendered = await renderAuthenticationEmail(purpose, {
    name,
    code,
    expiryMinutes: Math.ceil(env.OTP_CODE_TTL_SECONDS / 60),
  });
  const { error } = await resend.emails.send({
    from: env.RESEND_FROM_EMAIL,
    to: email,
    subject,
    text: rendered.text,
    html: rendered.html,
  });
  if (error) {
    logger.error({ emailDomain: email.split("@")[1] }, "Authentication email delivery failed");
    throw new Error("Authentication email delivery failed");
  }
};

export type NotificationEmail = {
  to: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
};

export const sendNotificationEmail = async (message: NotificationEmail): Promise<ChannelResult> => {
  const startedAt = performance.now();
  const elapsed = () => Math.max(1, Math.round(performance.now() - startedAt));
  const failure = (
    category: Extract<ChannelResult, { ok: false }>["category"],
    transient: boolean,
    responseCode: number | null,
  ): ChannelResult => ({
    ok: false,
    category,
    transient,
    responseCode,
    retryAfterMs: null,
    durationMs: elapsed(),
  });
  try {
    const { error } = await resend.emails.send({
      from: env.RESEND_FROM_EMAIL,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
      ...(message.headers ? { headers: message.headers } : {}),
    });
    if (!error) return { ok: true, responseCode: 200, durationMs: elapsed() };
    const statusCode = typeof error.statusCode === "number" ? error.statusCode : null;
    if (statusCode === 429) return failure("RATE_LIMITED", true, statusCode);
    if (statusCode !== null && statusCode >= 500)
      return failure("PROVIDER_ERROR", true, statusCode);
    if (statusCode === 401 || statusCode === 403) {
      return failure("INVALID_CREDENTIALS", false, statusCode);
    }
    if (statusCode === 400 || statusCode === 422)
      return failure("INVALID_PAYLOAD", false, statusCode);
    if (statusCode === null) return failure("NETWORK_ERROR", true, null);
    return failure("UNKNOWN", false, statusCode);
  } catch {
    logger.warn("Notification email provider request failed");
    return failure("NETWORK_ERROR", true, null);
  }
};
