import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { clientOrigins } from "./config/env.js";
import { requestLogger } from "./middleware/request-logger.js";
import { healthRouter } from "./modules/health/health.routes.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { errorHandler } from "./middleware/error-handler.js";

export const app = express();
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
  }),
);
app.use(express.json({ limit: "100kb" }));
app.use(cookieParser());
app.use(requestLogger);
app.use("/api", healthRouter);
app.use("/api/auth", authRouter);
app.use((_request, response) => {
  response.status(404).json({ status: "error", message: "Route not found" });
});
app.use(errorHandler);
