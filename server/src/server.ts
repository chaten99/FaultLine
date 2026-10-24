import mongoose from "mongoose";
import { app } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";

const startServer = async () => {
  try {
    await mongoose.connect(env.MONGODB_URI);
    const server = app.listen(env.PORT, () => {
      logger.info({ port: env.PORT }, "FaultLine API started");
    });

    const shutdown = async (signal: string) => {
      logger.info({ signal }, "Shutting down FaultLine API");
      server.close(async () => {
        await mongoose.disconnect();
        process.exit(0);
      });
    };

    process.once("SIGINT", () => void shutdown("SIGINT"));
    process.once("SIGTERM", () => void shutdown("SIGTERM"));
  } catch (error) {
    logger.fatal({ err: error }, "FaultLine API failed to start");
    process.exit(1);
  }
};

void startServer();
