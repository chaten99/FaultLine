import { Types } from "mongoose";
import { Incident } from "./incident.model.js";
import { IncidentTimeline } from "./incident-timeline.model.js";
import { Monitor } from "../monitors/monitor.model.js";
import { createApiError } from "../../lib/errors/create-api-error.js";
import { publishDomainEvent } from "../../lib/redis/redis.service.js";
import { logger } from "../../config/logger.js";
import { recordIncidentNotificationEvent } from "../notifications/notification-outbox.service.js";

const QUALIFYING_FAILURES = ["UNEXPECTED_STATUS", "TIMEOUT", "NETWORK_ERROR", "DNS_FAILURE"];

export interface EvaluateCheckInput {
  runId: string;
  success: boolean;
  statusCode?: number;
  failureCategory?: string;
  errorMessage?: string;
  completedAt: Date;
}

export const evaluateCheckForIncident = async (
  monitorId: string,
  checkData: EvaluateCheckInput,
): Promise<void> => {
  if (!Types.ObjectId.isValid(monitorId)) return;

  const monitor = await Monitor.findById(monitorId);
  if (!monitor) return;

  if (monitor.lastEvaluatedCheckId === checkData.runId) return;

  const isQualifyingFailure =
    !checkData.success &&
    typeof checkData.failureCategory === "string" &&
    QUALIFYING_FAILURES.includes(checkData.failureCategory);

  const isQualifyingSuccess = checkData.success;

  if (!isQualifyingFailure && !isQualifyingSuccess) {
    await Monitor.findByIdAndUpdate(monitor._id, {
      $set: { lastEvaluatedCheckId: checkData.runId },
    });
    return;
  }

  let activeIncident = monitor.activeIncidentId
    ? await Incident.findOne({
        _id: monitor.activeIncidentId,
        status: { $in: ["open", "acknowledged"] },
      })
    : null;

  if (!activeIncident) {
    activeIncident = await Incident.findOne({
      monitorId: monitor._id,
      status: { $in: ["open", "acknowledged"] },
    });
  }

  if (isQualifyingFailure) {
    if (!activeIncident) {
      const newConsecutiveFailures = (monitor.consecutiveFailures ?? 0) + 1;
      const firstFailureAt =
        newConsecutiveFailures === 1
          ? checkData.completedAt
          : (monitor.firstFailureAt ?? checkData.completedAt);
      const firstFailureCheckId =
        newConsecutiveFailures === 1
          ? checkData.runId
          : (monitor.firstFailureCheckId ?? checkData.runId);

      const threshold = monitor.failureThreshold ?? 3;

      if (newConsecutiveFailures >= threshold) {
        let incidentDoc = null;
        try {
          incidentDoc = await Incident.create({
            monitorId: monitor._id,
            userId: monitor.userId,
            title: `Incident on ${monitor.name}: ${checkData.failureCategory}`,
            status: "open",
            firstFailureAt,
            lastFailureAt: checkData.completedAt,
            openedAt: new Date(),
            firstFailureCheckId,
            latestFailureCheckId: checkData.runId,
            failureCountAtCreation: newConsecutiveFailures,
          });
        } catch (err: unknown) {
          if ((err as { code?: number }).code === 11000) {
            incidentDoc = await Incident.findOne({
              monitorId: monitor._id,
              status: { $in: ["open", "acknowledged"] },
            });
          } else {
            throw err;
          }
        }

        if (incidentDoc) {
          try {
            await IncidentTimeline.create({
              incidentId: incidentDoc._id,
              monitorId: monitor._id,
              userId: monitor.userId,
              type: "incident.created",
              actorType: "system",
              checkId: checkData.runId,
              message: `Incident detected: ${newConsecutiveFailures} consecutive checks failed (${checkData.failureCategory})`,
              metadata: {
                failureCategory: checkData.failureCategory,
                statusCode: checkData.statusCode,
                errorMessage: checkData.errorMessage,
              },
              idempotencyKey: `incident-created-${String(incidentDoc._id)}`,
            });
          } catch (timelineErr) {
            logger.warn({ err: timelineErr }, "Failed to persist timeline entry");
          }

          await Monitor.findByIdAndUpdate(monitor._id, {
            $set: {
              activeIncidentId: incidentDoc._id,
              consecutiveFailures: newConsecutiveFailures,
              consecutiveSuccesses: 0,
              firstFailureAt,
              firstFailureCheckId,
              lastEvaluatedCheckId: checkData.runId,
            },
          });

          await recordIncidentNotificationEvent("incident.opened", String(incidentDoc._id));

          await publishDomainEvent("incident.created", {
            userId: String(monitor.userId),
            payload: {
              incidentId: String(incidentDoc._id),
              monitorId: String(monitor._id),
              title: incidentDoc.title,
              status: incidentDoc.status,
              openedAt: incidentDoc.openedAt.toISOString(),
              firstFailureAt: incidentDoc.firstFailureAt.toISOString(),
            },
          });
        }
      } else {
        await Monitor.findByIdAndUpdate(monitor._id, {
          $set: {
            consecutiveFailures: newConsecutiveFailures,
            consecutiveSuccesses: 0,
            firstFailureAt,
            firstFailureCheckId,
            lastEvaluatedCheckId: checkData.runId,
          },
        });
      }
    } else {
      await Incident.findByIdAndUpdate(activeIncident._id, {
        $set: {
          lastFailureAt: checkData.completedAt,
          latestFailureCheckId: checkData.runId,
        },
      });

      try {
        await IncidentTimeline.create({
          incidentId: activeIncident._id,
          monitorId: monitor._id,
          userId: monitor.userId,
          type: "incident.failure_observed",
          actorType: "system",
          checkId: checkData.runId,
          message: `Check failed: ${checkData.failureCategory}${checkData.statusCode ? ` (HTTP ${checkData.statusCode})` : ""}`,
          metadata: {
            failureCategory: checkData.failureCategory,
            statusCode: checkData.statusCode,
            errorMessage: checkData.errorMessage,
          },
          idempotencyKey: `incident-failure-${String(activeIncident._id)}-${checkData.runId}`,
        });
      } catch (timelineErr) {
        logger.warn({ err: timelineErr }, "Failed to persist timeline entry");
      }

      await Monitor.findByIdAndUpdate(monitor._id, {
        $set: {
          activeIncidentId: activeIncident._id,
          consecutiveSuccesses: 0,
          lastEvaluatedCheckId: checkData.runId,
        },
        $inc: { consecutiveFailures: 1 },
      });

      await publishDomainEvent("incident.updated", {
        userId: String(monitor.userId),
        payload: {
          incidentId: String(activeIncident._id),
          monitorId: String(monitor._id),
          status: activeIncident.status,
          lastFailureAt: checkData.completedAt.toISOString(),
        },
      });
    }
  } else if (isQualifyingSuccess) {
    if (!activeIncident) {
      await Monitor.findByIdAndUpdate(monitor._id, {
        $set: {
          consecutiveFailures: 0,
          firstFailureAt: null,
          firstFailureCheckId: null,
          lastEvaluatedCheckId: checkData.runId,
        },
        $inc: { consecutiveSuccesses: 1 },
      });
    } else {
      const newConsecutiveSuccesses = (monitor.consecutiveSuccesses ?? 0) + 1;
      const recoveryThreshold = monitor.recoveryThreshold ?? 2;

      if (newConsecutiveSuccesses >= recoveryThreshold) {
        const resolvedAt = new Date();
        const durationMs = Math.max(
          0,
          resolvedAt.getTime() - activeIncident.firstFailureAt.getTime(),
        );

        await Incident.findByIdAndUpdate(activeIncident._id, {
          $set: {
            status: "resolved",
            resolvedAt,
            resolutionType: "automatic",
            resolutionReason: `Target recovered after ${newConsecutiveSuccesses} consecutive successful checks.`,
            recoveryCheckId: checkData.runId,
            recoveryCheckCount: newConsecutiveSuccesses,
            durationMs,
          },
        });

        try {
          await IncidentTimeline.create({
            incidentId: activeIncident._id,
            monitorId: monitor._id,
            userId: monitor.userId,
            type: "incident.resolved",
            actorType: "system",
            checkId: checkData.runId,
            message: `Incident automatically resolved after ${newConsecutiveSuccesses} consecutive successful checks.`,
            metadata: {
              consecutiveSuccesses: newConsecutiveSuccesses,
              durationMs,
            },
            idempotencyKey: `incident-resolved-${String(activeIncident._id)}`,
          });
        } catch (timelineErr) {
          logger.warn({ err: timelineErr }, "Failed to persist timeline entry");
        }

        await Monitor.findByIdAndUpdate(monitor._id, {
          $set: {
            activeIncidentId: null,
            consecutiveFailures: 0,
            consecutiveSuccesses: 0,
            firstFailureAt: null,
            firstFailureCheckId: null,
            lastEvaluatedCheckId: checkData.runId,
          },
        });

        await recordIncidentNotificationEvent("incident.resolved", String(activeIncident._id));

        await publishDomainEvent("incident.resolved", {
          userId: String(monitor.userId),
          payload: {
            incidentId: String(activeIncident._id),
            monitorId: String(monitor._id),
            status: "resolved",
            resolvedAt: resolvedAt.toISOString(),
            durationMs,
            resolutionType: "automatic",
          },
        });
      } else {
        try {
          await IncidentTimeline.create({
            incidentId: activeIncident._id,
            monitorId: monitor._id,
            userId: monitor.userId,
            type: "incident.recovery_progress",
            actorType: "system",
            checkId: checkData.runId,
            message: `Health check passed (${newConsecutiveSuccesses}/${recoveryThreshold} consecutive successes toward recovery).`,
            metadata: {
              consecutiveSuccesses: newConsecutiveSuccesses,
              recoveryThreshold,
            },
            idempotencyKey: `incident-rec-prog-${String(activeIncident._id)}-${checkData.runId}`,
          });
        } catch (timelineErr) {
          logger.warn({ err: timelineErr }, "Failed to persist timeline entry");
        }

        await Monitor.findByIdAndUpdate(monitor._id, {
          $set: {
            consecutiveFailures: 0,
            consecutiveSuccesses: newConsecutiveSuccesses,
            lastEvaluatedCheckId: checkData.runId,
          },
        });

        await publishDomainEvent("incident.recovery_progress", {
          userId: String(monitor.userId),
          payload: {
            incidentId: String(activeIncident._id),
            monitorId: String(monitor._id),
            consecutiveSuccesses: newConsecutiveSuccesses,
            recoveryThreshold,
          },
        });
      }
    }
  }
};

export const listIncidents = async (
  userId: string,
  options: {
    page: number;
    pageSize: number;
    status?: "all" | "open" | "acknowledged" | "resolved";
    monitorId?: string;
    sortBy?: "createdAt" | "openedAt" | "resolvedAt";
    sortOrder?: "asc" | "desc";
  },
) => {
  const { page, pageSize, status, monitorId, sortBy = "createdAt", sortOrder = "desc" } = options;
  const filter: Record<string, unknown> = { userId };

  if (status && status !== "all") {
    filter.status = status;
  }

  if (monitorId) {
    if (Types.ObjectId.isValid(monitorId)) {
      filter.monitorId = monitorId;
    } else {
      return {
        items: [],
        page,
        pageSize,
        total: 0,
        totalPages: 1,
        counts: { open: 0, acknowledged: 0, resolved: 0, total: 0 },
      };
    }
  }

  const sortDirection = sortOrder === "asc" ? 1 : -1;
  const sortObj: Record<string, 1 | -1> = { [sortBy]: sortDirection };
  if (sortBy !== "createdAt") {
    sortObj.createdAt = -1;
  }

  const baseCountsFilter = monitorId ? { userId, monitorId } : { userId };

  const [items, total, openCount, acknowledgedCount, resolvedCount] = await Promise.all([
    Incident.find(filter)
      .sort(sortObj)
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .populate("monitorId", "name url intervalSeconds")
      .lean(),
    Incident.countDocuments(filter),
    Incident.countDocuments({ ...baseCountsFilter, status: "open" }),
    Incident.countDocuments({ ...baseCountsFilter, status: "acknowledged" }),
    Incident.countDocuments({ ...baseCountsFilter, status: "resolved" }),
  ]);

  return {
    items,
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize) || 1,
    counts: {
      open: openCount,
      acknowledged: acknowledgedCount,
      resolved: resolvedCount,
      total: openCount + acknowledgedCount + resolvedCount,
    },
  };
};

export const getIncidentDetails = async (userId: string, incidentId: string) => {
  if (!Types.ObjectId.isValid(incidentId) || !/^[a-f\d]{24}$/i.test(incidentId)) {
    throw createApiError("Incident not found.", 404, "INCIDENT_NOT_FOUND");
  }

  const incident = await Incident.findOne({ _id: incidentId, userId })
    .populate("monitorId", "name url intervalSeconds timeoutMs active")
    .lean();

  if (!incident) {
    throw createApiError("Incident not found.", 404, "INCIDENT_NOT_FOUND");
  }

  const timeline = await IncidentTimeline.find({ incidentId })
    .sort({ createdAt: 1 })
    .populate("actorId", "name email")
    .lean();

  return { incident, timeline };
};

export const acknowledgeIncident = async (userId: string, incidentId: string) => {
  if (!Types.ObjectId.isValid(incidentId) || !/^[a-f\d]{24}$/i.test(incidentId)) {
    throw createApiError("Incident not found.", 404, "INCIDENT_NOT_FOUND");
  }

  const incident = await Incident.findOne({ _id: incidentId, userId });
  if (!incident) {
    throw createApiError("Incident not found.", 404, "INCIDENT_NOT_FOUND");
  }

  if (incident.status === "resolved") {
    throw createApiError(
      "Resolved incidents cannot be acknowledged.",
      400,
      "INCIDENT_ALREADY_RESOLVED",
    );
  }

  if (incident.status === "acknowledged") {
    throw createApiError(
      "This incident is already acknowledged.",
      400,
      "INCIDENT_ALREADY_ACKNOWLEDGED",
    );
  }

  incident.status = "acknowledged";
  incident.acknowledgedAt = new Date();
  incident.acknowledgedBy = new Types.ObjectId(userId);
  await incident.save();

  try {
    await IncidentTimeline.create({
      incidentId: incident._id,
      monitorId: incident.monitorId,
      userId: incident.userId,
      type: "incident.acknowledged",
      actorType: "user",
      actorId: new Types.ObjectId(userId),
      message: "Incident acknowledged by user.",
    });
  } catch (timelineErr) {
    logger.warn({ err: timelineErr }, "Failed to persist timeline entry");
  }

  await recordIncidentNotificationEvent("incident.acknowledged", String(incident._id));

  await publishDomainEvent("incident.acknowledged", {
    userId: String(incident.userId),
    payload: {
      incidentId: String(incident._id),
      monitorId: String(incident.monitorId),
      status: incident.status,
      acknowledgedAt: incident.acknowledgedAt.toISOString(),
    },
  });

  return incident;
};

export const resolveIncidentManually = async (
  userId: string,
  incidentId: string,
  reason?: string,
) => {
  if (!Types.ObjectId.isValid(incidentId) || !/^[a-f\d]{24}$/i.test(incidentId)) {
    throw createApiError("Incident not found.", 404, "INCIDENT_NOT_FOUND");
  }

  const incident = await Incident.findOne({ _id: incidentId, userId });
  if (!incident) {
    throw createApiError("Incident not found.", 404, "INCIDENT_NOT_FOUND");
  }

  if (incident.status === "resolved") {
    throw createApiError("This incident is already resolved.", 400, "INCIDENT_ALREADY_RESOLVED");
  }

  const resolvedAt = new Date();
  const durationMs = Math.max(0, resolvedAt.getTime() - incident.firstFailureAt.getTime());

  incident.status = "resolved";
  incident.resolvedAt = resolvedAt;
  incident.resolutionType = "manual";
  incident.resolutionReason = reason?.trim() || "Manually resolved by user.";
  incident.durationMs = durationMs;
  await incident.save();

  await Monitor.findOneAndUpdate(
    { _id: incident.monitorId, activeIncidentId: incident._id },
    {
      $set: {
        activeIncidentId: null,
        consecutiveFailures: 0,
        consecutiveSuccesses: 0,
        firstFailureAt: null,
        firstFailureCheckId: null,
      },
    },
  );

  try {
    await IncidentTimeline.create({
      incidentId: incident._id,
      monitorId: incident.monitorId,
      userId: incident.userId,
      type: "incident.manually_resolved",
      actorType: "user",
      actorId: new Types.ObjectId(userId),
      message: reason?.trim()
        ? `Incident manually resolved: ${reason.trim()}`
        : "Incident manually resolved by user.",
      metadata: { reason: reason?.trim() },
    });
  } catch (timelineErr) {
    logger.warn({ err: timelineErr }, "Failed to persist timeline entry");
  }

  await recordIncidentNotificationEvent("incident.resolved", String(incident._id));

  await publishDomainEvent("incident.resolved", {
    userId: String(incident.userId),
    payload: {
      incidentId: String(incident._id),
      monitorId: String(incident.monitorId),
      status: "resolved",
      resolvedAt: resolvedAt.toISOString(),
      durationMs,
      resolutionType: "manual",
    },
  });

  return incident;
};

export const getIncidentsSummary = async (userId: string) => {
  const [open, acknowledged, resolved] = await Promise.all([
    Incident.countDocuments({ userId, status: "open" }),
    Incident.countDocuments({ userId, status: "acknowledged" }),
    Incident.countDocuments({ userId, status: "resolved" }),
  ]);

  return {
    open,
    acknowledged,
    resolved,
    total: open + acknowledged + resolved,
  };
};
