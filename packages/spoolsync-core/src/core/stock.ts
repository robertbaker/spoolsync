import { SOURCE_IDS, type CommonSpool, type SourceId } from "./model";

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

export interface LowStockOverrides {
  brands: Record<string, number>;
  materials: Record<string, number>;
  spools: Record<string, number>;
}

/** Overrides are resolved from most specific to broadest: spool, material, brand, then default. */
export interface LowStockPolicy {
  defaultPercent: number;
  overrides: LowStockOverrides;
}

export type LowStockThreshold = LowStockRule | LowStockPolicy;

export const EMPTY_LOW_STOCK_OVERRIDES: LowStockOverrides = {
  brands: {},
  materials: {},
  spools: {},
};

export const DEFAULT_LOW_STOCK: LowStockRule = {
  fraction: LOW_STOCK_FRACTION,
  fallbackGrams: LOW_STOCK_FALLBACK_GRAMS,
};

export const DEFAULT_LOW_STOCK_POLICY: LowStockPolicy = {
  defaultPercent: Math.round(DEFAULT_LOW_STOCK.fraction * 100),
  overrides: EMPTY_LOW_STOCK_OVERRIDES,
};

const MAX_RULES_PER_SCOPE = 500;
const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/** Names match without case or repeated whitespace differences. */
export function lowStockNameKey(value: string | null | undefined): string | null {
  const key = value?.replace(/\s+/g, " ").trim().toLowerCase() ?? "";
  return key && !FORBIDDEN_KEYS.has(key) ? key : null;
}

/** A stable per-record key; source ids remain case-sensitive just as they are in the inventory. */
export function lowStockSpoolKey(spool: Pick<CommonSpool, "source" | "sourceId">): string {
  return `${spool.source}:${spool.sourceId}`;
}

/** Validates and bounds saved overrides before they reach inventory calculations. */
export function sanitizeLowStockOverrides(value: unknown): LowStockOverrides {
  const input = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const read = (scope: "brands" | "materials" | "spools"): Record<string, number> => {
    const entries = (input as Record<string, unknown>)[scope];
    if (!entries || typeof entries !== "object" || Array.isArray(entries)) return {};
    const result: Record<string, number> = {};
    for (const [rawKey, percent] of Object.entries(entries).slice(0, MAX_RULES_PER_SCOPE)) {
      const key = scope === "spools" ? rawKey : lowStockNameKey(rawKey);
      if (!key || key.length > 200 || !isLowStockPercent(percent)) continue;
      if (scope === "spools") {
        const separator = key.indexOf(":");
        if (
          separator <= 0 ||
          separator === key.length - 1 ||
          !SOURCE_IDS.includes(key.slice(0, separator) as SourceId)
        )
          continue;
      }
      result[key] = percent;
    }
    return result;
  };
  return { brands: read("brands"), materials: read("materials"), spools: read("spools") };
}

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

/** Resolve the applicable percentage for one source record. */
export function lowStockPercentFor(
  spool: Partial<Pick<CommonSpool, "source" | "sourceId" | "vendor" | "material">>,
  policy: LowStockPolicy,
): number {
  const name = lowStockNameKey(spool.vendor);
  const material = lowStockNameKey(spool.material);
  return (
    (spool.source !== undefined && spool.sourceId !== undefined
      ? policy.overrides.spools[lowStockSpoolKey(spool as Pick<CommonSpool, "source" | "sourceId">)]
      : undefined) ??
    (material ? policy.overrides.materials[material] : undefined) ??
    (name ? policy.overrides.brands[name] : undefined) ??
    policy.defaultPercent
  );
}

/** Resolve a rule while keeping the existing single-rule API used by the CLI. */
export function lowStockRuleFor(
  spool: Partial<Pick<CommonSpool, "source" | "sourceId" | "vendor" | "material">>,
  threshold: LowStockThreshold,
): LowStockRule {
  return "defaultPercent" in threshold
    ? lowStockRule(lowStockPercentFor(spool, threshold))
    : threshold;
}

/**
 * Whether a spool that is still in use is nearly used up. Archived spools are finished, and a spool
 * with no known remaining weight cannot be judged, so neither counts.
 */
export function isRunningLow(
  spool: Pick<CommonSpool, "remainingWeight" | "initialWeight" | "archived"> &
    Partial<Pick<CommonSpool, "source" | "sourceId" | "vendor" | "material">>,
  rule: LowStockThreshold = DEFAULT_LOW_STOCK,
): boolean {
  const resolved = "defaultPercent" in rule ? lowStockRuleFor(spool, rule) : rule;
  if (spool.archived || spool.remainingWeight === null) return false;
  if (spool.initialWeight !== null && spool.initialWeight > 0)
    return spool.remainingWeight / spool.initialWeight <= resolved.fraction;
  return spool.remainingWeight <= resolved.fallbackGrams;
}
