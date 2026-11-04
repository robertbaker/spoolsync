import { expect, test } from "bun:test";

import { WINDOW_STEP, nextLimit, windowSections } from "./table-window";

const rows = (prefix: string, count: number) =>
  Array.from({ length: count }, (_, index) => `${prefix}${index}`);

test("everything is shown when it fits in the window", () => {
  const result = windowSections([{ label: "", spools: rows("a", 5) }], WINDOW_STEP);
  expect(result.shown).toBe(5);
  expect(result.total).toBe(5);
  expect(result.sections).toHaveLength(1);
  expect(result.sections[0]!.total).toBe(5);
});

test("a large list is cut at the limit and keeps the true total", () => {
  const result = windowSections([{ label: "", spools: rows("a", 5000) }], 200);
  expect(result.shown).toBe(200);
  expect(result.total).toBe(5000);
  expect(result.sections[0]!.spools).toHaveLength(200);
  expect(result.sections[0]!.spools[199]).toBe("a199");
});

test("the limit runs across sections in order and drops sections left empty", () => {
  const sections = [
    { label: "A", spools: rows("a", 3) },
    { label: "B", spools: rows("b", 3) },
    { label: "C", spools: rows("c", 3) },
  ];
  const result = windowSections(sections, 4);
  expect(result.sections.map((section) => [section.label, section.spools.length, section.total])).toEqual([
    ["A", 3, 3],
    ["B", 1, 3],
  ]);
  expect(result.shown).toBe(4);
  expect(result.total).toBe(9);
});

test("a zero, negative, fractional or infinite limit is handled", () => {
  const sections = [{ label: "", spools: rows("a", 3) }];
  expect(windowSections(sections, 0).sections).toEqual([]);
  expect(windowSections(sections, -5).shown).toBe(0);
  expect(windowSections(sections, 2.9).shown).toBe(2);
  expect(windowSections(sections, Number.POSITIVE_INFINITY).shown).toBe(3);
  expect(windowSections([], 10)).toEqual({ sections: [], shown: 0, total: 0 });
});

test("show more grows the window by a step and never past the total", () => {
  expect(nextLimit(200, 5000)).toBe(400);
  expect(nextLimit(4900, 5000)).toBe(5000);
  expect(nextLimit(5000, 5000)).toBe(5000);
  expect(nextLimit(0, 50)).toBe(50);
  expect(nextLimit(10, 0)).toBe(0);
});
