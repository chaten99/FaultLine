import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
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

notificationRouter.use(authenticate);
notificationRouter.get("/preferences", getPreferences);
notificationRouter.patch("/preferences", mutationLimit, patchPreferences);
notificationRouter.get("/integrations", listAllIntegrations);
notificationRouter.post("/integrations/slack", mutationLimit, createSlack);
notificationRouter.post("/integrations/webhooks", mutationLimit, createWebhook);
notificationRouter.patch("/integrations/:id", mutationLimit, patchIntegration);
notificationRouter.delete("/integrations/:id", mutationLimit, removeIntegration);
notificationRouter.post("/integrations/:id/rotate-secret", mutationLimit, rotateSecret);
notificationRouter.post("/integrations/:id/test", testLimit, sendIntegrationTest);
notificationRouter.post("/email/test", testLimit, sendEmailTest);
notificationRouter.get("/deliveries", listAllDeliveries);
notificationRouter.get("/deliveries/:id", getOneDelivery);
notificationRouter.post("/deliveries/:id/retry", retryLimit, retryOneDelivery);
