import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
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

analyticsRouter.use(authenticate);
analyticsRouter.get("/overview", readLimit, overview);
analyticsRouter.get("/response-times", readLimit, responseTimes);
analyticsRouter.get("/availability", readLimit, availability);
analyticsRouter.get("/monitors", readLimit, monitorTable);
analyticsRouter.get("/incidents", readLimit, incidents);
analyticsRouter.get("/export", exportLimit, exportReport);
analyticsRouter.get("/monitors/:monitorId", readLimit, monitorDetail);
