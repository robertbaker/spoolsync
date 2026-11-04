import { describe, expect, test } from "bun:test";

import { strictValuesEqual, type GroupResolution, type RecordEdits } from "./core/compare";
import { matchSpools } from "./core/match";
import { makeSpool } from "./core/testing";
import { planSync } from "./planner";
import { applyCleanupToResults, duplicatesAfterCleanup } from "./workflow";

const spoolman = makeSpool("spoolman", "1", { vendor: "eSUN", location: "Shelf A" });
const spoolio = makeSpool("spoolio", "A", {
  crossIds: { spoolmanId: 1 },
  vendor: "esun",
  location: null,
});

function plan(recordEdits: RecordEdits, resolutions = new Map<string, GroupResolution>()) {
  const { groups, suggestions } = matchSpools([spoolman, spoolio]);
  expect(groups).toHaveLength(1);
  return planSync(groups, resolutions, suggestions, new Map(), recordEdits);
}

const fieldChanges = (result: ReturnType<typeof plan>, source: "spoolio" | "spoolman") =>
  (result.get(source) ?? []).flatMap((change) => (change.kind === "update" ? change.changes : []));

describe("record edits in the plan", () => {
  test("a case-only cleanup still becomes a planned update", () => {
    const result = plan(new Map([["spoolio:A", { vendor: "eSUN" }]]));
    expect(fieldChanges(result, "spoolio")).toEqual([
      { field: "vendor", from: "esun", to: "eSUN" },
    ]);
    expect(fieldChanges(result, "spoolman")).toEqual([]);
  });

  test("without record edits the case difference is not a change", () => {
    expect(fieldChanges(plan(new Map()), "spoolio")).toEqual([]);
  });

  test("an edit only reaches the record it names", () => {
    const result = plan(new Map([["spoolman:1", { vendor: "ESUN 3D" }]]));
    expect(fieldChanges(result, "spoolman")).toEqual([
      { field: "vendor", from: "eSUN", to: "ESUN 3D" },
    ]);
    expect(fieldChanges(result, "spoolio")).toEqual([]);
  });

  test("a field the person resolved keeps their choice", () => {
    const { groups } = matchSpools([spoolman, spoolio]);
    const resolutions = new Map([[groups[0]!.id, { values: { vendor: "Chosen" }, createIn: [] }]]);
    const result = plan(new Map([["spoolio:A", { vendor: "eSUN" }]]), resolutions);
    expect(fieldChanges(result, "spoolio")).toEqual([
      { field: "vendor", from: "esun", to: "Chosen" },
    ]);
  });

  test("fields the service does not store are not planned", () => {
    const tiger = makeSpool("tigertag", "T", { crossIds: { spoolmanId: 1 } });
    const { groups, suggestions } = matchSpools([spoolman, tiger]);
    const result = planSync(
      groups,
      new Map(),
      suggestions,
      new Map(),
      new Map([["tigertag:T", { location: "Shelf B", price: 12.5 }]]),
    );
    expect(
      (result.get("tigertag") ?? []).flatMap((change) =>
        change.kind === "update" ? change.changes.map((c) => c.field) : [],
      ),
    ).toEqual([]);
  });

  test("read-only services are never planned", () => {
    const stock = makeSpool("spoolstock", "S1", { crossIds: { spoolmanId: 1 } });
    const { groups, suggestions } = matchSpools([spoolman, stock]);
    const result = planSync(
      groups,
      new Map(),
      suggestions,
      new Map(),
      new Map([["spoolstock:S1", { vendor: "Other" }]]),
    );
    expect(result.has("spoolstock")).toBe(false);
  });

  test("a bulk note tag is added on top of a cleaned note", () => {
    const { groups, suggestions } = matchSpools([
      makeSpool("spoolman", "1", { comment: "  dry me " }),
    ]);
    const group = groups[0]!;
    const result = planSync(
      groups,
      new Map(),
      suggestions,
      new Map([[group.id, { tag: "dry" }]]),
      new Map([["spoolman:1", { comment: "dry me" }]]),
    );
    expect(fieldChanges(result, "spoolman")).toEqual([
      { field: "comment", from: "  dry me ", to: "dry me #dry" },
    ]);
  });
});

describe("strictValuesEqual", () => {
  test("is exact for text and compares colors by position", () => {
    expect(strictValuesEqual("esun", "eSUN")).toBe(false);
    expect(strictValuesEqual("a", "a")).toBe(true);
    expect(strictValuesEqual(["A", "B"], ["A", "B"])).toBe(true);
    expect(strictValuesEqual(["A", "B"], ["B", "A"])).toBe(false);
    expect(strictValuesEqual(null, "")).toBe(false);
    expect(strictValuesEqual(null, null)).toBe(true);
  });
});

describe("duplicates after cleanup", () => {
  const result = (spools: ReturnType<typeof makeSpool>[]) => ({
    source: "spoolman" as const,
    spools,
    warnings: [],
    loadedAt: "2026-01-01T00:00:00.000Z",
  });
  const a = makeSpool("spoolman", "1", {
    vendor: "Prusament",
    name: "Orange",
    remainingWeight: 500,
  });
  const b = makeSpool("spoolman", "2", {
    vendor: "Prusament Inc",
    name: "Orange",
    remainingWeight: 500,
  });

  test("reports pairs that only match once the vendor is standardized", () => {
    const loaded = [result([a, b])];
    expect(duplicatesAfterCleanup(loaded, [])).toEqual([]);
    const groups = duplicatesAfterCleanup(loaded, [
      { spoolKey: "spoolman:2", field: "vendor", after: "Prusament" },
    ]);
    expect(groups.map((group) => group.spools.map((spool) => spool.sourceId))).toEqual([
      ["1", "2"],
    ]);
  });

  test("does not repeat duplicates that already exist and leaves the inputs alone", () => {
    const twin = { ...a, sourceId: "3", crossIds: {} };
    const loaded = [result([a, twin])];
    expect(
      duplicatesAfterCleanup(loaded, [
        { spoolKey: "spoolman:3", field: "location", after: "Shelf" },
      ]),
    ).toEqual([]);
    const cleaned = applyCleanupToResults(loaded, [
      { spoolKey: "spoolman:3", field: "location", after: "Shelf" },
    ]);
    expect(cleaned[0]!.spools[1]!.location).toBe("Shelf");
    expect(loaded[0]!.spools[1]!.location).toBeNull();
  });
});
