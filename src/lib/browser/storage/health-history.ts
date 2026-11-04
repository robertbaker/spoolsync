import { local, read, write } from "./access";

const KEY = "spoolsync:health-history";
/** Points kept; the oldest are dropped first, so the stored size stays bounded. */
export const MAX_HEALTH_POINTS = 60;
/** An unchanged score is not recorded again until this long has passed. */
const UNCHANGED_INTERVAL_MS = 6 * 60 * 60 * 1000;

/** The data health score at one moment. Numbers only: never names or other spool details. */
export interface HealthPoint {
  /** ISO timestamp of the load. */
  at: string;
  /** 0 to 100. */
  score: number;
  spools: number;
}

function sanitizePoints(raw: unknown): HealthPoint[] {
  if (!Array.isArray(raw)) return [];
  const points: HealthPoint[] = [];
  for (const item of raw) {
    const point = item as Partial<HealthPoint> | null;
    if (
      point &&
      typeof point === "object" &&
      typeof point.at === "string" &&
      !Number.isNaN(Date.parse(point.at)) &&
      typeof point.score === "number" &&
      Number.isFinite(point.score) &&
      point.score >= 0 &&
      point.score <= 100 &&
      typeof point.spools === "number" &&
      Number.isFinite(point.spools) &&
      point.spools >= 0 &&
      point.spools <= 1e9
    )
      points.push({
        at: new Date(point.at).toISOString(),
        score: Math.round(point.score),
        spools: Math.round(point.spools),
      });
  }
  points.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  return points.slice(-MAX_HEALTH_POINTS);
}

/** Keeps only well-formed, time-ordered, size-capped points. */
export function sanitizeHealthHistory(raw: unknown): HealthPoint[] {
  return sanitizePoints(raw);
}

/** The history with a point added, or the same array when nothing changed lately. */
export function appendHealthPoint(history: HealthPoint[], point: HealthPoint): HealthPoint[] {
  const [clean] = sanitizePoints([point]);
  if (!clean) return history;
  const last = history.at(-1);
  if (
    last &&
    last.score === clean.score &&
    last.spools === clean.spools &&
    Date.parse(clean.at) - Date.parse(last.at) < UNCHANGED_INTERVAL_MS
  )
    return history;
  return sanitizePoints([...history, clean]);
}

export interface HealthTrend {
  first: HealthPoint;
  last: HealthPoint;
  /** Last score minus first score. */
  delta: number;
  count: number;
}

/** First-to-last change across the stored points, or `null` when there are fewer than two. */
export function healthTrend(history: readonly HealthPoint[]): HealthTrend | null {
  const first = history[0];
  const last = history.at(-1);
  if (!first || !last || history.length < 2) return null;
  return { first, last, delta: last.score - first.score, count: history.length };
}

export function readHealthHistory(): HealthPoint[] {
  try {
    return sanitizeHealthHistory(JSON.parse(read(local, KEY) ?? "[]"));
  } catch {
    return [];
  }
}

/** Saves a point (when it adds information) and returns the history as stored. */
export function recordHealthPoint(point: HealthPoint): HealthPoint[] {
  const history = readHealthHistory();
  const next = appendHealthPoint(history, point);
  if (next !== history) write(local, KEY, JSON.stringify(next));
  return next;
}

export function clearHealthHistory(): void {
  write(local, KEY, null);
}
