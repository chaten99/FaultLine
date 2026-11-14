import type { Request, Response } from "express";
import { workspaceOf } from "../workspaces/workspace-context.js";
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

const ctx = (request: Request) => workspaceOf(request);

export const getPreferences = async (request: Request, response: Response) =>
  response.json(await getPreferencesView(ctx(request)));

export const patchPreferences = async (request: Request, response: Response) =>
  response.json(await updatePreferences(ctx(request), updatePreferencesSchema.parse(request.body)));

export const listAllIntegrations = async (request: Request, response: Response) =>
  response.json(await listIntegrations(ctx(request)));

export const createSlack = async (request: Request, response: Response) =>
  response
    .status(201)
    .json(
      await createSlackIntegration(ctx(request), createSlackIntegrationSchema.parse(request.body)),
    );

export const createWebhook = async (request: Request, response: Response) =>
  response
    .status(201)
    .json(
      await createWebhookIntegration(
        ctx(request),
        createWebhookIntegrationSchema.parse(request.body),
      ),
    );

export const patchIntegration = async (request: Request, response: Response) => {
  const { id } = idParamSchema.parse(request.params);
  return response.json(
    await updateIntegration(ctx(request), id, updateIntegrationSchema.parse(request.body)),
  );
};

export const rotateSecret = async (request: Request, response: Response) => {
  const { id } = idParamSchema.parse(request.params);
  return response.json(await rotateSigningSecret(ctx(request), id));
};

export const removeIntegration = async (request: Request, response: Response) => {
  const { id } = idParamSchema.parse(request.params);
  return response.json(await deleteIntegration(ctx(request), id));
};

export const sendIntegrationTest = async (request: Request, response: Response) => {
  const { id } = idParamSchema.parse(request.params);
  return response.json(await testIntegration(ctx(request), id));
};

export const sendEmailTest = async (request: Request, response: Response) =>
  response.json(await testEmail(ctx(request)));

export const listAllDeliveries = async (request: Request, response: Response) =>
  response.json(
    await listDeliveries(ctx(request).workspaceId, listDeliveriesSchema.parse(request.query)),
  );

export const getOneDelivery = async (request: Request, response: Response) => {
  const { id } = idParamSchema.parse(request.params);
  return response.json(await getDelivery(ctx(request).workspaceId, id));
};

export const retryOneDelivery = async (request: Request, response: Response) => {
  const { id } = idParamSchema.parse(request.params);
  return response.json(await retryDelivery(ctx(request).workspaceId, id));
};
