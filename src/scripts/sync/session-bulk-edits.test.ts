import { expect, mock, test } from "bun:test";

import type { BulkEdit } from "@spoolsync/core/core/compare";
import type { CommonSpool, LoadResult, SourceId } from "@spoolsync/core/core/model";
import { makeSpool } from "@spoolsync/core/core/testing";

import { sanitizeBulkEdits } from "~/lib/browser/storage/bulk-edits";

import { SyncSession } from "./session";

function snapshot(source: SourceId, spools: CommonSpool[]): LoadResult {
  return { source, spools, warnings: [], loadedAt: "now" };
}

function make() {
  const saveBulkEdits = mock((_edits: ReadonlyMap<string, BulkEdit>) => {});
  const state = new SyncSession(
    new Map([
      [
        "spoolman",
        snapshot("spoolman", [makeSpool("spoolman", "1"), makeSpool("spoolman", "2")]),
      ],
      ["spoolio", snapshot("spoolio", [])],
    ]),
    { confirmed: [], rejected: [] },
    new Map(),
    { saveResolutions: () => {}, saveMatchDecisions: () => {}, saveBulkEdits },
  );
  state.recompute();
  return { state, saveBulkEdits, ids: state.match.groups.map((group) => group.id) };
}

test("bulk edits apply to the selected groups, persist, and merge part by part", () => {
  const { state, saveBulkEdits, ids } = make();
  expect(state.applyBulkEdit([ids[0]!], { location: "Shelf" }, "bulk")).toBe(1);
  expect(state.applyBulkEdit([ids[0]!], { tag: "dry" }, "bulk")).toBe(1);
  expect(state.bulkEdits().get(ids[0]!)).toEqual({ location: "Shelf", tag: "dry" });
  expect(state.bulkEdits().has(ids[1]!)).toBe(false);
  expect(saveBulkEdits).toHaveBeenCalled();
  // Repeating the same edit changes nothing and adds no undo step.
  const undoLabel = state.undoLabel();
  expect(state.applyBulkEdit([ids[0]!], { tag: "dry" }, "again")).toBe(0);
  expect(state.undoLabel()).toBe(undoLabel);
  // Unknown group ids are ignored.
  expect(state.applyBulkEdit(["nope"], { tag: "x" }, "bulk")).toBe(0);
});

test("clearing removes named parts and undo restores the edit", () => {
  const { state, ids } = make();
  state.applyBulkEdit(ids, { location: null, note: "n" }, "bulk");
  expect(state.clearBulkEdit([ids[0]!], ["location"])).toBe(1);
  expect(state.bulkEdits().get(ids[0]!)).toEqual({ note: "n" });
  expect(state.clearBulkEdit(ids)).toBe(2);
  expect(state.bulkEdits().size).toBe(0);
  expect(state.clearBulkEdit(ids)).toBe(0);
  state.undo();
  expect(state.bulkEdits().get(ids[0]!)).toEqual({ note: "n" });
  expect(state.bulkEdits().get(ids[1]!)).toEqual({ location: null, note: "n" });
});

test("selection drops groups that disappear on recompute", () => {
  const { state, ids } = make();
  state.setSelected(ids, true);
  expect(state.selected().size).toBe(2);
  state.loaded.set("spoolman", snapshot("spoolman", [makeSpool("spoolman", "1")]));
  state.recompute();
  expect(state.selected().size).toBe(1);
  state.setSelected(ids, false);
  expect(state.selected().size).toBe(0);
});

test("stored edits are sanitized on load", () => {
  const edits = sanitizeBulkEdits([
    ["a", { location: " Shelf ", bogus: 1 }],
    ["", { tag: "x" }],
    ["b", { location: "  " }],
    ["c", "string"],
    "junk",
  ]);
  expect([...edits]).toEqual([["a", { location: "Shelf" }]]);
  expect(sanitizeBulkEdits({ not: "array" }).size).toBe(0);
});
