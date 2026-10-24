import { createRequire } from "node:module";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { RequestHandler } from "express";
import type { Logger } from "pino";
import { logger } from "../config/logger.js";

const require = createRequire(import.meta.url);
type PinoHttp = (options: {
  logger: Logger;
  genReqId: (request: IncomingMessage) => string;
  serializers: {
    req: (request: IncomingMessage) => object;
    res: (response: ServerResponse) => object;
  };
}) => RequestHandler;
const pinoHttp = require("pino-http") as PinoHttp;

export const requestLogger = pinoHttp({
  logger,
  genReqId: (request) => request.headers["x-request-id"]?.toString() ?? crypto.randomUUID(),
  serializers: {
    req: (request) => ({ id: request.id, method: request.method, url: request.url }),
    res: (response) => ({ statusCode: response.statusCode }),
  },
});
