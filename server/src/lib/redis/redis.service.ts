import { Redis } from "ioredis";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";

let defaultClient: Redis | null = null;
const clientPool = new Set<Redis>();

export const createRedisConnection = (): Redis => {
  const client = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    retryStrategy: (times) => Math.min(times * 150, 3000),
    lazyConnect: true,
  });

  client.on("error", (err) => {
    logger.error({ err: err.message }, "Redis connection error");
  });

  clientPool.add(client);
  return client;
};

export const getRedisClient = (): Redis => {
  if (!defaultClient) {
    defaultClient = createRedisConnection();
  }
  return defaultClient;
};

export const closeRedisConnections = async (): Promise<void> => {
  const promises: Promise<unknown>[] = [];
  for (const client of clientPool) {
    if (client.status !== "end") {
      promises.push(client.quit().catch(() => client.disconnect()));
    }
  }
  await Promise.all(promises);
  clientPool.clear();
  defaultClient = null;
};

export const acquireLock = async (key: string, token: string, ttlMs: number): Promise<boolean> => {
  try {
    const client = getRedisClient();
    if (client.status === "wait") {
      await client.connect();
    }
    const result = await client.set(key, token, "PX", ttlMs, "NX");
    return result === "OK";
  } catch (error) {
    logger.warn({ key, err: error }, "Failed to acquire lock from Redis");
    throw error;
  }
};

const releaseLockScript = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
`;

export const releaseLock = async (key: string, token: string): Promise<boolean> => {
  try {
    const client = getRedisClient();
    if (client.status === "wait") {
      await client.connect();
    }
    const result = await client.eval(releaseLockScript, 1, key, token);
    return result === 1;
  } catch (error) {
    logger.warn({ key, err: error }, "Failed to release lock from Redis");
    return false;
  }
};

export const publishDomainEvent = async (
  channel: string,
  payload: Record<string, unknown>,
): Promise<void> => {
  try {
    const client = getRedisClient();
    if (client.status === "wait") {
      await client.connect();
    }
    await client.publish("faultline:domain-events", JSON.stringify({ type: channel, ...payload }));
  } catch (error) {
    logger.warn({ channel, err: error }, "Failed to publish domain event");
  }
};
