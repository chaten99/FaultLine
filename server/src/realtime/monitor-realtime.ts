import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { Redis } from "ioredis";
import { clientOrigins, env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { registerPublicNamespace, routePublicEvent } from "./public-realtime.js";
import { routeWorkspaceEvent, selectWorkspace, userRoom } from "./workspace-realtime.js";
import { getAccessTokenExpiry, verifyAccessToken } from "../modules/auth/auth-token.service.js";

const channel = "faultline:domain-events";
let subscriber: Redis | null = null;

export const startMonitorRealtime = async (httpServer: HttpServer) => {
  const io = new Server(httpServer, {
    cors: { origin: clientOrigins, credentials: true },
  });
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (typeof token !== "string") return next(new Error("Authentication required"));
    try {
      socket.data.userId = verifyAccessToken(token);
      socket.data.expiresAt = getAccessTokenExpiry(token);
      return next();
    } catch {
      return next(new Error("Authentication required"));
    }
  });
  io.on("connection", (socket) => {
    void socket.join(userRoom(socket.data.userId as string));
    socket.on("workspace:select", (payload: unknown, ack?: (response: { ok: boolean }) => void) => {
      void selectWorkspace(socket, payload, ack).catch(() => {
        if (typeof ack === "function") ack({ ok: false });
      });
    });
    const delay = Math.max(0, Number(socket.data.expiresAt) * 1000 - Date.now());
    const expiryTimer = setTimeout(() => socket.disconnect(true), delay);
    socket.once("disconnect", () => clearTimeout(expiryTimer));
  });

  const publicNamespace = io.of("/public");
  registerPublicNamespace(publicNamespace);

  subscriber = new Redis(env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: null });
  subscriber.on("error", (err) =>
    logger.error({ err: err.message }, "Realtime Redis subscriber error"),
  );
  await subscriber.connect();
  await subscriber.subscribe(channel);
  subscriber.on("message", (_channel, raw) => {
    try {
      const event = JSON.parse(raw) as {
        type?: string;
        userId?: string;
        workspaceId?: string;
        pageId?: string;
        payload?: Record<string, unknown>;
      };
      if (routePublicEvent(publicNamespace, event)) return;
      routeWorkspaceEvent(io, event);
    } catch {
      logger.warn("Discarded malformed domain event");
    }
  });

  return async () => {
    await io.close();
    if (subscriber && subscriber.status !== "end") await subscriber.quit();
    subscriber = null;
  };
};
