import type { Request, Response } from "express";
import { workspaceOf } from "../workspaces/workspace-context.js";
import {
  createMonitorSchema,
  checkIdSchema,
  listChecksSchema,
  listMonitorSchema,
  monitorIdSchema,
  updateMonitorSchema,
} from "./monitor.validation.js";
import {
  createMonitor,
  deleteMonitor,
  getMonitor,
  getMonitorCheck,
  listMonitorChecks,
  listMonitors,
  triggerManualCheck,
  updateMonitor,
} from "./monitor.service.js";

const userId = workspaceOf;

export const list = async (request: Request, response: Response) => {
  const query = listMonitorSchema.parse(request.query);
  return response.json(
    await listMonitors(
      userId(request),
      query.page,
      query.pageSize,
      query.search,
      query.status,
      query.sortBy,
      query.sortOrder,
    ),
  );
};

export const create = async (request: Request, response: Response) =>
  response
    .status(201)
    .json(await createMonitor(userId(request), createMonitorSchema.parse(request.body)));

export const get = async (request: Request, response: Response) => {
  const { id } = monitorIdSchema.parse(request.params);
  return response.json(await getMonitor(userId(request), id));
};

export const update = async (request: Request, response: Response) => {
  const { id } = monitorIdSchema.parse(request.params);
  return response.json(
    await updateMonitor(userId(request), id, updateMonitorSchema.parse(request.body)),
  );
};

export const remove = async (request: Request, response: Response) => {
  const { id } = monitorIdSchema.parse(request.params);
  await deleteMonitor(userId(request), id);
  return response.status(204).send();
};

export const checkNow = async (request: Request, response: Response) => {
  const { id } = monitorIdSchema.parse(request.params);
  const result = await triggerManualCheck(userId(request), id);
  return response.status(202).json(result);
};

export const listChecks = async (request: Request, response: Response) => {
  const { id } = monitorIdSchema.parse(request.params);
  const query = listChecksSchema.parse(request.query);
  return response.json(
    await listMonitorChecks(userId(request), id, query.page, query.pageSize, query.status),
  );
};

export const getCheck = async (request: Request, response: Response) => {
  const { id } = monitorIdSchema.parse(request.params);
  const { checkId } = checkIdSchema.parse(request.params);
  const check = await getMonitorCheck(userId(request), id, checkId);
  return response.json(check);
};
