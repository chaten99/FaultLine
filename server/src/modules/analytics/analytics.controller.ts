import type { Request, Response } from "express";
import { createApiError } from "../../lib/errors/create-api-error.js";
import type { AuthenticatedRequest } from "../auth/auth.types.js";
import {
  buildExport,
  getAvailability,
  getIncidentAnalytics,
  getMonitorAnalytics,
  getMonitorTable,
  getOverview,
  getResponseTimes,
} from "./analytics.service.js";
import {
  exportQuerySchema,
  monitorParamSchema,
  monitorTableQuerySchema,
  rangeQuerySchema,
} from "./analytics.validation.js";

const userId = (request: Request) => {
  const id = (request as AuthenticatedRequest).userId;
  if (!id) throw createApiError("Authentication required.", 401, "AUTHENTICATION_REQUIRED");
  return id;
};

export const overview = async (request: Request, response: Response) =>
  response.json(await getOverview(userId(request), rangeQuerySchema.parse(request.query)));

export const responseTimes = async (request: Request, response: Response) =>
  response.json(await getResponseTimes(userId(request), rangeQuerySchema.parse(request.query)));

export const availability = async (request: Request, response: Response) =>
  response.json(await getAvailability(userId(request), rangeQuerySchema.parse(request.query)));

export const monitorTable = async (request: Request, response: Response) =>
  response.json(
    await getMonitorTable(userId(request), monitorTableQuerySchema.parse(request.query)),
  );

export const incidents = async (request: Request, response: Response) =>
  response.json(await getIncidentAnalytics(userId(request), rangeQuerySchema.parse(request.query)));

export const monitorDetail = async (request: Request, response: Response) => {
  const { monitorId } = monitorParamSchema.parse(request.params);
  return response.json(
    await getMonitorAnalytics(userId(request), monitorId, rangeQuerySchema.parse(request.query)),
  );
};

export const exportReport = async (request: Request, response: Response) => {
  const { type, ...range } = exportQuerySchema.parse(request.query);
  const report = await buildExport(userId(request), type, range);
  response.setHeader("Content-Type", "text/csv; charset=utf-8");
  response.setHeader("Content-Disposition", `attachment; filename="${report.filename}"`);
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  return response.send(report.csv);
};
