import type { CommonSpool } from "./model";

/** A spool at or below this share of its full weight is running low. */
export const LOW_STOCK_FRACTION = 0.2;
/** Without a full weight to compare against, this many grams or fewer counts as running low. */
export const LOW_STOCK_FALLBACK_GRAMS = 100;

/**
 * Whether a spool that is still in use is nearly used up. Archived spools are finished, and a spool
 * with no known remaining weight cannot be judged, so neither counts.
 */
export function isRunningLow(
  spool: Pick<CommonSpool, "remainingWeight" | "initialWeight" | "archived">,
): boolean {
  if (spool.archived || spool.remainingWeight === null) return false;
  if (spool.initialWeight !== null && spool.initialWeight > 0)
    return spool.remainingWeight / spool.initialWeight <= LOW_STOCK_FRACTION;
  return spool.remainingWeight <= LOW_STOCK_FALLBACK_GRAMS;
}
