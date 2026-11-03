import { SOURCE_IDS, type SourceId } from "@spoolsync/core/core/model";

import { local, read, write } from "./access";

const KEY = "spoolsync:stock-history";
/** Points kept per service; the oldest are dropped first, so the stored size stays bounded. */
export const MAX_HISTORY_POINTS = 120;
/** An unchanged total is not recorded again until this long has passed. */
const UNCHANGED_INTERVAL_MS = 6 * 60 * 60 * 1000;

/** What was loaded at one moment. Totals only: never names, ids, or other spool details. */
export interface StockPoint {
  /** ISO timestamp of the load. */
  at: string;
  /** Sum of known remaining weights, in grams. */
  totalGrams: number;
  spoolCount: number;
}

export type StockHistory = Partial<Record<SourceId, StockPoint[]>>;

const isCount = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1e9;

function sanitizePoints(raw: unknown): StockPoint[] {
  if (!Array.isArray(raw)) return [];
  const points: StockPoint[] = [];
  for (const item of raw) {
    const point = item as Partial<StockPoint> | null;
    if (
      point &&
      typeof point === "object" &&
      typeof point.at === "string" &&
      !Number.isNaN(Date.parse(point.at)) &&
      isCount(point.totalGrams) &&
      isCount(point.spoolCount)
    )
      points.push({
        at: new Date(point.at).toISOString(),
        totalGrams: Math.round(point.totalGrams),
        spoolCount: Math.round(point.spoolCount),
      });
  }
  points.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  return points.slice(-MAX_HISTORY_POINTS);
}

/** Keeps only well-formed, time-ordered, size-capped points for known services. */
export function sanitizeStockHistory(raw: unknown): StockHistory {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const result: StockHistory = {};
  for (const source of SOURCE_IDS) {
    const points = sanitizePoints((raw as Record<string, unknown>)[source]);
    if (points.length) result[source] = points;
  }
  return result;
}

/** The history with a point added, or the same object when nothing changed lately. */
export function appendStockPoint(
  history: StockHistory,
  source: SourceId,
  point: StockPoint,
): StockHistory {
  const [clean] = sanitizePoints([point]);
  if (!clean) return history;
  const points = history[source] ?? [];
  const last = points.at(-1);
  if (
    last &&
    last.totalGrams === clean.totalGrams &&
    last.spoolCount === clean.spoolCount &&
    Date.parse(clean.at) - Date.parse(last.at) < UNCHANGED_INTERVAL_MS
  )
    return history;
  return { ...history, [source]: sanitizePoints([...points, clean]) };
}

export function readStockHistory(): StockHistory {
  try {
    return sanitizeStockHistory(JSON.parse(read(local, KEY) ?? "{}"));
  } catch {
    return {};
  }
}

export function recordStockPoint(source: SourceId, point: StockPoint): void {
  const history = readStockHistory();
  const next = appendStockPoint(history, source, point);
  if (next !== history) write(local, KEY, JSON.stringify(next));
}

export function clearStockHistory(): void {
  write(local, KEY, null);
}
