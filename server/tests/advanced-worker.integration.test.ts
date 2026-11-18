import mongoose, { Types } from "mongoose";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Worker } from "bullmq";
import { env } from "../src/config/env.js";
import { Monitor } from "../src/modules/monitors/monitor.model.js";
import { MonitorCheck } from "../src/modules/checks/monitor-check.model.js";
import {
  getMonitorCheckQueue,
  closeMonitorCheckQueue,
  type MonitorCheckJobData,
} from "../src/queues/monitor-check.queue.js";
import {
  createMonitorCheckWorker,
  closeMonitorCheckWorker,
} from "../src/workers/monitor-check.worker.js";
import { closeRedisConnections } from "../src/lib/redis/redis.service.js";
import { executeMonitorHttpCheck } from "../src/modules/monitors/monitor-executor.service.js";
import {
  protectHttpConfig,
  secretContext,
} from "../src/modules/monitors/monitor-credentials.service.js";
import { httpConfigSchema } from "../src/modules/monitors/advanced.validation.js";
const baseUri = process.env.ANALYTICS_TEST_MONGODB_URI;
const uri = baseUri
  ? baseUri.slice(0, baseUri.lastIndexOf("/") + 1) + "faultline_worker_integration"
  : undefined;
const redisUrl = process.env.PHASE9_REDIS_TEST_URL;
vi.mock("../src/modules/monitors/monitor-executor.service.js", async (original) => ({
  ...(await original<typeof import("../src/modules/monitors/monitor-executor.service.js")>()),
  executeMonitorHttpCheck: vi
    .fn()
    .mockResolvedValue({ success: true, statusCode: 200, durationMs: 5 }),
}));
const completed = (worker: Worker<MonitorCheckJobData>, runId: string) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      worker.off("completed", listener);
      reject(new Error("Test job did not complete"));
    }, 10000);
    const listener = (job: { data: MonitorCheckJobData }) => {
      if (job.data.runId === runId) {
        clearTimeout(timer);
        worker.off("completed", listener);
        resolve();
      }
    };
    worker.on("completed", listener);
  });
describe.skipIf(!uri || !redisUrl)(
  "advanced checks on real BullMQ and Redis across worker restarts",
  () => {
    const workspaceId = new Types.ObjectId(),
      userId = new Types.ObjectId(),
      monitorId = new Types.ObjectId();
    let originalQueueName: string, originalRedisUrl: string;
    const protectedConfig = (token: string) =>
      protectHttpConfig(
        httpConfigSchema.parse({ authType: "bearer", token }),
        {},
        secretContext(String(workspaceId), String(monitorId)),
      );
    beforeAll(async () => {
      originalQueueName = env.MONITOR_QUEUE_NAME;
      originalRedisUrl = env.REDIS_URL;
      env.MONITOR_QUEUE_NAME = "faultline-phase9-test-" + process.pid + "-" + Date.now();
      env.REDIS_URL = redisUrl!;
      await mongoose.connect(uri!);
      await mongoose.connection.dropDatabase();
      await MonitorCheck.syncIndexes();
      await Monitor.create({
        _id: monitorId,
        userId,
        workspaceId,
        name: "Restart check",
        url: "https://fixture.example",
        intervalSeconds: 60,
        timeoutMs: 1000,
        expectedStatusCodes: [200],
        active: true,
        configRevision: 1,
        ...protectedConfig("obsolete-token"),
      });
      await getMonitorCheckQueue().waitUntilReady();
    });
    afterAll(async () => {
      await closeMonitorCheckWorker();
      if (env.MONITOR_QUEUE_NAME.startsWith("faultline-phase9-test-"))
        await getMonitorCheckQueue().obliterate({ force: true });
      await closeMonitorCheckQueue();
      await closeRedisConnections();
      await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
      env.MONITOR_QUEUE_NAME = originalQueueName;
      env.REDIS_URL = originalRedisUrl;
    });
    it("loads current credentials for queued jobs and continues after restarting the existing worker", async () => {
      const queue = getMonitorCheckQueue();
      await queue.add(
        "check",
        { monitorId: String(monitorId), runId: "before-start", queuedAt: new Date().toISOString() },
        { jobId: "before-start" },
      );
      await Monitor.updateOne(
        { _id: monitorId },
        { $set: { ...protectedConfig("current-token"), configRevision: 2 } },
      );
      let worker = createMonitorCheckWorker();
      await completed(worker, "before-start");
      expect(vi.mocked(executeMonitorHttpCheck).mock.calls[0]?.[0].secrets?.token).toBe(
        "current-token",
      );
      expect(await MonitorCheck.findOne({ runId: "before-start" }).lean()).toMatchObject({
        status: "success",
        configRevision: 2,
      });
      await closeMonitorCheckWorker();
      await Monitor.updateOne(
        { _id: monitorId },
        { $set: { ...protectedConfig("rotated-token"), configRevision: 3 } },
      );
      const job = await queue.add(
        "check",
        {
          monitorId: String(monitorId),
          runId: "after-restart",
          queuedAt: new Date().toISOString(),
        },
        { jobId: "after-restart" },
      );
      expect(JSON.stringify(job.data)).not.toMatch(/token|encrypted|password|headers/i);
      worker = createMonitorCheckWorker();
      await completed(worker, "after-restart");
      expect(vi.mocked(executeMonitorHttpCheck).mock.calls.at(-1)?.[0].secrets?.token).toBe(
        "rotated-token",
      );
      expect(await MonitorCheck.findOne({ runId: "after-restart" }).lean()).toMatchObject({
        status: "success",
        configRevision: 3,
      });
      expect(await MonitorCheck.countDocuments({ monitorId })).toBe(2);
    });
  },
);
