import { Router } from "express";
import { rateLimit } from "../../lib/rate-limit.js";
import {
  history,
  incidents,
  resend,
  status,
  subscribe,
  unsubscribeAction,
  unsubscribeInfo,
  verify,
} from "./status-page-public.controller.js";

export const publicStatusRouter = Router();
const readLimit = rateLimit("public-status:read", 120, 60);
const subscribeLimit = rateLimit("public-status:subscribe", 10, 3600);
const resendLimit = rateLimit("public-status:resend", 10, 3600);
const tokenLimit = rateLimit("public-status:token", 30, 3600);

publicStatusRouter.get("/:slug", readLimit, status);
publicStatusRouter.get("/:slug/incidents", readLimit, incidents);
publicStatusRouter.get("/:slug/history", readLimit, history);
publicStatusRouter.post("/:slug/subscribe", subscribeLimit, subscribe);
publicStatusRouter.post("/:slug/subscribe/verify", tokenLimit, verify);
publicStatusRouter.post("/:slug/subscribe/resend", resendLimit, resend);
publicStatusRouter.get("/:slug/unsubscribe", tokenLimit, unsubscribeInfo);
publicStatusRouter.post("/:slug/unsubscribe", tokenLimit, unsubscribeAction);
