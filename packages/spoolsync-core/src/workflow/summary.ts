import type { LoadResult, SourceId } from "../core/model";
import { DEFAULT_LOW_STOCK, isRunningLow, type LowStockRule } from "../core/stock";

export interface InventorySummary {
  source: SourceId;
  spools: number;
  archived: number;
  brands: number;
  materials: number;
  /** Sum of known remaining weights, in grams. */
  remainingGrams: number;
  /** Spools whose remaining weight is not known, so the total above leaves them out. */
  unknownWeights: number;
  /** Spools still in use that are at or under a fifth of their full weight. */
  runningLow: number;
  warnings: number;
}

/** Headline numbers for one loaded inventory, for dry-run output and quick checks. */
export function summarizeInventory(
  result: LoadResult,
  rule: LowStockRule = DEFAULT_LOW_STOCK,
): InventorySummary {
  const brands = new Set<string>();
  const materials = new Set<string>();
  let remainingGrams = 0;
  let unknownWeights = 0;
  let archived = 0;
  let runningLow = 0;
  for (const spool of result.spools) {
    if (spool.vendor) brands.add(spool.vendor.toLowerCase());
    if (spool.material) materials.add(spool.material.toLowerCase());
    if (spool.archived) archived++;
    if (isRunningLow(spool, rule)) runningLow++;
    if (spool.remainingWeight === null) unknownWeights++;
    else remainingGrams += spool.remainingWeight;
  }
  return {
    source: result.source,
    spools: result.spools.length,
    archived,
    brands: brands.size,
    materials: materials.size,
    remainingGrams: Math.round(remainingGrams),
    unknownWeights,
    runningLow,
    warnings: result.warnings.length,
  };
}
