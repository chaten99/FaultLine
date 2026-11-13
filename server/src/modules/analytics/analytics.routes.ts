import { Router } from "express";
import { withWorkspace } from "../workspaces/workspace-context.js";
import { rateLimit } from "../../lib/rate-limit.js";
import {
  availability,
  exportReport,
  incidents,
  monitorDetail,
  monitorTable,
  overview,
  responseTimes,
} from "./analytics.controller.js";

export const analyticsRouter = Router();
const readLimit = rateLimit("analytics:read", 120, 60);
const exportLimit = rateLimit("analytics:export", 10, 60);

const viewAnalytics = withWorkspace("analytics:view");
analyticsRouter.get("/overview", ...viewAnalytics, readLimit, overview);
analyticsRouter.get("/response-times", ...viewAnalytics, readLimit, responseTimes);
analyticsRouter.get("/availability", ...viewAnalytics, readLimit, availability);
analyticsRouter.get("/monitors", ...viewAnalytics, readLimit, monitorTable);
analyticsRouter.get("/incidents", ...viewAnalytics, readLimit, incidents);
analyticsRouter.get("/export", ...viewAnalytics, exportLimit, exportReport);
analyticsRouter.get("/monitors/:monitorId", ...viewAnalytics, readLimit, monitorDetail);
