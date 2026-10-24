import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { logger } from "../config/logger.js";
import type { ApiError } from "../lib/errors/create-api-error.js";

export const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  void _next;
  logger.error({ err: error }, "Unhandled request error");
  if (error instanceof ZodError) {
    const fieldErrors = Object.fromEntries(
      error.issues.map((issue) => [issue.path.join(".") || "request", issue.message]),
    );
    response.status(400).json({
      status: "error",
      code: "INVALID_REQUEST",
      message: "Please check the highlighted fields.",
      fieldErrors,
    });
    return;
  }
  if (isApiError(error)) {
    response.status(error.statusCode).json({
      status: "error",
      code: error.code,
      message: error.message,
      ...(error.fieldErrors ? { fieldErrors: error.fieldErrors } : {}),
    });
    return;
  }
  response.status(500).json({
    status: "error",
    code: "INTERNAL_ERROR",
    message: "Something went wrong. Please try again.",
  });
};

const isApiError = (error: unknown): error is ApiError =>
  error instanceof Error &&
  "statusCode" in error &&
  typeof error.statusCode === "number" &&
  "code" in error &&
  typeof error.code === "string";
