export type HistogramRow = {
  value: number;
  count: number;
  sum: number;
  min: number;
  max: number;
};

export type LatencySummary = {
  samples: number;
  avg: number | null;
  min: number | null;
  max: number | null;
  p50: number | null;
  p95: number | null;
  p99: number | null;
};

export const emptyLatency: LatencySummary = {
  samples: 0,
  avg: null,
  min: null,
  max: null,
  p50: null,
  p95: null,
  p99: null,
};

export const quantizeDuration = (durationMs: number): number => {
  const whole = Math.floor(durationMs);
  return whole < 1000 ? whole : whole - (whole % 10);
};

export const mergeHistogramRows = (rows: HistogramRow[]): HistogramRow[] => {
  const merged = new Map<number, HistogramRow>();
  for (const row of rows) {
    const existing = merged.get(row.value);
    if (existing) {
      existing.count += row.count;
      existing.sum += row.sum;
      existing.min = Math.min(existing.min, row.min);
      existing.max = Math.max(existing.max, row.max);
    } else {
      merged.set(row.value, { ...row });
    }
  }
  return [...merged.values()].sort((a, b) => a.value - b.value);
};

export const nearestRankPercentile = (
  sortedRows: HistogramRow[],
  percentile: number,
): number | null => {
  const total = sortedRows.reduce((sum, row) => sum + row.count, 0);
  if (total === 0) return null;
  const rank = Math.max(1, Math.ceil((percentile / 100) * total));
  let cumulative = 0;
  for (const row of sortedRows) {
    cumulative += row.count;
    if (cumulative >= rank) return row.value;
  }
  return sortedRows[sortedRows.length - 1]?.value ?? null;
};

const round = (value: number): number => Math.round(value * 10) / 10;

export const summarizeHistogram = (rows: HistogramRow[]): LatencySummary => {
  const merged = mergeHistogramRows(rows);
  const samples = merged.reduce((sum, row) => sum + row.count, 0);
  if (samples === 0) return { ...emptyLatency };
  const sum = merged.reduce((total, row) => total + row.sum, 0);
  return {
    samples,
    avg: round(sum / samples),
    min: Math.min(...merged.map((row) => row.min)),
    max: Math.max(...merged.map((row) => row.max)),
    p50: nearestRankPercentile(merged, 50),
    p95: nearestRankPercentile(merged, 95),
    p99: nearestRankPercentile(merged, 99),
  };
};

export type DistributionBin = { fromMs: number; toMs: number; count: number };

export const buildDistribution = (rows: HistogramRow[], binCount = 20): DistributionBin[] => {
  const merged = mergeHistogramRows(rows);
  if (merged.length === 0) return [];
  const low = merged[0]?.value ?? 0;
  const high = merged[merged.length - 1]?.value ?? 0;
  const width = Math.max(1, Math.ceil((high - low + 1) / binCount));
  const bins = new Map<number, number>();
  for (const row of merged) {
    const index = Math.floor((row.value - low) / width);
    bins.set(index, (bins.get(index) ?? 0) + row.count);
  }
  const lastIndex = Math.floor((high - low) / width);
  const result: DistributionBin[] = [];
  for (let index = 0; index <= lastIndex; index += 1) {
    result.push({
      fromMs: low + index * width,
      toMs: low + (index + 1) * width,
      count: bins.get(index) ?? 0,
    });
  }
  return result;
};

export const percent = (numerator: number, denominator: number): number | null =>
  denominator > 0 ? Math.round((numerator / denominator) * 10_000) / 100 : null;
