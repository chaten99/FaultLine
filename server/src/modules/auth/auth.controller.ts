import type { Request, Response } from "express";
import { env } from "../../config/env.js";
import { loginSchema, registerSchema } from "./auth.validation.js";
import {
  getUser,
  loginUser,
  refreshUser,
  registerUser,
  revokeRefreshToken,
} from "./auth.service.js";
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

export const register = async (request: Request, response: Response) =>
  sendAuth(response, await registerUser(registerSchema.parse(request.body)), 201);
export const login = async (request: Request, response: Response) =>
  sendAuth(response, await loginUser(loginSchema.parse(request.body)));
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
