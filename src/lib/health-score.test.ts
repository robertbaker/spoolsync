import { expect, test } from "bun:test";

import { HEALTH_ISSUES, type HealthIssue } from "@spoolsync/core/workflow";

import {
  HEALTH_FACTOR_IDS,
  HEALTH_WEIGHTS,
  computeHealthScore,
  countCleanupSpools,
  countMissingPrice,
  gradeFor,
  missingPriceKeys,
  type HealthInputs,
} from "./health-score";

const counts = (overrides: Partial<Record<HealthIssue, number>> = {}) =>
  Object.fromEntries(HEALTH_ISSUES.map((issue) => [issue, overrides[issue] ?? 0])) as Record<
    HealthIssue,
    number
  >;

const inputs = (overrides: Partial<HealthInputs> = {}): HealthInputs => ({
  spools: 10,
  counts: counts(),
  missingPrice: 0,
  duplicateSpools: 0,
  cleanupSpools: 0,
  ...overrides,
});

test("weights add up to 100 and cover every factor", () => {
  const total = HEALTH_FACTOR_IDS.reduce((sum, id) => sum + HEALTH_WEIGHTS[id], 0);
  expect(total).toBe(100);
  expect(Object.keys(HEALTH_WEIGHTS).sort()).toEqual([...HEALTH_FACTOR_IDS].sort());
});

test("nothing loaded has no score", () => {
  expect(computeHealthScore(inputs({ spools: 0 }))).toEqual({
    score: null,
    grade: null,
    spools: 0,
    factors: [],
  });
});

test("a clean inventory scores 100 with nothing to do", () => {
  const result = computeHealthScore(inputs());
  expect(result.score).toBe(100);
  expect(result.grade).toBe("excellent");
  expect(result.factors).toEqual([]);
});

test("a factor costs its weight times the share of spools it affects", () => {
  // Half the spools lack a weight: 15 * 0.5 = 7.5 points.
  const result = computeHealthScore(inputs({ counts: counts({ "missing-weight": 5 }) }));
  expect(result.score).toBe(93);
  expect(result.factors).toHaveLength(1);
  expect(result.factors[0]!.penalty).toBeCloseTo(7.5);
  expect(result.factors[0]!.points).toBe(8);
});

test("the score means the same for small and large inventories", () => {
  const small = computeHealthScore(inputs({ spools: 10, counts: counts({ "missing-color": 2 }) }));
  const large = computeHealthScore(
    inputs({ spools: 5000, counts: counts({ "missing-color": 1000 }) }),
  );
  expect(small.score).toBe(large.score);
});

test("every spool broken in every way scores 0", () => {
  const all = Object.fromEntries(HEALTH_ISSUES.map((issue) => [issue, 4])) as Record<
    HealthIssue,
    number
  >;
  const result = computeHealthScore({
    spools: 4,
    counts: all,
    missingPrice: 4,
    duplicateSpools: 4,
    cleanupSpools: 4,
  });
  expect(result.score).toBe(0);
  expect(result.grade).toBe("poor");
});

test("counts above the spool total are capped and bad numbers are ignored", () => {
  const result = computeHealthScore(
    inputs({
      spools: 2,
      missingPrice: 50,
      duplicateSpools: Number.NaN,
      cleanupSpools: -3,
    }),
  );
  expect(result.factors.map((factor) => factor.id)).toEqual(["missing-price"]);
  expect(result.factors[0]!.count).toBe(2);
  expect(result.factors[0]!.penalty).toBe(HEALTH_WEIGHTS["missing-price"]);
});

test("it never reads 100 while a single spool still needs a look", () => {
  const result = computeHealthScore(
    inputs({ spools: 20000, counts: counts({ "missing-location": 1 }) }),
  );
  expect(result.score).toBe(99);
  expect(result.factors[0]!.points).toBe(1);
});

test("the to-do list is ranked by penalty, then in the fixed factor order", () => {
  const result = computeHealthScore(
    inputs({
      counts: counts({ "missing-weight": 2, "missing-color": 5, "negative-weight": 1 }),
      duplicateSpools: 2,
    }),
  );
  // missing-color 4, missing-weight 3, duplicates 2, negative-weight 1.
  expect(result.factors.map((factor) => factor.id)).toEqual([
    "missing-color",
    "missing-weight",
    "duplicates",
    "negative-weight",
  ]);
  // Equal penalties keep the same order every time.
  const tie = computeHealthScore(
    inputs({ counts: counts({ "missing-vendor": 5, "missing-material": 5 }) }),
  );
  expect(tie.factors.map((factor) => factor.id)).toEqual(["missing-vendor", "missing-material"]);
});

test("grades change at 90, 75 and 50", () => {
  expect([100, 90, 89, 75, 74, 50, 49, 0].map(gradeFor)).toEqual([
    "excellent",
    "excellent",
    "good",
    "good",
    "fair",
    "fair",
    "poor",
    "poor",
  ]);
});

test("missing prices ignore zero (free) and count null, negative and non-finite", () => {
  const spools = [
    { price: 20 },
    { price: 0 },
    { price: null },
    { price: -1 },
    { price: Number.NaN },
  ];
  expect(countMissingPrice(spools)).toBe(3);
  const keys = missingPriceKeys(
    spools.map((spool, index) => ({ ...spool, id: String(index) })),
    (spool) => spool.id,
  );
  expect([...keys]).toEqual(["2", "3", "4"]);
});

test("cleanup counts each spool once and skips proposals that cannot be applied", () => {
  expect(
    countCleanupSpools([
      { spoolKey: "a:1", applicable: true },
      { spoolKey: "a:1", applicable: true },
      { spoolKey: "a:2", applicable: false },
      { spoolKey: "b:3", applicable: true },
    ]),
  ).toBe(2);
});
