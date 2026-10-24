import type { Request, Response } from "express";
import { env } from "../../config/env.js";
import {
  emailOtpSchema,
  emailSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
} from "./auth.validation.js";
import {
  getUser,
  createSessionForUser,
  loginUser,
  refreshUser,
  registerUser,
  revokeRefreshToken,
  revokeAllRefreshTokens,
} from "./auth.service.js";
import { consumeResetGrant, issueOtp, resendLoginVerification, verifyEmailOtp, verifyLoginOtp, verifyResetOtp } from "./otp.service.js";
import type { AuthenticatedRequest } from "./auth.types.js";

const cookieOptions = () => ({
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/api/auth",
});
const sendAuth = (
  response: Response,
  result: { accessToken: string; expiresIn: number; user: unknown; refreshToken: string },
  status = 200,
) => {
  response.cookie("faultline_refresh", result.refreshToken, {
    ...cookieOptions(),
    maxAge: env.JWT_REFRESH_ABSOLUTE_TTL_DAYS * 86_400_000,
  });
  response
    .status(status)
    .json({ accessToken: result.accessToken, expiresIn: result.expiresIn, user: result.user });
};

export const register = async (request: Request, response: Response) => {
  const input = registerSchema.parse(request.body);
  const result = await registerUser(input);
  await issueOtp({
    email: result.email,
    userId: result.userId,
    purpose: "email_verification",
    ipAddress: request.ip ?? "unknown",
    name: input.name,
  });
  return response.status(201).json({ status: "verification_required", email: result.email });
};
export const verifyEmail = async (request: Request, response: Response) => {
  const input = emailOtpSchema.parse(request.body);
  if (input.challengeId) {
    const userId = await verifyLoginOtp(input.email, input.code, input.challengeId);
    const user = await import("./user.model.js").then(({ User }) => User.findById(userId));
    if (!user) return response.status(401).json({ status: "error", code: "AUTHENTICATION_REQUIRED", message: "Authentication required" });
    return sendAuth(response, await createSessionForUser(user));
  }
  await verifyEmailOtp(input.email, input.code);
  return response.json({ status: "verified" });
};
export const resendVerification = async (request: Request, response: Response) => {
  const input = emailSchema.parse(request.body);
  if (input.challengeId) {
    await resendLoginVerification(input.challengeId, input.email, request.ip ?? "unknown");
    return response.json({ status: "sent" });
  }
  const user = await import("./user.model.js").then(({ User }) =>
    User.findOne({ email: input.email.toLowerCase() }),
  );
  if (user && !user.emailVerifiedAt)
    await issueOtp({
      email: user.email,
      userId: String(user._id),
      purpose: "email_verification",
      ipAddress: request.ip ?? "unknown",
      name: user.name,
    });
  return response.json({ status: "sent" });
};
export const forgotPassword = async (request: Request, response: Response) => {
  const input = emailSchema.parse(request.body);
  const user = await import("./user.model.js").then(({ User }) =>
    User.findOne({ email: input.email.toLowerCase() }),
  );
  if (user)
    await issueOtp({
      email: user.email,
      userId: String(user._id),
      purpose: "password_reset",
      ipAddress: request.ip ?? "unknown",
      name: user.name,
    });
  return response.json({ status: "sent" });
};
export const verifyReset = async (request: Request, response: Response) => {
  const input = emailOtpSchema.parse(request.body);
  return response.json({ grant: await verifyResetOtp(input.email, input.code) });
};
export const resetPassword = async (request: Request, response: Response) => {
  const input = resetPasswordSchema.parse(request.body);
  const passwordHash = await import("argon2").then(({ default: argon2 }) =>
    argon2.hash(input.password, { type: argon2.argon2id }),
  );
  const userId = await consumeResetGrant(input.grant, passwordHash);
  await revokeAllRefreshTokens(userId);
  return response.json({ status: "reset" });
};
export const login = async (request: Request, response: Response) =>
  sendAuth(response, await loginUser({ ...loginSchema.parse(request.body), ipAddress: request.ip ?? "unknown" }));
export const refresh = async (request: Request, response: Response) => {
  const token = request.cookies.faultline_refresh as string | undefined;
  if (!token)
    return response.status(401).json({
      status: "error",
      code: "AUTHENTICATION_REQUIRED",
      message: "Your session has expired. Please sign in again.",
    });
  return sendAuth(response, await refreshUser(token));
};
export const me = async (request: Request, response: Response) => {
  const user = await getUser((request as AuthenticatedRequest).userId as string);
  if (!user)
    return response.status(401).json({ status: "error", message: "Authentication required" });
  return response.json({ user });
};
export const logout = async (request: Request, response: Response) => {
  await revokeRefreshToken(request.cookies.faultline_refresh as string | undefined);
  response.clearCookie("faultline_refresh", cookieOptions());
  return response.status(204).send();
};
