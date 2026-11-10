import type { Request, Response } from "express";
import { createApiError } from "../../lib/errors/create-api-error.js";
import {
  findPageBySlug,
  findPublishedPage,
  getPublicHistory,
  getPublicIncidents,
  getPublicStatusPage,
} from "./status-page-public.service.js";
import {
  getUnsubscribeInfo,
  requestSubscription,
  resendConfirmation,
  unsubscribe,
  verifySubscription,
} from "./status-page-subscriber.service.js";
import {
  publicHistoryQuerySchema,
  publicIncidentsQuerySchema,
  resendSchema,
  slugPattern,
  subscribeSchema,
  tokenBodySchema,
  tokenQuerySchema,
} from "./status-page.validation.js";

const slugOf = (request: Request): string => {
  const slug = String(request.params.slug ?? "").toLowerCase();
  if (slug.length < 3 || slug.length > 48 || !slugPattern.test(slug)) {
    throw createApiError("Status page not found.", 404, "STATUS_PAGE_NOT_FOUND");
  }
  return slug;
};

const revalidate = (response: Response) => response.setHeader("Cache-Control", "no-cache");
const noStore = (response: Response) => response.setHeader("Cache-Control", "no-store");

export const status = async (request: Request, response: Response) => {
  revalidate(response);
  return response.json(await getPublicStatusPage(slugOf(request)));
};

export const incidents = async (request: Request, response: Response) => {
  revalidate(response);
  return response.json(
    await getPublicIncidents(slugOf(request), publicIncidentsQuerySchema.parse(request.query)),
  );
};

export const history = async (request: Request, response: Response) => {
  revalidate(response);
  const query = publicHistoryQuerySchema.parse(request.query);
  return response.json(await getPublicHistory(slugOf(request), query.range));
};

export const subscribe = async (request: Request, response: Response) => {
  noStore(response);
  const page = await findPublishedPage(slugOf(request));
  const body = subscribeSchema.parse(request.body);
  return response.status(202).json(await requestSubscription(page, body));
};

export const resend = async (request: Request, response: Response) => {
  noStore(response);
  const page = await findPublishedPage(slugOf(request));
  const body = resendSchema.parse(request.body);
  return response.status(202).json(await resendConfirmation(page, body.email));
};

export const verify = async (request: Request, response: Response) => {
  noStore(response);
  const page = await findPublishedPage(slugOf(request));
  const body = tokenBodySchema.parse(request.body);
  return response.json(await verifySubscription(page, body.token));
};

export const unsubscribeInfo = async (request: Request, response: Response) => {
  noStore(response);
  const query = tokenQuerySchema.parse(request.query);
  return response.json(
    await getUnsubscribeInfo(await findPageBySlug(slugOf(request)), query.token),
  );
};

export const unsubscribeAction = async (request: Request, response: Response) => {
  noStore(response);
  const body = tokenBodySchema.parse(request.body);
  return response.json(await unsubscribe(await findPageBySlug(slugOf(request)), body.token));
};
