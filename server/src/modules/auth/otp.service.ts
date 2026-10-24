import crypto from "node:crypto";
import { OtpChallenge } from "./otp-challenge.model.js";
import { PasswordResetGrant } from "./password-reset-grant.model.js";
import { PendingLogin } from "./pending-login.model.js";
import { User } from "./user.model.js";
import { env } from "../../config/env.js";
import { createApiError } from "../../lib/errors/create-api-error.js";
import { sendPasswordResetEmail, sendVerificationEmail } from "../../lib/email/email.service.js";

type OtpPurpose = "email_verification" | "password_reset";
const normalizeEmail = (email: string) => email.trim().toLowerCase();
const code = () => crypto.randomInt(100000, 1000000).toString();
const digest = (id: string, email: string, purpose: OtpPurpose, value: string) =>
  crypto
    .createHmac("sha256", env.OTP_HASH_SECRET)
    .update(`${id}:${email}:${purpose}:${value}`)
    .digest("hex");
const hashGrant = (value: string) =>
  crypto.createHmac("sha256", env.OTP_HASH_SECRET).update(`grant:${value}`).digest("hex");

export const issueOtp = async (input: {
  email: string;
  purpose: OtpPurpose;
  userId?: string;
  ipAddress: string;
  name?: string;
  pendingLoginId?: string;
}) => {
  const email = normalizeEmail(input.email);
  const since = new Date(Date.now() - 3_600_000);
  if (
    (await OtpChallenge.countDocuments({
      ipAddress: input.ipAddress,
      createdAt: { $gte: since },
    })) >= env.OTP_MAX_SENDS_PER_HOUR
  )
    throw createApiError("Too many attempts. Please try again later.", 429, "OTP_RATE_LIMITED");
  const recent = await OtpChallenge.findOne({
    email,
    purpose: input.purpose,
    createdAt: { $gte: since },
  }).sort({ createdAt: -1 });
  if (recent && recent.createdAt.getTime() + env.OTP_RESEND_COOLDOWN_SECONDS * 1000 > Date.now())
    throw createApiError("Please wait before requesting another code.", 429, "OTP_COOLDOWN");
  await OtpChallenge.updateMany(
    { email, purpose: input.purpose, consumedAt: null, supersededAt: null },
    { supersededAt: new Date() },
  );
  const value = code();
  const challenge = new OtpChallenge({
    userId: input.userId ?? null,
    pendingLoginId: input.pendingLoginId ?? null,
    email,
    purpose: input.purpose,
    digest: "pending",
    expiresAt: new Date(Date.now() + env.OTP_CODE_TTL_SECONDS * 1000),
    deliveryStatus: "pending",
    ipAddress: input.ipAddress,
  });
  challenge.digest = digest(String(challenge._id), email, input.purpose, value);
  await challenge.save();
  try {
    if (input.purpose === "email_verification") await sendVerificationEmail(email, value, input.name);
    else await sendPasswordResetEmail(email, value, input.name);
    challenge.deliveryStatus = "sent";
    await challenge.save();
  } catch {
    challenge.deliveryStatus = "failed";
    await challenge.save();
    throw createApiError(
      "We couldn't send the email. Please try again.",
      503,
      "OTP_DELIVERY_FAILED",
    );
  }
  return { cooldownSeconds: env.OTP_RESEND_COOLDOWN_SECONDS, challengeId: String(challenge._id) };
};

export const hashContinuation = (value: string) =>
  crypto.createHmac("sha256", env.OTP_HASH_SECRET).update(`login:${value}`).digest("hex");

export const startLoginVerification = async (user: { id: string; email: string; name: string; ipAddress: string }) => {
  const rawChallenge = crypto.randomBytes(32).toString("hex");
  const pending = await PendingLogin.create({
    userId: user.id,
    email: user.email,
    digest: hashContinuation(rawChallenge),
    expiresAt: new Date(Date.now() + env.OTP_CODE_TTL_SECONDS * 1000),
  });
  try {
    const result = await issueOtp({
      email: user.email,
      userId: user.id,
      purpose: "email_verification",
      ipAddress: user.ipAddress,
      name: user.name,
      pendingLoginId: String(pending._id),
    });
    await PendingLogin.updateOne({ _id: pending._id }, { otpChallengeId: result.challengeId });
  } catch (error) {
    await PendingLogin.deleteOne({ _id: pending._id });
    throw error;
  }
  return { challengeId: rawChallenge, email: user.email };
};

export const resendLoginVerification = async (rawChallenge: string, emailInput: string, ipAddress: string) => {
  const email = normalizeEmail(emailInput);
  const pending = await PendingLogin.findOne({
    digest: hashContinuation(rawChallenge),
    email,
    consumedAt: null,
    supersededAt: null,
    expiresAt: { $gt: new Date() },
  });
  if (!pending) throw createApiError("That verification session is invalid or has expired.", 401, "INVALID_OTP");
  const user = await User.findById(pending.userId);
  if (!user) throw createApiError("That verification session is invalid or has expired.", 401, "INVALID_OTP");
  await issueOtp({ email, userId: String(user._id), purpose: "email_verification", ipAddress, name: user.name, pendingLoginId: String(pending._id) });
};

export const verifyLoginOtp = async (emailInput: string, value: string, rawChallenge: string) => {
  const email = normalizeEmail(emailInput);
  const pending = await PendingLogin.findOne({
    digest: hashContinuation(rawChallenge),
    email,
    consumedAt: null,
    supersededAt: null,
    expiresAt: { $gt: new Date() },
  });
  if (!pending || !pending.otpChallengeId)
    throw createApiError("That verification session is invalid or has expired.", 401, "INVALID_OTP");
  const challenge = await OtpChallenge.findOne({
    _id: pending.otpChallengeId,
    email,
    purpose: "email_verification",
    pendingLoginId: pending._id,
    deliveryStatus: "sent",
    consumedAt: null,
    supersededAt: null,
  });
  if (!challenge || challenge.expiresAt.getTime() <= Date.now() || challenge.attempts >= env.OTP_MAX_ATTEMPTS)
    throw createApiError("That code is invalid or has expired.", 401, "INVALID_OTP");
  const expected = digest(String(challenge._id), email, "email_verification", value);
  if (!crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(challenge.digest, "hex"))) {
    await OtpChallenge.updateOne({ _id: challenge._id, consumedAt: null }, { $inc: { attempts: 1 } });
    throw createApiError("That code is invalid or has expired.", 401, "INVALID_OTP");
  }
  const consumed = await OtpChallenge.findOneAndUpdate(
    { _id: challenge._id, consumedAt: null, supersededAt: null },
    { consumedAt: new Date() },
  );
  const pendingConsumed = await PendingLogin.findOneAndUpdate(
    { _id: pending._id, consumedAt: null, supersededAt: null },
    { consumedAt: new Date() },
  );
  if (!consumed || !pendingConsumed)
    throw createApiError("That verification session is no longer available.", 401, "INVALID_OTP");
  await User.findOneAndUpdate({ _id: pending.userId, email }, { emailVerifiedAt: new Date() });
  return String(pending.userId);
};

export const verifyEmailOtp = async (emailInput: string, value: string) => {
  const email = normalizeEmail(emailInput);
  const challenge = await OtpChallenge.findOne({
    email,
    purpose: "email_verification",
    deliveryStatus: "sent",
    consumedAt: null,
    supersededAt: null,
  });
  if (
    !challenge ||
    challenge.expiresAt.getTime() <= Date.now() ||
    challenge.attempts >= env.OTP_MAX_ATTEMPTS
  )
    throw createApiError("That code is invalid or has expired.", 401, "INVALID_OTP");
  const expected = digest(String(challenge._id), email, "email_verification", value);
  if (!crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(challenge.digest, "hex"))) {
    await OtpChallenge.updateOne(
      { _id: challenge._id, consumedAt: null },
      { $inc: { attempts: 1 } },
    );
    throw createApiError("That code is invalid or has expired.", 401, "INVALID_OTP");
  }
  const consumed = await OtpChallenge.findOneAndUpdate(
    { _id: challenge._id, consumedAt: null, supersededAt: null },
    { consumedAt: new Date() },
  );
  if (!consumed) throw createApiError("That code is invalid or has expired.", 401, "INVALID_OTP");
  await User.findOneAndUpdate({ _id: challenge.userId, email }, { emailVerifiedAt: new Date() });
};

export const verifyResetOtp = async (emailInput: string, value: string) => {
  const email = normalizeEmail(emailInput);
  const challenge = await OtpChallenge.findOne({
    email,
    purpose: "password_reset",
    deliveryStatus: "sent",
    consumedAt: null,
    supersededAt: null,
  });
  if (
    !challenge ||
    challenge.expiresAt.getTime() <= Date.now() ||
    challenge.attempts >= env.OTP_MAX_ATTEMPTS
  )
    throw createApiError("That code is invalid or has expired.", 401, "INVALID_OTP");
  const expected = digest(String(challenge._id), email, "password_reset", value);
  if (!crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(challenge.digest, "hex"))) {
    await OtpChallenge.updateOne(
      { _id: challenge._id, consumedAt: null },
      { $inc: { attempts: 1 } },
    );
    throw createApiError("That code is invalid or has expired.", 401, "INVALID_OTP");
  }
  const consumed = await OtpChallenge.findOneAndUpdate(
    { _id: challenge._id, consumedAt: null, supersededAt: null },
    { consumedAt: new Date() },
  );
  if (!consumed || !challenge.userId)
    throw createApiError("That code is invalid or has expired.", 401, "INVALID_OTP");
  const grant = crypto.randomBytes(32).toString("hex");
  await PasswordResetGrant.create({
    userId: challenge.userId,
    digest: hashGrant(grant),
    expiresAt: new Date(Date.now() + env.PASSWORD_RESET_GRANT_TTL_SECONDS * 1000),
  });
  return grant;
};

export const consumeResetGrant = async (grant: string, passwordHash: string) => {
  const record = await PasswordResetGrant.findOneAndUpdate(
    { digest: hashGrant(grant), consumedAt: null, expiresAt: { $gt: new Date() } },
    { consumedAt: new Date() },
    { new: true },
  );
  if (!record)
    throw createApiError(
      "Your password reset session has expired. Please start again.",
      401,
      "INVALID_RESET_GRANT",
    );
  await User.findByIdAndUpdate(record.userId, { passwordHash, emailVerifiedAt: new Date() });
  return String(record.userId);
};
