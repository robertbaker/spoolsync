import type { StockHistory, StockPoint } from "./browser/storage/stock-history";

/**
 * The total across services at each moment any service was loaded: every service contributes its
 * most recent point at or before that moment, and none before its first. A spool listed in several
 * services counts in each, as in the by-service chart.
 */
export function combinedTrend(history: StockHistory): StockPoint[] {
  const series = Object.values(history).filter(
    (points): points is StockPoint[] => Array.isArray(points) && points.length > 0,
  );
  const moments = [...new Set(series.flatMap((points) => points.map((point) => point.at)))].sort(
    (a, b) => Date.parse(a) - Date.parse(b),
  );
  return moments.map((at) => {
    const time = Date.parse(at);
    let totalGrams = 0;
    let spoolCount = 0;
    for (const points of series) {
      const latest = points.findLast((point) => Date.parse(point.at) <= time);
      if (latest) {
        totalGrams += latest.totalGrams;
        spoolCount += latest.spoolCount;
      }
    }
    return { at, totalGrams, spoolCount };
  });
}

/** Change between the first and last point, in grams, or `null` with fewer than two points. */
export function trendChange(points: readonly StockPoint[]): number | null {
  if (points.length < 2) return null;
  return points.at(-1)!.totalGrams - points[0]!.totalGrams;
}
