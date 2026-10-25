import { expect, test } from "bun:test";

import { toDate, toNonNegativeNumber } from "./normalize";

test("non-negative quantities preserve zero and reject invalid or negative values", () => {
  expect(toNonNegativeNumber(0)).toBe(0);
  expect(toNonNegativeNumber("0")).toBe(0);
  expect(toNonNegativeNumber("125.5")).toBe(125.5);
  for (const value of [-1, "-1", "", " ", null, undefined, NaN, Infinity])
    expect(toNonNegativeNumber(value)).toBeNull();
});

test("a valid date prefix cannot hide a malformed timestamp", () => {
  for (const date of [
    "2026-01-01garbage",
    "2026-01-011",
    "2026-01-01T99:00:00Z",
    "2026-01-01T12:00:00+99:99",
  ])
    expect(toDate(date)).toBeNull();
  expect(toDate("2026-01-01 12:34:56")).toBe("2026-01-01");
  expect(toDate("2026-01-01T12:34:56.123456Z")).toBe("2026-01-01");
});

test("rejects impossible ISO calendar dates instead of passing them to exports", () => {
  for (const date of [
    "2025-02-29",
    "2024-02-30",
    "2026-04-31",
    "1900-02-29",
    "2026-00-12",
    "2026-13-12",
    "2026-01-00",
    "2026-01-32",
  ])
    expect(toDate(date)).toBeNull();
});

test("preserves valid dates and the calendar day of ISO timestamps", () => {
  for (const date of ["2000-02-29", "2024-02-29", "2026-01-31", "2026-04-30"])
    expect(toDate(date)).toBe(date);
  expect(toDate("2026-10-26T23:59:59-07:00")).toBe("2026-10-26");
  expect(toDate("2025-02-31T12:00:00Z")).toBeNull();
  expect(toDate("invalid")).toBeNull();
  expect(toDate(123)).toBeNull();
  expect(toDate(" ")).toBeNull();
});
