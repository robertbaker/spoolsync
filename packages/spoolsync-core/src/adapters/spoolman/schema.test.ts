import { expect, test } from "bun:test";

import { spoolmanToCommon } from "./map";
import { encodeExtras, readExtra, SPOOLMAN_MAX_COMMENT, truncateComment } from "./schema";

test("comment truncation counts Unicode characters without splitting surrogate pairs", () => {
  const withinLimit = "🧵".repeat(600);
  expect(truncateComment(withinLimit)).toBe(withinLimit);
  const truncated = truncateComment("🧵".repeat(SPOOLMAN_MAX_COMMENT + 1))!;
  expect(Array.from(truncated)).toHaveLength(SPOOLMAN_MAX_COMMENT);
  expect(truncated).toBe("🧵".repeat(SPOOLMAN_MAX_COMMENT - 1) + "…");
  expect(truncateComment("x".repeat(SPOOLMAN_MAX_COMMENT + 1))).toBe(
    "x".repeat(SPOOLMAN_MAX_COMMENT - 1) + "…",
  );
  expect(truncateComment(null)).toBeNull();
});

test("text extras distinguish missing values from literal text", () => {
  for (const value of [
    "null",
    "false",
    "{}",
    "[]",
    '""',
    '"   "',
    " ",
    "1e999",
    "9007199254740993",
    "1.5",
  ])
    expect(readExtra({ id: value }, "id")).toBeUndefined();
  expect(readExtra({ id: '"null"' }, "id")).toBe("null");
  expect(readExtra({ id: '"  abc  "' }, "id")).toBe("abc");
  expect(readExtra({ id: "raw-id" }, "id")).toBe("raw-id");
  expect(readExtra({ id: "42" }, "id")).toBe("42");
  expect(readExtra({ id: '"9007199254740993"' }, "id")).toBe("9007199254740993");
  expect(readExtra({}, "toString")).toBeUndefined();
  expect(readExtra(encodeExtras({ id: " abc " }), "id")).toBe("abc");
});

test("blank or non-text extras do not suppress a valid Spoolstock lot-number link", () => {
  for (const value of ["null", '""', "false", "{}"]) {
    const spool = spoolmanToCommon({
      id: 1,
      filament: { id: 1 },
      lot_nr: "spoolstock:spool:actual-id",
      extra: { spoolstock_short_id: value },
    });
    expect(spool.crossIds.spoolstockShortId).toBe("actual-id");
  }
});
