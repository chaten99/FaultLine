import type { NextFunction, Request, Response } from "express";
import { verifyAccessToken } from "../modules/auth/auth-token.service.js";
import type { AuthenticatedRequest } from "../modules/auth/auth.types.js";

export const authenticate = (request: Request, response: Response, next: NextFunction): void => {
  const header = request.header("authorization");
  if (!header?.startsWith("Bearer ")) {
    response.status(401).json({
      status: "error",
      code: "AUTHENTICATION_REQUIRED",
      message: "Your session has expired. Please sign in again.",
    });
    return;
  }
  try {
    (request as AuthenticatedRequest).userId = verifyAccessToken(header.slice(7));
    next();
  } catch {
    response.status(401).json({
      status: "error",
      code: "AUTHENTICATION_REQUIRED",
      message: "Your session has expired. Please sign in again.",
    });
  }
};
