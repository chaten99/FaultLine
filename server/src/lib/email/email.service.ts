import { Resend } from "resend";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { renderAuthenticationEmail } from "./email-template.service.js";

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
