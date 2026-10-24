import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { z } from "zod";

dotenv.config({
  path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../.env.local"),
});

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  CLIENT_ORIGINS: z.string().min(1).default("http://localhost:5173"),
  APP_ORIGIN: z.string().url().default("http://localhost:5173"),
  MONGODB_URI: z.string().min(1).default("mongodb://127.0.0.1:27017/faultline"),
  JWT_ACCESS_SECRET: z.string().min(32).default("development-access-secret-change-me-123456"),
  JWT_REFRESH_SECRET: z.string().min(32).default("development-refresh-secret-change-me-123456"),
  CSRF_SECRET: z.string().min(32).default("development-csrf-secret-change-me-123456"),
  JWT_ISSUER: z.string().min(1).default("faultline-api"),
  JWT_ACCESS_AUDIENCE: z.string().min(1).default("faultline-client"),
  JWT_REFRESH_AUDIENCE: z.string().min(1).default("faultline-refresh"),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(600),
  JWT_REFRESH_IDLE_TTL_DAYS: z.coerce.number().int().positive().default(7),
  JWT_REFRESH_ABSOLUTE_TTL_DAYS: z.coerce.number().int().positive().default(30),
});

const parsedEnvironment = environmentSchema.safeParse(process.env);

if (!parsedEnvironment.success) {
  throw new Error(`Invalid server configuration: ${parsedEnvironment.error.message}`);
}

export const env = parsedEnvironment.data;
export const clientOrigins = env.CLIENT_ORIGINS.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
