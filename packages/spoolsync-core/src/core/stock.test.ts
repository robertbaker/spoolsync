import { expect, test } from "bun:test";

import { isRunningLow } from "./stock";

const spool = (remainingWeight: number | null, initialWeight: number | null, archived = false) => ({
  remainingWeight,
  initialWeight,
  archived,
});

test("a spool at or under a fifth of its full weight is running low", () => {
  expect(isRunningLow(spool(200, 1000))).toBe(true);
  expect(isRunningLow(spool(201, 1000))).toBe(false);
  expect(isRunningLow(spool(0, 1000))).toBe(true);
  expect(isRunningLow(spool(120, 500))).toBe(false);
  expect(isRunningLow(spool(100, 500))).toBe(true);
});

test("without a full weight the fallback grams apply", () => {
  expect(isRunningLow(spool(100, null))).toBe(true);
  expect(isRunningLow(spool(101, null))).toBe(false);
  expect(isRunningLow(spool(50, 0))).toBe(true);
});

test("finished and unweighed spools are never reported as low", () => {
  expect(isRunningLow(spool(10, 1000, true))).toBe(false);
  expect(isRunningLow(spool(null, 1000))).toBe(false);
});
