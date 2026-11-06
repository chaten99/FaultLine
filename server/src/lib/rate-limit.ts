import type { NextFunction, Request, Response } from "express";
import { logger } from "../config/logger.js";
import type { AuthenticatedRequest } from "../modules/auth/auth.types.js";
import { createApiError } from "./errors/create-api-error.js";
import { getRedisClient } from "./redis/redis.service.js";

export const consumeRateLimit = async (
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> => {
  try {
    const client = getRedisClient();
    if (client.status === "wait") await client.connect();
    const count = await client.incr(key);
    if (count === 1) await client.expire(key, windowSeconds);
    return count <= limit;
  } catch (error) {
    logger.warn({ err: error }, "Rate limit store unavailable; allowing request");
    return true;
  }
};

export const rateLimit =
  (name: string, limit: number, windowSeconds: number) =>
  async (request: Request, _response: Response, next: NextFunction): Promise<void> => {
    const userId = (request as AuthenticatedRequest).userId ?? request.ip ?? "anonymous";
    const allowed = await consumeRateLimit(`ratelimit:${name}:${userId}`, limit, windowSeconds);
    if (!allowed) {
      next(createApiError("Too many requests. Please try again shortly.", 429, "RATE_LIMITED"));
      return;
    }
    next();
  };
