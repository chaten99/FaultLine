import express from "express";
import helmet from "helmet";
import { requestLogger } from "./middleware/request-logger.js";
import { healthRouter } from "./modules/health/health.routes.js";

export const app = express();
app.use(helmet());
app.use(express.json({ limit: "100kb" }));
app.use(requestLogger);
app.use("/api", healthRouter);
app.use((_request, response) => {
  response.status(404).json({ status: "error", message: "Route not found" });
});
