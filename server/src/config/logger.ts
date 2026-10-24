import pino from "pino";
import { env } from "./env.js";

export const logger = pino({
  level: env.LOG_LEVEL,
  base: {
    service: "faultline-api",
    environment: env.NODE_ENV,
  },
  redact: ["req.headers.authorization", "req.headers.cookie", "res.headers.set-cookie"],
  transport:
    env.NODE_ENV === "development"
      ? { target: "pino-pretty", options: { colorize: true } }
      : undefined,
});
