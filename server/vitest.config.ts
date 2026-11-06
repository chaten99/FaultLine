import crypto from "node:crypto";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    exclude: ["dist/**", "node_modules/**"],
    env: {
      NOTIFICATION_ENCRYPTION_KEY: crypto.randomBytes(32).toString("hex"),
      NOTIFICATION_MAX_ATTEMPTS: "5",
      NOTIFICATION_RETRY_BASE_MS: "5000",
      NOTIFICATION_RETRY_MAX_MS: "300000",
      NOTIFICATION_DELIVERY_TIMEOUT_MS: "10000",
      APP_ORIGIN: "https://app.faultline.test",
    },
  },
});
