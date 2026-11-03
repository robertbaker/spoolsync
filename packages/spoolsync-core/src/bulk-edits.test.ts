import { describe, expect, test } from "bun:test";

import {
  addTagToNote,
  describeBulkEdit,
  editReachesGroup,
  mergeBulkEdit,
  normalizeTag,
  sanitizeBulkEdit,
  servicesSupporting,
  withoutBulkEditKeys,
  type BulkEdit,
  type GroupResolution,
} from "./core/compare";
import { matchSpools } from "./core/match";
import { makeSpool } from "./core/testing";
import { planSync, reconcileBulkEdits } from "./planner";

function groupOf(...spools: ReturnType<typeof makeSpool>[]) {
  return matchSpools(spools).groups;
}

const linked = (source: "spoolio" | "tigertag", id: string, extra = {}) =>
  makeSpool(source, id, { crossIds: { spoolmanId: 1 }, ...extra });

describe("sanitizeBulkEdit", () => {
  test("trims, caps, drops blanks and keeps explicit null as a clear", () => {
    expect(sanitizeBulkEdit({ location: "  Shelf A ", note: null, tag: " #Dry Box " })).toEqual({
      location: "Shelf A",
      note: null,
      tag: "Dry-Box",
    });
    expect(sanitizeBulkEdit({ location: "   ", note: "", tag: "#" })).toBeNull();
    expect(sanitizeBulkEdit({ location: 5, extra: "x" })).toBeNull();
    expect(sanitizeBulkEdit("nope")).toBeNull();
    expect(sanitizeBulkEdit([])).toBeNull();
    expect(sanitizeBulkEdit({ note: "x".repeat(5000) })?.note).toHaveLength(2000);
  });

  test("normalizeTag removes separators that would break a note", () => {
    expect(normalizeTag("a, b")).toBe("a-b");
    expect(normalizeTag("##x")).toBe("x");
  });
});

describe("notes and tags", () => {
  test("adds a tag once, case-insensitively, without touching other text", () => {
    expect(addTagToNote("dry me\n", "dry")).toBe("dry me #dry");
    expect(addTagToNote("keep #DRY", "dry")).toBe("keep #DRY");
    expect(addTagToNote(null, "dry")).toBe("#dry");
    expect(addTagToNote("a #dryer", "dry")).toBe("a #dryer #dry");
  });

  test("merge and removal keep or clear individual parts", () => {
    const merged = mergeBulkEdit({ location: "A", tag: "x" }, { location: null, note: "n" });
    expect(merged).toEqual({ location: null, note: "n", tag: "x" });
    expect(withoutBulkEditKeys(merged!, ["location", "note"])).toEqual({ tag: "x" });
    expect(withoutBulkEditKeys({ tag: "x" }, ["tag"])).toBeNull();
    expect(describeBulkEdit(merged!)).toBe('clear location, note "n", tag #x');
  });
});

describe("planning with bulk edits", () => {
  test("sets location only on services whose adapter stores it", () => {
    const [group] = groupOf(
      makeSpool("spoolman", "1", { location: "Old" }),
      linked("spoolio", "a", { location: null }),
      linked("tigertag", "t"),
    );
    const plan = planSync([group!], new Map(), [], new Map([[group!.id, { location: "Shelf" }]]));
    expect(plan.get("spoolman")?.[0]).toMatchObject({
      changes: [{ field: "location", from: "Old", to: "Shelf" }],
    });
    // Spoolio and TigerTag have no place for a location.
    expect(plan.get("spoolio")?.some((c) => c.kind === "update" && c.changes.length)).toBeFalsy();
    expect(plan.get("tigertag")?.some((c) => c.kind === "update" && c.changes.length)).toBeFalsy();
  });

  test("null clears a value and an unchanged value plans nothing", () => {
    const [group] = groupOf(makeSpool("spoolman", "1", { location: "Old" }));
    const clear = planSync([group!], new Map(), [], new Map([[group!.id, { location: null }]]));
    expect(clear.get("spoolman")?.[0]).toMatchObject({
      changes: [{ field: "location", from: "Old", to: null }],
    });
    const same = planSync([group!], new Map(), [], new Map([[group!.id, { location: " old " }]]));
    expect(same.get("spoolman")).toBeUndefined();
  });

  test("a tag is added to each member's own note, not a single chosen one", () => {
    const [group] = groupOf(
      makeSpool("spoolman", "1", { comment: "from spoolman" }),
      linked("spoolio", "a", { comment: "from spoolio" }),
    );
    const plan = planSync([group!], new Map(), [], new Map([[group!.id, { tag: "dry" }]]));
    expect(plan.get("spoolman")?.[0]).toMatchObject({
      changes: [{ field: "comment", to: "from spoolman #dry" }],
    });
    expect(plan.get("spoolio")?.[0]).toMatchObject({
      changes: [{ field: "comment", to: "from spoolio #dry" }],
    });
  });

  test("a note edit wins over a resolved value and a tag is added after it", () => {
    const [group] = groupOf(
      makeSpool("spoolman", "1", { comment: "a" }),
      linked("spoolio", "a", { comment: "b" }),
    );
    const resolutions = new Map<string, GroupResolution>([
      [group!.id, { values: { comment: "picked" }, createIn: [] }],
    ]);
    const edits = new Map<string, BulkEdit>([[group!.id, { note: "bulk", tag: "x" }]]);
    const plan = planSync([group!], resolutions, [], edits);
    expect(plan.get("spoolman")?.[0]).toMatchObject({
      changes: [{ field: "comment", to: "bulk #x" }],
    });
  });

  test("unknown resolved fields are left alone and created spools carry the edit", () => {
    const [group] = groupOf(makeSpool("spoolman", "1", { location: "Old" }));
    const resolutions = new Map<string, GroupResolution>([
      [group!.id, { values: { name: "Renamed" }, createIn: ["bambuddy"] }],
    ]);
    const plan = planSync(
      [group!],
      resolutions,
      [],
      new Map([[group!.id, { location: "Shelf", tag: "t" }]]),
    );
    const update = plan.get("spoolman")?.[0];
    expect(update).toMatchObject({ kind: "update" });
    expect(update?.kind === "update" && update.changes.map((c) => c.field).sort()).toEqual([
      "comment",
      "location",
      "name",
    ]);
    const created = plan.get("bambuddy")?.[0];
    expect(created).toMatchObject({ kind: "create", values: { location: "Shelf", comment: "#t" } });
  });

  test("without edits the plan is identical", () => {
    const [group] = groupOf(makeSpool("spoolman", "1"), linked("spoolio", "a", { name: "X" }));
    expect(planSync([group!], new Map(), [])).toEqual(
      planSync([group!], new Map(), [], new Map()),
    );
  });
});

describe("edit support and reconciliation", () => {
  test("reports which services take each kind of edit", () => {
    expect(servicesSupporting("location")).toContain("spoolman");
    expect(servicesSupporting("location")).not.toContain("tigertag");
    expect(servicesSupporting("note", ["filadex", "spoolman"])).toEqual(["spoolman"]);
    const [onlyTigertag] = groupOf(makeSpool("tigertag", "t"));
    expect(editReachesGroup(onlyTigertag!, { location: "x" })).toBe(false);
    expect(editReachesGroup(onlyTigertag!, { tag: "x" })).toBe(true);
  });

  test("edits follow a group as it grows and drop with vanished groups", () => {
    const spoolman = makeSpool("spoolman", "1");
    const [old] = groupOf(spoolman);
    const [grown] = groupOf(spoolman, linked("spoolio", "a"));
    const previous = new Map<string, BulkEdit>([
      [old!.id, { location: "A", tag: "t" }],
      ["gone", { tag: "z" }],
    ]);
    const next = reconcileBulkEdits([grown!], previous);
    expect([...next]).toEqual([[grown!.id, { location: "A", tag: "t" }]]);
  });

  test("merged groups keep only the parts every contributor agrees on", () => {
    const a = makeSpool("spoolman", "1");
    const b = makeSpool("spoolio", "a");
    const [ga] = groupOf(a);
    const [gb] = groupOf(b);
    const [merged] = groupOf(a, linked("spoolio", "a"));
    const next = reconcileBulkEdits(
      [merged!],
      new Map([
        [ga!.id, { location: "A", tag: "t" }],
        [gb!.id, { location: "B", tag: "t" }],
      ]),
    );
    expect(next.get(merged!.id)).toEqual({ tag: "t" });
  });
});
