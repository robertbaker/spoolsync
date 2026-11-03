import { beforeEach, expect, test } from "bun:test";

import {
  MAX_HISTORY_POINTS,
  appendStockPoint,
  clearStockHistory,
  readStockHistory,
  recordStockPoint,
  sanitizeStockHistory,
  type StockHistory,
} from "./stock-history";

beforeEach(() => localStorage.clear());

const point = (hours: number, totalGrams = 1000, spoolCount = 3) => ({
  at: new Date(Date.UTC(2026, 10, 1) + hours * 3_600_000).toISOString(),
  totalGrams,
  spoolCount,
});

test("records a point per load, in time order, and can clear them", () => {
  expect(readStockHistory()).toEqual({});
  recordStockPoint("spoolman", point(0, 1000));
  recordStockPoint("spoolman", point(24, 800));
  recordStockPoint("spoolio", point(12, 300, 1));
  expect(readStockHistory().spoolman).toEqual([point(0, 1000), point(24, 800)]);
  expect(readStockHistory().spoolio).toEqual([point(12, 300, 1)]);
  clearStockHistory();
  expect(localStorage.getItem("spoolsync:stock-history")).toBeNull();
});

test("an unchanged total is not repeated within a few hours but is after a day", () => {
  let history = appendStockPoint({}, "spoolman", point(0));
  expect(appendStockPoint(history, "spoolman", point(1))).toBe(history);
  history = appendStockPoint(history, "spoolman", point(30));
  expect(history.spoolman).toHaveLength(2);
  // A changed total is always kept.
  expect(appendStockPoint(history, "spoolman", point(31, 900)).spoolman).toHaveLength(3);
});

test("the history is capped, dropping the oldest points", () => {
  let history: StockHistory = {};
  for (let i = 0; i < MAX_HISTORY_POINTS + 25; i++)
    history = appendStockPoint(history, "spoolman", point(i * 10, 1000 + i));
  const points = history.spoolman!;
  expect(points).toHaveLength(MAX_HISTORY_POINTS);
  expect(points[0]!.totalGrams).toBe(1025);
  expect(points.at(-1)!.totalGrams).toBe(1000 + MAX_HISTORY_POINTS + 24);
});

test("damaged entries, unknown services and extra fields are dropped", () => {
  localStorage.setItem(
    "spoolsync:stock-history",
    JSON.stringify({
      spoolman: [
        { ...point(5, 500), name: "Secret spool" },
        { at: "not a date", totalGrams: 1, spoolCount: 1 },
        { at: point(1).at, totalGrams: -5, spoolCount: 1 },
        { at: point(2).at, totalGrams: "9", spoolCount: 1 },
        null,
        point(1, 700.4),
      ],
      nonsense: [point(0)],
      spoolio: "oops",
    }),
  );
  expect(readStockHistory()).toEqual({ spoolman: [point(1, 700), point(5, 500)] });
  localStorage.setItem("spoolsync:stock-history", "{broken");
  expect(readStockHistory()).toEqual({});
  expect(sanitizeStockHistory([1, 2])).toEqual({});
});

test("a damaged new point is ignored", () => {
  const history = appendStockPoint({}, "spoolman", { at: "x", totalGrams: 1, spoolCount: 1 });
  expect(history).toEqual({});
});
