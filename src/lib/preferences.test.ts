import { beforeEach, expect, test } from "bun:test";

import {
  clearPreferences,
  readPreferences,
  sanitizePreferences,
  updatePreferences,
} from "./preferences";

beforeEach(() => localStorage.clear());

test("saves, merges, and forgets individual preferences", () => {
  expect(readPreferences()).toEqual({});
  updatePreferences({ tableSort: { key: "vendor", direction: "desc" }, lowOnly: true });
  updatePreferences({ syncFilter: "open" });
  expect(readPreferences()).toEqual({
    tableSort: { key: "vendor", direction: "desc" },
    lowOnly: true,
    syncFilter: "open",
  });
  updatePreferences({ lowOnly: undefined, tableSort: undefined });
  expect(readPreferences()).toEqual({ syncFilter: "open" });
  clearPreferences();
  expect(readPreferences()).toEqual({});
  expect(localStorage.getItem("spoolsync:prefs")).toBeNull();
});

test("ignores damaged, hand-edited, or wrongly shaped entries", () => {
  for (const raw of ["{nope", "[]", "null", '"text"', '{"lowOnly":"yes"}']) {
    localStorage.setItem("spoolsync:prefs", raw);
    expect(readPreferences()).toEqual({});
  }
  localStorage.setItem(
    "spoolsync:prefs",
    JSON.stringify({
      tableSort: { key: "nonsense", direction: "asc" },
      sourceFilter: "api",
      syncFilter: "everything",
      extra: 1,
    }),
  );
  expect(readPreferences()).toEqual({ sourceFilter: "api" });
});

test("saving nothing removes the entry", () => {
  updatePreferences({ lowOnly: true });
  updatePreferences({ lowOnly: undefined });
  expect(localStorage.getItem("spoolsync:prefs")).toBeNull();
});

test("the rollback preference keeps only a real boolean", () => {
  expect(sanitizePreferences({ rollbackBeforeApply: false })).toEqual({
    rollbackBeforeApply: false,
  });
  expect(sanitizePreferences({ rollbackBeforeApply: true })).toEqual({ rollbackBeforeApply: true });
  expect(sanitizePreferences({ rollbackBeforeApply: "no" })).toEqual({});
});
