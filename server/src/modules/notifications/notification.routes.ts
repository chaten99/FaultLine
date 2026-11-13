import { Router } from "express";
import { withWorkspace } from "../workspaces/workspace-context.js";
import { rateLimit } from "../../lib/rate-limit.js";
import {
  createSlack,
  createWebhook,
  getOneDelivery,
  getPreferences,
  listAllDeliveries,
  listAllIntegrations,
  patchIntegration,
  patchPreferences,
  removeIntegration,
  retryOneDelivery,
  rotateSecret,
  sendEmailTest,
  sendIntegrationTest,
} from "./notification.controller.js";

export const notificationRouter = Router();
const mutationLimit = rateLimit("notifications:mutate", 60, 60);
const testLimit = rateLimit("notifications:test", 10, 60);
const retryLimit = rateLimit("notifications:retry", 20, 60);

notificationRouter.get(
  "/preferences",
  ...withWorkspace("notifications:preferences"),
  getPreferences,
);
notificationRouter.patch(
  "/preferences",
  ...withWorkspace("notifications:preferences"),
  mutationLimit,
  patchPreferences,
);
notificationRouter.get(
  "/integrations",
  ...withWorkspace("notifications:manage"),
  listAllIntegrations,
);
notificationRouter.post(
  "/integrations/slack",
  ...withWorkspace("notifications:manage"),
  mutationLimit,
  createSlack,
);
notificationRouter.post(
  "/integrations/webhooks",
  ...withWorkspace("notifications:manage"),
  mutationLimit,
  createWebhook,
);
notificationRouter.patch(
  "/integrations/:id",
  ...withWorkspace("notifications:manage"),
  mutationLimit,
  patchIntegration,
);
notificationRouter.delete(
  "/integrations/:id",
  ...withWorkspace("notifications:manage"),
  mutationLimit,
  removeIntegration,
);
notificationRouter.post(
  "/integrations/:id/rotate-secret",
  ...withWorkspace("notifications:manage"),
  mutationLimit,
  rotateSecret,
);
notificationRouter.post(
  "/integrations/:id/test",
  ...withWorkspace("notifications:manage"),
  testLimit,
  sendIntegrationTest,
);
notificationRouter.post(
  "/email/test",
  ...withWorkspace("notifications:preferences"),
  testLimit,
  sendEmailTest,
);
notificationRouter.get("/deliveries", ...withWorkspace("notifications:manage"), listAllDeliveries);
notificationRouter.get("/deliveries/:id", ...withWorkspace("notifications:manage"), getOneDelivery);
notificationRouter.post(
  "/deliveries/:id/retry",
  ...withWorkspace("notifications:manage"),
  retryLimit,
  retryOneDelivery,
);
