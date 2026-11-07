import { Types } from "mongoose";
import { MonitorCheck } from "../checks/monitor-check.model.js";
import { QUALIFYING_FAILURES } from "../incidents/incident.service.js";
import { Incident } from "../incidents/incident.model.js";
import { MonitorLifecycleEvent } from "../monitors/monitor-lifecycle.model.js";
import { gapGraceMs, type Interval } from "./analytics-intervals.js";
import type { HistogramRow } from "./analytics-stats.js";

const maxGapRows = 50_000;
const maxHistogramRows = 1_000_000;

export type MonitorScope = {
  id: string;
  intervalSeconds: number;
};

const toObjectIds = (ids: string[]) => ids.map((id) => new Types.ObjectId(id));

const eligibleMatch = (userId: string, ids: string[], from: Date, to: Date) => ({
  userId: new Types.ObjectId(userId),
  monitorId: { $in: toObjectIds(ids) },
  completedAt: { $gte: from, $lt: to },
  $or: [
    { status: "success" },
    { status: { $in: ["failure", "timeout"] }, failureCategory: { $in: QUALIFYING_FAILURES } },
  ],
});

const latencyMatch = (userId: string, ids: string[], from: Date, to: Date) => ({
  ...eligibleMatch(userId, ids, from, to),
  status: { $in: ["success", "failure"] },
  statusCode: { $type: "number" },
  responseDurationMs: { $gte: 0 },
});

const quantizedDuration = {
  $let: {
    vars: { whole: { $floor: "$responseDurationMs" } },
    in: {
      $cond: [
        { $lt: ["$$whole", 1000] },
        "$$whole",
        { $subtract: ["$$whole", { $mod: ["$$whole", 10] }] },
      ],
    },
  },
};

const bucketExpression = (bucketMs: number) => ({
  $subtract: ["$completedAt", { $mod: [{ $toLong: "$completedAt" }, bucketMs] }],
});

export type MonitorCheckStats = {
  monitorId: string;
  total: number;
  successful: number;
  firstCheckAt: number;
  lastCheckAt: number;
};

export const loadCheckStats = async (
  userId: string,
  ids: string[],
  from: Date,
  to: Date,
): Promise<MonitorCheckStats[]> => {
  if (ids.length === 0) return [];
  const rows = await MonitorCheck.aggregate<{
    _id: Types.ObjectId;
    total: number;
    successful: number;
    firstCheckAt: Date;
    lastCheckAt: Date;
  }>([
    { $match: eligibleMatch(userId, ids, from, to) },
    {
      $group: {
        _id: "$monitorId",
        total: { $sum: 1 },
        successful: { $sum: { $cond: [{ $eq: ["$status", "success"] }, 1, 0] } },
        firstCheckAt: { $min: "$completedAt" },
        lastCheckAt: { $max: "$completedAt" },
      },
    },
  ]);
  return rows.map((row) => ({
    monitorId: String(row._id),
    total: row.total,
    successful: row.successful,
    firstCheckAt: row.firstCheckAt.getTime(),
    lastCheckAt: row.lastCheckAt.getTime(),
  }));
};

export const loadBucketCounts = async (
  userId: string,
  ids: string[],
  from: Date,
  to: Date,
  bucketMs: number,
): Promise<Map<number, { total: number; failed: number }>> => {
  if (ids.length === 0) return new Map();
  const rows = await MonitorCheck.aggregate<{
    _id: Date;
    total: number;
    failed: number;
  }>([
    { $match: eligibleMatch(userId, ids, from, to) },
    {
      $group: {
        _id: bucketExpression(bucketMs),
        total: { $sum: 1 },
        failed: { $sum: { $cond: [{ $eq: ["$status", "success"] }, 0, 1] } },
      },
    },
  ]);
  return new Map(rows.map((row) => [row._id.getTime(), { total: row.total, failed: row.failed }]));
};

export const countChecksInSegments = async (
  userId: string,
  segments: Array<{ monitorId: string; intervals: Interval[] }>,
): Promise<Map<string, number>> => {
  const clauses = segments.flatMap(({ monitorId, intervals }) =>
    intervals.map((interval) => ({
      monitorId: new Types.ObjectId(monitorId),
      completedAt: { $gte: new Date(interval.start), $lt: new Date(interval.end) },
    })),
  );
  if (clauses.length === 0) return new Map();
  const rows = await MonitorCheck.aggregate<{ _id: Types.ObjectId; total: number }>([
    {
      $match: {
        userId: new Types.ObjectId(userId),
        $and: [
          { $or: clauses },
          {
            $or: [
              { status: "success" },
              {
                status: { $in: ["failure", "timeout"] },
                failureCategory: { $in: QUALIFYING_FAILURES },
              },
            ],
          },
        ],
      },
    },
    { $group: { _id: "$monitorId", total: { $sum: 1 } } },
  ]);
  return new Map(rows.map((row) => [String(row._id), row.total]));
};

type RawHistogramRow = {
  _id: { bucket?: Date; monitorId?: Types.ObjectId; value: number };
  count: number;
  sum: number;
  min: number;
  max: number;
};

const groupStage = (key: Record<string, unknown>) => ({
  $group: {
    _id: { ...key, value: quantizedDuration },
    count: { $sum: 1 },
    sum: { $sum: "$responseDurationMs" },
    min: { $min: "$responseDurationMs" },
    max: { $max: "$responseDurationMs" },
  },
});

const toRow = (row: RawHistogramRow): HistogramRow => ({
  value: row._id.value,
  count: row.count,
  sum: row.sum,
  min: row.min,
  max: row.max,
});

export const loadLatencyByBucket = async (
  userId: string,
  ids: string[],
  from: Date,
  to: Date,
  bucketMs: number,
): Promise<Map<number, HistogramRow[]>> => {
  if (ids.length === 0) return new Map();
  const rows = await MonitorCheck.aggregate<RawHistogramRow>(
    [
      { $match: latencyMatch(userId, ids, from, to) },
      groupStage({ bucket: bucketExpression(bucketMs) }),
      { $limit: maxHistogramRows },
    ],
    { allowDiskUse: true },
  );
  const result = new Map<number, HistogramRow[]>();
  for (const row of rows) {
    const key = (row._id.bucket as Date).getTime();
    const list = result.get(key) ?? [];
    list.push(toRow(row));
    result.set(key, list);
  }
  return result;
};

export const loadLatencyByMonitor = async (
  userId: string,
  ids: string[],
  from: Date,
  to: Date,
): Promise<Map<string, HistogramRow[]>> => {
  if (ids.length === 0) return new Map();
  const rows = await MonitorCheck.aggregate<RawHistogramRow>(
    [
      { $match: latencyMatch(userId, ids, from, to) },
      groupStage({ monitorId: "$monitorId" }),
      { $limit: maxHistogramRows },
    ],
    { allowDiskUse: true },
  );
  const result = new Map<string, HistogramRow[]>();
  for (const row of rows) {
    const key = String(row._id.monitorId);
    const list = result.get(key) ?? [];
    list.push(toRow(row));
    result.set(key, list);
  }
  return result;
};

export const loadCheckGaps = async (
  userId: string,
  monitors: MonitorScope[],
  from: Date,
  to: Date,
): Promise<Map<string, Array<{ prev: number; next: number }>>> => {
  if (monitors.length === 0) return new Map();
  const byInterval = new Map<number, Types.ObjectId[]>();
  for (const monitor of monitors) {
    const list = byInterval.get(monitor.intervalSeconds) ?? [];
    list.push(new Types.ObjectId(monitor.id));
    byInterval.set(monitor.intervalSeconds, list);
  }
  const branches = [...byInterval.entries()].map(([intervalSeconds, ids]) => {
    const intervalMs = intervalSeconds * 1000;
    return { case: { $in: ["$monitorId", ids] }, then: intervalMs + gapGraceMs(intervalMs) };
  });
  const rows = await MonitorCheck.aggregate<{
    monitorId: Types.ObjectId;
    prev: Date;
    at: Date;
  }>(
    [
      {
        $match: eligibleMatch(
          userId,
          monitors.map((monitor) => monitor.id),
          from,
          to,
        ),
      },
      { $project: { monitorId: 1, completedAt: 1 } },
      {
        $setWindowFields: {
          partitionBy: "$monitorId",
          sortBy: { completedAt: 1 },
          output: { prev: { $shift: { output: "$completedAt", by: -1 } } },
        },
      },
      { $match: { prev: { $ne: null } } },
      {
        $addFields: {
          delta: { $subtract: ["$completedAt", "$prev"] },
          tolerance: { $switch: { branches, default: Number.MAX_SAFE_INTEGER } },
        },
      },
      { $match: { $expr: { $gt: ["$delta", "$tolerance"] } } },
      { $project: { _id: 0, monitorId: 1, prev: 1, at: "$completedAt" } },
      { $limit: maxGapRows },
    ],
    { allowDiskUse: true },
  );
  const result = new Map<string, Array<{ prev: number; next: number }>>();
  for (const row of rows) {
    const key = String(row.monitorId);
    const list = result.get(key) ?? [];
    list.push({ prev: row.prev.getTime(), next: row.at.getTime() });
    result.set(key, list);
  }
  return result;
};

export type LifecycleRecord = {
  monitorId: string;
  at: number;
  type: "created" | "paused" | "resumed" | "tracking_started";
  active: boolean;
};

export const loadLifecycleEvents = async (
  ids: string[],
  to: Date,
): Promise<Map<string, LifecycleRecord[]>> => {
  if (ids.length === 0) return new Map();
  const rows = await MonitorLifecycleEvent.find({
    monitorId: { $in: toObjectIds(ids) },
    at: { $lt: to },
  })
    .sort({ at: 1 })
    .lean();
  const result = new Map<string, LifecycleRecord[]>();
  for (const row of rows) {
    const key = String(row.monitorId);
    const list = result.get(key) ?? [];
    list.push({
      monitorId: key,
      at: new Date(row.at).getTime(),
      type: row.type,
      active: row.active,
    });
    result.set(key, list);
  }
  return result;
};

export type IncidentRecord = {
  id: string;
  monitorId: string;
  title: string;
  status: "open" | "acknowledged" | "resolved";
  firstFailureAt: number;
  resolvedAt: number | null;
  durationMs: number | null;
};

export const loadIncidents = async (
  userId: string,
  ids: string[],
  from: Date,
  to: Date,
  limit = 5000,
): Promise<IncidentRecord[]> => {
  if (ids.length === 0) return [];
  const rows = await Incident.find({
    userId: new Types.ObjectId(userId),
    monitorId: { $in: toObjectIds(ids) },
    firstFailureAt: { $lt: to },
    $or: [{ resolvedAt: { $gte: from } }, { resolvedAt: { $exists: false } }, { resolvedAt: null }],
  })
    .sort({ firstFailureAt: -1 })
    .limit(limit)
    .select("monitorId title status firstFailureAt resolvedAt durationMs")
    .lean();
  return rows.map((row) => ({
    id: String(row._id),
    monitorId: String(row.monitorId),
    title: row.title,
    status: row.status,
    firstFailureAt: new Date(row.firstFailureAt).getTime(),
    resolvedAt: row.resolvedAt ? new Date(row.resolvedAt).getTime() : null,
    durationMs: row.durationMs ?? null,
  }));
};
