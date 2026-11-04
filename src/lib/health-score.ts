import { HEALTH_ISSUES, type HealthIssue } from "@spoolsync/core/workflow";

/**
 * The data health score: one number from 0 to 100 that says how much of the loaded inventory is
 * complete and plausible. It combines the existing health checks, duplicate detection, the data
 * cleanup proposals, and missing prices. Pure functions only; the Load page supplies the counts.
 */

/** What can lower the score: every health check plus three more signals. */
export type HealthFactorId = HealthIssue | "missing-price" | "duplicates" | "cleanup";

export const HEALTH_FACTOR_IDS: readonly HealthFactorId[] = [
  ...HEALTH_ISSUES,
  "missing-price",
  "duplicates",
  "cleanup",
];

/**
 * Points each factor can cost when every spool has the problem. They add up to 100, so a
 * completely broken inventory scores 0. Impossible values weigh most because they make every
 * total and chart wrong; a missing location weighs least because many people never track one.
 */
export const HEALTH_WEIGHTS: Record<HealthFactorId, number> = {
  "negative-weight": 10,
  "invalid-number": 10,
  "over-initial": 10,
  "missing-weight": 15,
  "missing-color": 8,
  "missing-vendor": 8,
  "missing-material": 8,
  "missing-location": 4,
  "missing-price": 7,
  duplicates: 10,
  cleanup: 10,
};

export type HealthGrade = "excellent" | "good" | "fair" | "poor";

export interface HealthInputs {
  /** Spools checked. */
  spools: number;
  /** Spools with each health issue. */
  counts: Record<HealthIssue, number>;
  /** Spools without a usable price. */
  missingPrice: number;
  /** Spools that are part of a possible duplicate group. */
  duplicateSpools: number;
  /** Spools with at least one cleanup proposal that can be applied. */
  cleanupSpools: number;
}

export interface HealthFactor {
  id: HealthFactorId;
  /** Spools affected. */
  count: number;
  /** Points this factor costs now (fractional). */
  penalty: number;
  /** Whole points shown to the person: at least 1 for any factor that costs something. */
  points: number;
}

export interface HealthScore {
  /** 0 to 100, or `null` when nothing is loaded. */
  score: number | null;
  grade: HealthGrade | null;
  spools: number;
  /** Factors with at least one affected spool, biggest penalty first. */
  factors: HealthFactor[];
}

export function gradeFor(score: number): HealthGrade {
  if (score >= 90) return "excellent";
  if (score >= 75) return "good";
  if (score >= 50) return "fair";
  return "poor";
}

const countOf = (inputs: HealthInputs, id: HealthFactorId): number => {
  const raw =
    id === "missing-price"
      ? inputs.missingPrice
      : id === "duplicates"
        ? inputs.duplicateSpools
        : id === "cleanup"
          ? inputs.cleanupSpools
          : inputs.counts[id];
  return Number.isFinite(raw) && raw > 0 ? raw : 0;
};

/**
 * Scores an inventory. A factor costs its weight times the share of spools it affects, so the score
 * means the same for 20 spools and 2,000. It never reads 100 while any spool still needs a look.
 */
export function computeHealthScore(inputs: HealthInputs): HealthScore {
  if (!(inputs.spools > 0)) return { score: null, grade: null, spools: 0, factors: [] };
  const factors: HealthFactor[] = [];
  let lost = 0;
  for (const id of HEALTH_FACTOR_IDS) {
    const count = Math.min(countOf(inputs, id), inputs.spools);
    if (!count) continue;
    const penalty = (HEALTH_WEIGHTS[id] * count) / inputs.spools;
    lost += penalty;
    factors.push({ id, count, penalty, points: Math.max(1, Math.round(penalty)) });
  }
  factors.sort(
    (a, b) =>
      b.penalty - a.penalty || HEALTH_FACTOR_IDS.indexOf(a.id) - HEALTH_FACTOR_IDS.indexOf(b.id),
  );
  let score = Math.round(100 - lost);
  if (factors.length) score = Math.min(score, 99);
  score = Math.max(0, score);
  return { score, grade: gradeFor(score), spools: inputs.spools, factors };
}

const usablePrice = (price: number | null): boolean =>
  price !== null && Number.isFinite(price) && price >= 0;

/** Spools with no price (or a negative one), which the cost views cannot use. A price of 0 counts. */
export function countMissingPrice(spools: ReadonlyArray<{ price: number | null }>): number {
  return spools.reduce((total, spool) => total + (usablePrice(spool.price) ? 0 : 1), 0);
}

/** Keys of the spools with no usable price, for the table filter. */
export function missingPriceKeys<T extends { price: number | null }>(
  spools: readonly T[],
  keyOf: (spool: T) => string,
): Set<string> {
  return new Set(spools.filter((spool) => !usablePrice(spool.price)).map(keyOf));
}

/** How many distinct spools have a cleanup proposal the person could accept. */
export function countCleanupSpools(
  proposals: ReadonlyArray<{ spoolKey: string; applicable: boolean }>,
): number {
  return new Set(proposals.filter((proposal) => proposal.applicable).map((p) => p.spoolKey)).size;
}
