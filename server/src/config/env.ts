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
  RESEND_API_KEY: z.string().min(1).default("re_development_placeholder"),
  RESEND_FROM_EMAIL: z.string().min(1).default("FaultLine <no-reply@example.com>"),
  OTP_HASH_SECRET: z.string().min(32).default("development-otp-hash-secret-change-me-123456"),
  OTP_CODE_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  OTP_RESEND_COOLDOWN_SECONDS: z.coerce.number().int().positive().default(60),
  OTP_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  OTP_MAX_SENDS_PER_HOUR: z.coerce.number().int().positive().default(5),
  PASSWORD_RESET_GRANT_TTL_SECONDS: z.coerce.number().int().positive().default(600),
  REDIS_URL: z.string().min(1).default("redis://127.0.0.1:6379"),
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(100).default(10),
  CHECK_RETENTION_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  MONITOR_QUEUE_NAME: z.string().min(1).default("faultline-monitor-checks"),
  RECONCILIATION_INTERVAL_SECONDS: z.coerce.number().int().min(60).max(86400).default(300),
  NOTIFICATION_ENCRYPTION_KEY: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z
      .string()
      .regex(/^[a-fA-F0-9]{64}$/, "NOTIFICATION_ENCRYPTION_KEY must be 64 hexadecimal characters")
      .optional(),
  ),
  NOTIFICATION_QUEUE_NAME: z.string().min(1).default("faultline-notifications"),
  NOTIFICATION_WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(50).default(5),
  NOTIFICATION_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(5),
  NOTIFICATION_DELIVERY_TIMEOUT_MS: z.coerce.number().int().min(1000).max(30000).default(10000),
  NOTIFICATION_RETRY_BASE_MS: z.coerce.number().int().min(500).max(60000).default(5000),
  NOTIFICATION_RETRY_MAX_MS: z.coerce.number().int().min(1000).max(3600000).default(300000),
  NOTIFICATION_OUTBOX_INTERVAL_MS: z.coerce.number().int().min(5000).max(600000).default(30000),
});

const parsedEnvironment = environmentSchema.safeParse(process.env);

if (!parsedEnvironment.success) {
  throw new Error(`Invalid server configuration: ${parsedEnvironment.error.message}`);
}

export const env = parsedEnvironment.data;
export const clientOrigins = env.CLIENT_ORIGINS.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
