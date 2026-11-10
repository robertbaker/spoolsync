import { expect, test } from "bun:test";

import { toDate, toNonNegativeNumber, toNumber } from "./normalize";

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

test("free-text dates give the written day in any host time zone", () => {
  const original = process.env.TZ;
  try {
    for (const zone of ["UTC", "Pacific/Kiritimati", "Pacific/Pago_Pago", "America/New_York"]) {
      process.env.TZ = zone;
      expect(toDate("March 5, 2024")).toBe("2024-03-05");
      expect(toDate("5 Mar 2024 00:30")).toBe("2024-03-05");
      expect(toDate("Mar 5 2024 23:30")).toBe("2024-03-05");
      expect(toDate("Tue, 05 Mar 2024 23:30:00 GMT")).toBe("2024-03-05");
      expect(toDate("5 Mar 2024 23:30 -0500")).toBe("2024-03-06");
    }
  } finally {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  }
});

test("toNumber reads decimal commas and thousands separators only when unambiguous", () => {
  const cases: [unknown, number | null][] = [
    ["12,99", 12.99],
    ["1,5", 1.5],
    ["0,5", 0.5],
    [" 12,99 ", 12.99],
    ["-1,5", -1.5],
    ["1,500", 1500],
    ["1,234,567", 1234567],
    ["1.234,56", 1234.56],
    ["1.234.567,5", 1234567.5],
    ["1,234.56", 1234.56],
    ["-1,234.56", -1234.56],
    ["1.5", 1.5],
    ["215", 215],
    [12.5, 12.5],
    ["0,500", null],
    ["1,5000", null],
    ["1,23,456", null],
    ["1,234,56", null],
    ["1,2,3", null],
    ["1,", null],
    [",5", null],
    ["1.234,567", null],
    ["12.345,6,7", null],
    ["1,5.5", null],
    ["1.5,5", null],
    ["--1,5", null],
    ["$12,99", null],
    ["12,99 EUR", null],
    ["", null],
    ["abc", null],
    [null, null],
    [Number.NaN, null],
  ];
  for (const [input, expected] of cases) expect(toNumber(input)).toBe(expected);
});
