import type { Request, Response } from "express";
import { workspaceOf } from "../workspaces/workspace-context.js";
import {
  checkSlugAvailability,
  createService,
  createStatusPage,
  deleteService,
  deleteStatusPage,
  getMonitorOptions,
  getStatusPage,
  getStatusPageAnalytics,
  listServices,
  listStatusPages,
  listSubscribers,
  previewStatusPage,
  publishStatusPage,
  reorderServices,
  unpublishStatusPage,
  updateService,
  updateStatusPage,
} from "./status-page.service.js";
import {
  createServiceSchema,
  createStatusPageSchema,
  idParamSchema,
  monitorOptionsSchema,
  reorderServicesSchema,
  serviceParamSchema,
  slugAvailabilitySchema,
  subscribersQuerySchema,
  updateServiceSchema,
  updateStatusPageSchema,
} from "./status-page.validation.js";

const noStore = (response: Response) => response.setHeader("Cache-Control", "private, no-store");

export const list = async (request: Request, response: Response) => {
  noStore(response);
  return response.json(await listStatusPages(workspaceOf(request)));
};

export const slugAvailable = async (request: Request, response: Response) => {
  const query = slugAvailabilitySchema.parse(request.query);
  return response.json(await checkSlugAvailability(query.slug, query.excludeId));
};

export const monitorOptions = async (request: Request, response: Response) => {
  const query = monitorOptionsSchema.parse(request.query);
  return response.json(await getMonitorOptions(workspaceOf(request), query.search));
};

export const create = async (request: Request, response: Response) =>
  response
    .status(201)
    .json(await createStatusPage(workspaceOf(request), createStatusPageSchema.parse(request.body)));

export const get = async (request: Request, response: Response) => {
  noStore(response);
  const { id } = idParamSchema.parse(request.params);
  return response.json(await getStatusPage(workspaceOf(request), id));
};

export const update = async (request: Request, response: Response) => {
  const { id } = idParamSchema.parse(request.params);
  return response.json(
    await updateStatusPage(workspaceOf(request), id, updateStatusPageSchema.parse(request.body)),
  );
};

export const remove = async (request: Request, response: Response) => {
  const { id } = idParamSchema.parse(request.params);
  return response.json(await deleteStatusPage(workspaceOf(request), id));
};

export const publish = async (request: Request, response: Response) => {
  const { id } = idParamSchema.parse(request.params);
  return response.json(await publishStatusPage(workspaceOf(request), id));
};

export const unpublish = async (request: Request, response: Response) => {
  const { id } = idParamSchema.parse(request.params);
  return response.json(await unpublishStatusPage(workspaceOf(request), id));
};

export const services = async (request: Request, response: Response) => {
  noStore(response);
  const { id } = idParamSchema.parse(request.params);
  return response.json(await listServices(workspaceOf(request), id));
};

export const addService = async (request: Request, response: Response) => {
  const { id } = idParamSchema.parse(request.params);
  return response
    .status(201)
    .json(await createService(workspaceOf(request), id, createServiceSchema.parse(request.body)));
};

export const editService = async (request: Request, response: Response) => {
  const { id, serviceId } = serviceParamSchema.parse(request.params);
  return response.json(
    await updateService(
      workspaceOf(request),
      id,
      serviceId,
      updateServiceSchema.parse(request.body),
    ),
  );
};

export const removeService = async (request: Request, response: Response) => {
  const { id, serviceId } = serviceParamSchema.parse(request.params);
  return response.json(await deleteService(workspaceOf(request), id, serviceId));
};

export const reorder = async (request: Request, response: Response) => {
  const { id } = idParamSchema.parse(request.params);
  const body = reorderServicesSchema.parse(request.body);
  return response.json(await reorderServices(workspaceOf(request), id, body.serviceIds));
};

export const preview = async (request: Request, response: Response) => {
  noStore(response);
  const { id } = idParamSchema.parse(request.params);
  return response.json(await previewStatusPage(workspaceOf(request), id));
};

export const subscribers = async (request: Request, response: Response) => {
  noStore(response);
  const { id } = idParamSchema.parse(request.params);
  return response.json(
    await listSubscribers(workspaceOf(request), id, subscribersQuerySchema.parse(request.query)),
  );
};

export const analytics = async (request: Request, response: Response) => {
  noStore(response);
  const { id } = idParamSchema.parse(request.params);
  return response.json(await getStatusPageAnalytics(workspaceOf(request), id));
};
