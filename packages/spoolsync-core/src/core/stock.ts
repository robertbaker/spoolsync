import type { CommonSpool } from "./model";

/** A spool at or below this share of its full weight is running low unless a rule says otherwise. */
export const LOW_STOCK_FRACTION = 0.2;
/** Without a full weight to compare against, this many grams or fewer counts as running low. */
export const LOW_STOCK_FALLBACK_GRAMS = 100;
/** The fallback is the same share of a typical 500 g spool, so it moves with the threshold. */
const TYPICAL_SPOOL_GRAMS = 500;

export const MIN_LOW_STOCK_PERCENT = 1;
export const MAX_LOW_STOCK_PERCENT = 90;

export interface LowStockRule {
  /** Share of the full weight, 0 to 1. */
  fraction: number;
  /** Grams used when a spool's full weight is unknown. */
  fallbackGrams: number;
}

export const DEFAULT_LOW_STOCK: LowStockRule = {
  fraction: LOW_STOCK_FRACTION,
  fallbackGrams: LOW_STOCK_FALLBACK_GRAMS,
};

/** Whether a value is a usable whole-number threshold percentage. */
export function isLowStockPercent(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= MIN_LOW_STOCK_PERCENT &&
    value <= MAX_LOW_STOCK_PERCENT
  );
}

/** The rule for a threshold given as a percentage of the full weight. */
export function lowStockRule(percent: number): LowStockRule {
  if (!isLowStockPercent(percent))
    throw new Error(
      `The low-stock threshold must be a whole number from ${MIN_LOW_STOCK_PERCENT} to ${MAX_LOW_STOCK_PERCENT} percent.`,
    );
  const fraction = percent / 100;
  return { fraction, fallbackGrams: Math.round(fraction * TYPICAL_SPOOL_GRAMS) };
}

/**
 * Whether a spool that is still in use is nearly used up. Archived spools are finished, and a spool
 * with no known remaining weight cannot be judged, so neither counts.
 */
export function isRunningLow(
  spool: Pick<CommonSpool, "remainingWeight" | "initialWeight" | "archived">,
  rule: LowStockRule = DEFAULT_LOW_STOCK,
): boolean {
  if (spool.archived || spool.remainingWeight === null) return false;
  if (spool.initialWeight !== null && spool.initialWeight > 0)
    return spool.remainingWeight / spool.initialWeight <= rule.fraction;
  return spool.remainingWeight <= rule.fallbackGrams;
}
