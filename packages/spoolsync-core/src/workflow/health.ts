import type { CommonSpool, LoadResult } from "../core/model";
import { spoolKey } from "./spool-key";

/** What can be wrong with a spool record. Order is the order the Load page lists them in. */
export const HEALTH_ISSUES = [
  "missing-weight",
  "missing-color",
  "missing-vendor",
  "missing-material",
  "missing-location",
  "negative-weight",
  "invalid-number",
  "over-initial",
] as const;
export type HealthIssue = (typeof HEALTH_ISSUES)[number];

export const HEALTH_LABELS: Record<HealthIssue, string> = {
  "missing-weight": "No remaining weight",
  "missing-color": "No color",
  "missing-vendor": "No brand",
  "missing-material": "No material",
  "missing-location": "No location",
  "negative-weight": "Negative weight",
  "invalid-number": "Weight is not a number",
  "over-initial": "Remaining exceeds full weight",
};

export interface HealthReport {
  /** Spools checked. */
  spools: number;
  /** Number of spools with each issue (a spool counts once per issue). */
  counts: Record<HealthIssue, number>;
  /** Issues per spool key (`source:id`); spools without issues are absent. */
  byKey: Map<string, HealthIssue[]>;
  /** Spools with at least one issue. */
  affected: number;
}

const blank = (value: string | null): boolean => !value || !value.trim();

/** The problems with one spool, in `HEALTH_ISSUES` order. */
export function spoolIssues(spool: CommonSpool): HealthIssue[] {
  const issues: HealthIssue[] = [];
  if (spool.remainingWeight === null) issues.push("missing-weight");
  if (!spool.colors.length) issues.push("missing-color");
  if (blank(spool.vendor)) issues.push("missing-vendor");
  if (blank(spool.material)) issues.push("missing-material");
  if (blank(spool.location)) issues.push("missing-location");

  const rw = spool.remainingWeight;
  const iw = spool.initialWeight;
  const ew = spool.emptySpoolWeight;

  if (
    (rw !== null && Number.isFinite(rw) && rw < 0) ||
    (iw !== null && Number.isFinite(iw) && iw < 0) ||
    (ew !== null && Number.isFinite(ew) && ew < 0)
  )
    issues.push("negative-weight");

  if (
    (rw !== null && !Number.isFinite(rw)) ||
    (iw !== null && !Number.isFinite(iw)) ||
    (ew !== null && !Number.isFinite(ew))
  )
    issues.push("invalid-number");

  if (rw !== null && iw !== null && Number.isFinite(rw) && Number.isFinite(iw) && rw > iw)
    issues.push("over-initial");

  return issues;
}

/** Checks every loaded spool for missing fields and impossible values. Nothing is changed. */
export function checkInventoryHealth(results: readonly LoadResult[]): HealthReport {
  const counts = Object.fromEntries(HEALTH_ISSUES.map((issue) => [issue, 0])) as Record<
    HealthIssue,
    number
  >;
  const byKey = new Map<string, HealthIssue[]>();
  let spools = 0;
  for (const result of results)
    for (const spool of result.spools) {
      spools += 1;
      const issues = spoolIssues(spool);
      if (!issues.length) continue;
      byKey.set(spoolKey(spool), issues);
      for (const issue of issues) counts[issue] += 1;
    }
  return { spools, counts, byKey, affected: byKey.size };
}
