import type { Request, Response } from "express";
import { workspaceOf } from "../workspaces/workspace-context.js";
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

export const overview = async (request: Request, response: Response) =>
  response.json(await getOverview(workspaceOf(request), rangeQuerySchema.parse(request.query)));

export const responseTimes = async (request: Request, response: Response) =>
  response.json(
    await getResponseTimes(workspaceOf(request), rangeQuerySchema.parse(request.query)),
  );

export const availability = async (request: Request, response: Response) =>
  response.json(await getAvailability(workspaceOf(request), rangeQuerySchema.parse(request.query)));

export const monitorTable = async (request: Request, response: Response) =>
  response.json(
    await getMonitorTable(workspaceOf(request), monitorTableQuerySchema.parse(request.query)),
  );

export const incidents = async (request: Request, response: Response) =>
  response.json(
    await getIncidentAnalytics(workspaceOf(request), rangeQuerySchema.parse(request.query)),
  );

export const monitorDetail = async (request: Request, response: Response) => {
  const { monitorId } = monitorParamSchema.parse(request.params);
  return response.json(
    await getMonitorAnalytics(
      workspaceOf(request),
      monitorId,
      rangeQuerySchema.parse(request.query),
    ),
  );
};

export const exportReport = async (request: Request, response: Response) => {
  const { type, ...range } = exportQuerySchema.parse(request.query);
  const report = await buildExport(workspaceOf(request), type, range);
  response.setHeader("Content-Type", "text/csv; charset=utf-8");
  response.setHeader("Content-Disposition", `attachment; filename="${report.filename}"`);
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  return response.send(report.csv);
};
