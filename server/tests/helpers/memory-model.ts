import { Types } from "mongoose";
import { vi } from "vitest";

type Doc = Record<string, unknown> & { _id: Types.ObjectId };
type Filter = Record<string, unknown>;

const getPath = (doc: Record<string, unknown>, path: string): unknown =>
  path.split(".").reduce<unknown>((value, key) => {
    if (value === null || value === undefined) return undefined;
    return (value as Record<string, unknown>)[key];
  }, doc);

const setPath = (doc: Record<string, unknown>, path: string, value: unknown) => {
  const keys = path.split(".");
  let cursor = doc;
  for (const key of keys.slice(0, -1)) {
    if (typeof cursor[key] !== "object" || cursor[key] === null) cursor[key] = {};
    cursor = cursor[key] as Record<string, unknown>;
  }
  cursor[keys[keys.length - 1] as string] = value;
};

const unsetPath = (doc: Record<string, unknown>, path: string) => {
  const keys = path.split(".");
  let cursor: Record<string, unknown> | undefined = doc;
  for (const key of keys.slice(0, -1)) {
    cursor = cursor?.[key] as Record<string, unknown> | undefined;
  }
  if (cursor) delete cursor[keys[keys.length - 1] as string];
};

const comparable = (value: unknown): unknown => {
  if (value instanceof Date) return value.getTime();
  if (value instanceof Types.ObjectId) return String(value);
  return value;
};

const matchesCondition = (actual: unknown, condition: unknown): boolean => {
  if (
    condition !== null &&
    typeof condition === "object" &&
    !(condition instanceof Date) &&
    !(condition instanceof Types.ObjectId) &&
    Object.keys(condition).some((key) => key.startsWith("$"))
  ) {
    return Object.entries(condition as Record<string, unknown>).every(([operator, expected]) => {
      const left = comparable(actual);
      switch (operator) {
        case "$in":
          return (expected as unknown[]).some((item) => comparable(item) === left);
        case "$ne":
          return left !== comparable(expected);
        case "$lt":
          return left !== undefined && (left as number) < (comparable(expected) as number);
        case "$lte":
          return left !== undefined && (left as number) <= (comparable(expected) as number);
        case "$gt":
          return left !== undefined && (left as number) > (comparable(expected) as number);
        case "$gte":
          return left !== undefined && (left as number) >= (comparable(expected) as number);
        default:
          throw new Error(`Unsupported operator ${operator}`);
      }
    });
  }
  if (Array.isArray(actual))
    return actual.some((item) => comparable(item) === comparable(condition));
  return comparable(actual) === comparable(condition);
};

const matches = (doc: Doc, filter: Filter): boolean =>
  Object.entries(filter).every(([key, condition]) => {
    if (key === "$or") return (condition as Filter[]).some((entry) => matches(doc, entry));
    return matchesCondition(getPath(doc, key), condition);
  });

const applyUpdate = (doc: Doc, update: Record<string, unknown>, isInsert: boolean) => {
  const operators = update as {
    $set?: Record<string, unknown>;
    $setOnInsert?: Record<string, unknown>;
    $inc?: Record<string, number>;
    $unset?: Record<string, unknown>;
    $push?: Record<string, { $each: unknown[]; $slice?: number }>;
  };
  for (const [key, value] of Object.entries(operators.$set ?? {})) setPath(doc, key, value);
  if (isInsert) {
    for (const [key, value] of Object.entries(operators.$setOnInsert ?? {}))
      setPath(doc, key, value);
  }
  for (const [key, value] of Object.entries(operators.$inc ?? {})) {
    setPath(doc, key, ((getPath(doc, key) as number | undefined) ?? 0) + value);
  }
  for (const key of Object.keys(operators.$unset ?? {})) unsetPath(doc, key);
  for (const [key, spec] of Object.entries(operators.$push ?? {})) {
    const current = (getPath(doc, key) as unknown[] | undefined) ?? [];
    const next = [...current, ...spec.$each];
    setPath(doc, key, spec.$slice && spec.$slice < 0 ? next.slice(spec.$slice) : next);
  }
  doc.updatedAt = new Date();
};

type QueryResult<T> = Promise<T> & {
  sort: (spec: Record<string, 1 | -1>) => QueryResult<T>;
  skip: (count: number) => QueryResult<T>;
  limit: (count: number) => QueryResult<T>;
  select: (spec?: unknown) => QueryResult<T>;
  lean: () => QueryResult<T>;
};

const clone = <T>(value: T): T => {
  if (value === null || typeof value !== "object") return value;
  if (value instanceof Date) return new Date(value.getTime()) as T;
  if (value instanceof Types.ObjectId) return new Types.ObjectId(value.toHexString()) as T;
  if (Array.isArray(value)) return value.map((item) => clone(item)) as T;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, clone(entry)]),
  ) as T;
};

export type MemoryModelOptions = {
  uniqueKeys?: string[];
  defaults?: () => Record<string, unknown>;
};

export type MemoryStore = {
  docs: Doc[];
  reset: () => void;
  failNextCreate: (error: Error) => void;
};

export const bindMemoryModel = (model: unknown, options: MemoryModelOptions = {}): MemoryStore => {
  const target = model as Record<string, unknown>;
  const docs: Doc[] = [];
  let createError: Error | null = null;

  const query = <T>(resolver: (state: QueryState) => T): QueryResult<T> => {
    const state: QueryState = { sort: null, skip: 0, limit: null };
    const promiseFactory = () => Promise.resolve().then(() => resolver(state));
    const builder = {
      sort: (spec: Record<string, 1 | -1>) => {
        state.sort = spec;
        return builder;
      },
      skip: (count: number) => {
        state.skip = count;
        return builder;
      },
      limit: (count: number) => {
        state.limit = count;
        return builder;
      },
      select: () => builder,
      lean: () => builder,
      then: (onFulfilled: never, onRejected: never) =>
        promiseFactory().then(onFulfilled, onRejected),
      catch: (onRejected: never) => promiseFactory().catch(onRejected),
    };
    return builder as unknown as QueryResult<T>;
  };

  type QueryState = {
    sort: Record<string, 1 | -1> | null;
    skip: number;
    limit: number | null;
  };

  const select = (filter: Filter, state?: QueryState): Doc[] => {
    let results = docs.filter((doc) => matches(doc, filter));
    if (state?.sort) {
      const [key, direction] = Object.entries(state.sort)[0] ?? [];
      if (key && direction) {
        results = [...results].sort((a, b) => {
          const left = comparable(getPath(a, key)) as number;
          const right = comparable(getPath(b, key)) as number;
          return left === right ? 0 : left < right ? -direction : direction;
        });
      }
    }
    if (state) {
      results = results.slice(
        state.skip,
        state.limit === null ? undefined : state.skip + state.limit,
      );
    }
    return results;
  };

  const assertUnique = (candidate: Doc, ignore?: Doc) => {
    for (const key of options.uniqueKeys ?? []) {
      const value = getPath(candidate, key);
      if (value === undefined) continue;
      const clash = docs.find((doc) => doc !== ignore && getPath(doc, key) === value);
      if (clash) throw Object.assign(new Error("E11000 duplicate key"), { code: 11000 });
    }
  };

  const build = (input: Record<string, unknown>): Doc => {
    const now = new Date();
    return {
      ...(options.defaults?.() ?? {}),
      ...clone(input),
      _id: (input._id as Types.ObjectId | undefined) ?? new Types.ObjectId(),
      createdAt: now,
      updatedAt: now,
    } as Doc;
  };

  const find = vi.fn((filter: Filter = {}) => query((state) => select(filter, state).map(clone)));
  const findOne = vi.fn((filter: Filter = {}) =>
    query((state) => {
      const first = select(filter, state)[0];
      return first ? clone(first) : null;
    }),
  );
  const findById = vi.fn((id: unknown) => findOne({ _id: id }));

  const create = vi.fn(async (input: Record<string, unknown>) => {
    if (createError) {
      const error = createError;
      createError = null;
      throw error;
    }
    const doc = build(input);
    assertUnique(doc);
    docs.push(doc);
    return clone(doc);
  });

  const updateOne = vi.fn(
    (filter: Filter, update: Record<string, unknown>, opts: { upsert?: boolean } = {}) =>
      query(() => {
        const existing = docs.find((doc) => matches(doc, filter));
        if (existing) {
          applyUpdate(existing, update, false);
          return { matchedCount: 1, modifiedCount: 1, upsertedCount: 0 };
        }
        if (opts.upsert) {
          const seed: Record<string, unknown> = {};
          for (const [key, value] of Object.entries(filter)) {
            if (
              !key.startsWith("$") &&
              (value === null || typeof value !== "object" || value instanceof Types.ObjectId)
            ) {
              seed[key] = value;
            }
          }
          const doc = build(seed);
          assertUnique(doc);
          applyUpdate(doc, update, true);
          docs.push(doc);
          return { matchedCount: 0, modifiedCount: 0, upsertedCount: 1 };
        }
        return { matchedCount: 0, modifiedCount: 0, upsertedCount: 0 };
      }),
  );

  const findOneAndUpdate = vi.fn(
    (
      filter: Filter,
      update: Record<string, unknown>,
      opts: { upsert?: boolean; new?: boolean } = {},
    ) =>
      query(() => {
        let existing = docs.find((doc) => matches(doc, filter));
        if (!existing && opts.upsert) {
          const seed: Record<string, unknown> = {};
          for (const [key, value] of Object.entries(filter)) {
            if (
              !key.startsWith("$") &&
              (value === null || typeof value !== "object" || value instanceof Types.ObjectId)
            ) {
              seed[key] = value;
            }
          }
          existing = build(seed);
          docs.push(existing);
          applyUpdate(existing, update, true);
          return clone(existing);
        }
        if (!existing) return null;
        const before = clone(existing);
        applyUpdate(existing, update, false);
        return opts.new ? clone(existing) : before;
      }),
  );

  const countDocuments = vi.fn((filter: Filter = {}) => query(() => select(filter).length));
  const deleteOne = vi.fn((filter: Filter) =>
    query(() => {
      const index = docs.findIndex((doc) => matches(doc, filter));
      if (index >= 0) docs.splice(index, 1);
      return { deletedCount: index >= 0 ? 1 : 0 };
    }),
  );

  Object.assign(target, {
    find,
    findOne,
    findById,
    create,
    updateOne,
    findOneAndUpdate,
    countDocuments,
    deleteOne,
  });

  return {
    docs,
    reset: () => {
      docs.length = 0;
      createError = null;
    },
    failNextCreate: (error: Error) => {
      createError = error;
    },
  };
};
