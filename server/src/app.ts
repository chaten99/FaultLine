import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { clientOrigins } from "./config/env.js";
import { requestLogger } from "./middleware/request-logger.js";
import { healthRouter } from "./modules/health/health.routes.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { errorHandler } from "./middleware/error-handler.js";
import { monitorRouter } from "./modules/monitors/monitor.routes.js";
import { incidentRouter } from "./modules/incidents/incident.routes.js";
import { analyticsRouter } from "./modules/analytics/analytics.routes.js";
import { publicStatusRouter } from "./modules/status-pages/status-page-public.routes.js";
import { statusPageRouter } from "./modules/status-pages/status-page.routes.js";
import { profileRouter } from "./modules/profile/profile.routes.js";
import { notificationRouter } from "./modules/notifications/notification.routes.js";

export const app = express();
app.set("trust proxy", "loopback, linklocal, uniquelocal");
app.use(helmet());
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || clientOrigins.includes(origin)) return callback(null, true);
      return callback(new Error("Origin is not allowed"));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-CSRF-Token", "X-Request-ID"],
    exposedHeaders: ["Content-Disposition"],
  }),
);
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: false, limit: "10kb" }));
app.use(cookieParser());
app.use(requestLogger);
app.use("/api", healthRouter);
app.use("/api/auth", authRouter);
app.use("/api/monitors", monitorRouter);
app.use("/api/incidents", incidentRouter);
app.use("/api/notifications", notificationRouter);
app.use("/api/profile", profileRouter);
app.use("/api/analytics", analyticsRouter);
app.use("/api/status-pages", statusPageRouter);
app.use("/api/public/status-pages", publicStatusRouter);
app.use((_request, response) => {
  response.status(404).json({ status: "error", message: "Route not found" });
});
app.use(errorHandler);
