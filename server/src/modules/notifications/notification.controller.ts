import type { Request, Response } from "express";
import { createApiError } from "../../lib/errors/create-api-error.js";
import type { AuthenticatedRequest } from "../auth/auth.types.js";
import {
  createSlackIntegration,
  createWebhookIntegration,
  deleteIntegration,
  listIntegrations,
  rotateSigningSecret,
  testEmail,
  testIntegration,
  updateIntegration,
} from "./notification-integration.service.js";
import { getDelivery, listDeliveries, retryDelivery } from "./notification-history.service.js";
import { getPreferencesView, updatePreferences } from "./notification-preferences.service.js";
import {
  createSlackIntegrationSchema,
  createWebhookIntegrationSchema,
  idParamSchema,
  listDeliveriesSchema,
  updateIntegrationSchema,
  updatePreferencesSchema,
} from "./notification.validation.js";

const userId = (request: Request) => {
  const id = (request as AuthenticatedRequest).userId;
  if (!id) throw createApiError("Authentication required.", 401, "AUTHENTICATION_REQUIRED");
  return id;
};

export const getPreferences = async (request: Request, response: Response) =>
  response.json(await getPreferencesView(userId(request)));

export const patchPreferences = async (request: Request, response: Response) =>
  response.json(
    await updatePreferences(userId(request), updatePreferencesSchema.parse(request.body)),
  );

export const listAllIntegrations = async (request: Request, response: Response) =>
  response.json(await listIntegrations(userId(request)));

export const createSlack = async (request: Request, response: Response) =>
  response
    .status(201)
    .json(
      await createSlackIntegration(
        userId(request),
        createSlackIntegrationSchema.parse(request.body),
      ),
    );

export const createWebhook = async (request: Request, response: Response) =>
  response
    .status(201)
    .json(
      await createWebhookIntegration(
        userId(request),
        createWebhookIntegrationSchema.parse(request.body),
      ),
    );

export const patchIntegration = async (request: Request, response: Response) => {
  const { id } = idParamSchema.parse(request.params);
  return response.json(
    await updateIntegration(userId(request), id, updateIntegrationSchema.parse(request.body)),
  );
};

export const rotateSecret = async (request: Request, response: Response) => {
  const { id } = idParamSchema.parse(request.params);
  return response.json(await rotateSigningSecret(userId(request), id));
};

export const removeIntegration = async (request: Request, response: Response) => {
  const { id } = idParamSchema.parse(request.params);
  return response.json(await deleteIntegration(userId(request), id));
};

export const sendIntegrationTest = async (request: Request, response: Response) => {
  const { id } = idParamSchema.parse(request.params);
  return response.json(await testIntegration(userId(request), id));
};

export const sendEmailTest = async (request: Request, response: Response) =>
  response.json(await testEmail(userId(request)));

export const listAllDeliveries = async (request: Request, response: Response) =>
  response.json(await listDeliveries(userId(request), listDeliveriesSchema.parse(request.query)));

export const getOneDelivery = async (request: Request, response: Response) => {
  const { id } = idParamSchema.parse(request.params);
  return response.json(await getDelivery(userId(request), id));
};

export const retryOneDelivery = async (request: Request, response: Response) => {
  const { id } = idParamSchema.parse(request.params);
  return response.json(await retryDelivery(userId(request), id));
};
