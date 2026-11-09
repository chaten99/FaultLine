import type { Request, Response } from "express";
import { createApiError } from "../../lib/errors/create-api-error.js";
import type { AuthenticatedRequest } from "../auth/auth.types.js";
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

const owner = (request: Request) => {
  const id = (request as AuthenticatedRequest).userId;
  if (!id) throw createApiError("Authentication required.", 401, "AUTHENTICATION_REQUIRED");
  return id;
};

const noStore = (response: Response) => response.setHeader("Cache-Control", "private, no-store");

export const list = async (request: Request, response: Response) => {
  noStore(response);
  return response.json(await listStatusPages(owner(request)));
};

export const slugAvailable = async (request: Request, response: Response) => {
  const query = slugAvailabilitySchema.parse(request.query);
  return response.json(await checkSlugAvailability(query.slug, query.excludeId));
};

export const monitorOptions = async (request: Request, response: Response) => {
  const query = monitorOptionsSchema.parse(request.query);
  return response.json(await getMonitorOptions(owner(request), query.search));
};

export const create = async (request: Request, response: Response) =>
  response
    .status(201)
    .json(await createStatusPage(owner(request), createStatusPageSchema.parse(request.body)));

export const get = async (request: Request, response: Response) => {
  noStore(response);
  const { id } = idParamSchema.parse(request.params);
  return response.json(await getStatusPage(owner(request), id));
};

export const update = async (request: Request, response: Response) => {
  const { id } = idParamSchema.parse(request.params);
  return response.json(
    await updateStatusPage(owner(request), id, updateStatusPageSchema.parse(request.body)),
  );
};

export const remove = async (request: Request, response: Response) => {
  const { id } = idParamSchema.parse(request.params);
  return response.json(await deleteStatusPage(owner(request), id));
};

export const publish = async (request: Request, response: Response) => {
  const { id } = idParamSchema.parse(request.params);
  return response.json(await publishStatusPage(owner(request), id));
};

export const unpublish = async (request: Request, response: Response) => {
  const { id } = idParamSchema.parse(request.params);
  return response.json(await unpublishStatusPage(owner(request), id));
};

export const services = async (request: Request, response: Response) => {
  noStore(response);
  const { id } = idParamSchema.parse(request.params);
  return response.json(await listServices(owner(request), id));
};

export const addService = async (request: Request, response: Response) => {
  const { id } = idParamSchema.parse(request.params);
  return response
    .status(201)
    .json(await createService(owner(request), id, createServiceSchema.parse(request.body)));
};

export const editService = async (request: Request, response: Response) => {
  const { id, serviceId } = serviceParamSchema.parse(request.params);
  return response.json(
    await updateService(owner(request), id, serviceId, updateServiceSchema.parse(request.body)),
  );
};

export const removeService = async (request: Request, response: Response) => {
  const { id, serviceId } = serviceParamSchema.parse(request.params);
  return response.json(await deleteService(owner(request), id, serviceId));
};

export const reorder = async (request: Request, response: Response) => {
  const { id } = idParamSchema.parse(request.params);
  const body = reorderServicesSchema.parse(request.body);
  return response.json(await reorderServices(owner(request), id, body.serviceIds));
};

export const preview = async (request: Request, response: Response) => {
  noStore(response);
  const { id } = idParamSchema.parse(request.params);
  return response.json(await previewStatusPage(owner(request), id));
};

export const subscribers = async (request: Request, response: Response) => {
  noStore(response);
  const { id } = idParamSchema.parse(request.params);
  return response.json(
    await listSubscribers(owner(request), id, subscribersQuerySchema.parse(request.query)),
  );
};

export const analytics = async (request: Request, response: Response) => {
  noStore(response);
  const { id } = idParamSchema.parse(request.params);
  return response.json(await getStatusPageAnalytics(owner(request), id));
};
