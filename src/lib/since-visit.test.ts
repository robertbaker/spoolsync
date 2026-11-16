import { beforeEach, expect, test } from "bun:test";

import { SINCE_VISIT_KEY, readVisits, writeVisits } from "./since-visit";

beforeEach(() => localStorage.clear());

const summary = {
  source: "spoolman" as const,
  since: "2026-10-01T00:00:00Z",
  loadedAt: "2026-11-03T10:00:00.000Z",
  added: [],
  removed: [],
  drops: [],
  gains: [],
  counts: { added: 0, removed: 0, drops: 0, gains: 0 },
  unchanged: 0,
  netGrams: 0,
};

test("visit summaries round-trip through browser storage and invalid values are dropped", () => {
  expect(writeVisits([summary])).toBe(true);
  expect(readVisits()).toEqual({ spoolman: summary });
  localStorage.setItem(
    SINCE_VISIT_KEY,
    JSON.stringify({
      spoolman: { ...summary, since: "not a date" },
      spoolio: {
        ...summary,
        source: "spoolio",
        counts: { added: -1, removed: 0, drops: 0, gains: 0 },
      },
      bogus: summary,
    }),
  );
  expect(readVisits()).toEqual({});
  localStorage.setItem(SINCE_VISIT_KEY, "{broken");
  expect(readVisits()).toEqual({});
  expect(writeVisits([])).toBe(true);
  expect(localStorage.getItem(SINCE_VISIT_KEY)).toBeNull();
});
