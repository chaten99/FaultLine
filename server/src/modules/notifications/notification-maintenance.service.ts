import { logger } from "../../config/logger.js";
import { processOutboxBatch } from "./notification-dispatcher.service.js";
import { recoverStaleDeliveries } from "./notification-delivery.service.js";
import { reconcileIncidentEvents } from "./notification-outbox.service.js";

export const runNotificationMaintenance = async (): Promise<void> => {
  const steps: Array<[string, () => Promise<unknown>]> = [
    ["reconcile incident events", () => reconcileIncidentEvents()],
    ["dispatch outbox", () => processOutboxBatch()],
    ["recover stale deliveries", () => recoverStaleDeliveries()],
  ];
  for (const [name, step] of steps) {
    try {
      await step();
    } catch (error) {
      logger.warn({ err: error, step: name }, "Notification maintenance step failed");
    }
  }
};
