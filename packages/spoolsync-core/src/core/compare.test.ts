import { describe, expect, test } from "bun:test";

import {
  buildPlan,
  compareGroup,
  defaultResolution,
  mergedValues,
  openConflicts,
  valuesEqual,
} from "./compare";
import { matchSpools, type SpoolGroup } from "./match";
import { makeSpool } from "./testing";

function linkedGroup(): SpoolGroup {
  const spoolman = makeSpool("spoolman", "51", {
    crossIds: { spoolmanId: 51, spoolstockShortId: "s1" },
    remainingWeight: 600,
    location: "Shelf A",
  });
  const spoolstock = makeSpool("spoolstock", "s1", {
    remainingWeight: 640.2,
    nozzleTempMin: 190,
    nozzleTempMax: 220,
    name: "galaxy  black",
  });
  return matchSpools([spoolman, spoolstock]).groups[0]!;
}

describe("valuesEqual", () => {
  test("ignores case, spacing and sub-gram noise", () => {
    expect(valuesEqual("name", "Galaxy Black", "galaxy  black")).toBe(true);
    expect(valuesEqual("remainingWeight", 640, 640.4)).toBe(true);
    expect(valuesEqual("remainingWeight", 640, 641)).toBe(false);
    expect(valuesEqual("colors", ["000000", "FFFFFF"], ["FFFFFF", "000000"])).toBe(false);
    expect(valuesEqual("location", null, "")).toBe(true);
  });
});

describe("compareGroup", () => {
  test("comparison choices and default resolutions do not share inventory color arrays", () => {
    const donor = makeSpool("spoolman", "1", { colors: ["000000"] });
    const blank = makeSpool("spoolio", "a", { crossIds: { spoolmanId: 1 }, colors: [] });
    const group = matchSpools([donor, blank]).groups[0]!;
    const comparison = compareGroup(group).find((item) => item.field === "colors")!;
    (comparison.options[0]!.value as string[]).push("FFFFFF");
    expect(donor.colors).toEqual(["000000"]);
    const resolution = defaultResolution(group);
    (resolution.values.colors as string[]).push("FF0000");
    expect(donor.colors).toEqual(["000000"]);
  });
  test("reports conflicts and blanks, and skips fields a service cannot store", () => {
    const comparisons = compareGroup(linkedGroup());
    expect(comparisons.map((c) => [c.field, c.kind])).toEqual([
      ["remainingWeight", "conflict"],
      ["location", "fill"],
    ]);
    // Spoolman keeps no temperature range, so 190–220 on Spoolstock is not a conflict.
    expect(comparisons.find((c) => c.field === "nozzleTempMin")).toBeUndefined();
  });

  test("defaults fill blanks and leave conflicts open", () => {
    const group = linkedGroup();
    const resolution = defaultResolution(group);
    expect(resolution.values).toEqual({ location: "Shelf A" });
    expect(openConflicts(group, resolution)).toEqual(["remainingWeight"]);
  });
});

describe("buildPlan", () => {
  test("planned field values are independent from inventory and resolution arrays", () => {
    const spool = makeSpool("spoolman", "1", { colors: ["000000"] });
    const group = matchSpools([spool]).groups[0]!;
    const colors = ["FFFFFF"];
    const plan = buildPlan(
      [group],
      new Map([[group.id, { values: { colors }, createIn: ["spoolio"] }]]),
    );
    const update = plan.get("spoolman")![0]!;
    const create = plan.get("spoolio")![0]!;
    colors.push("FF0000");
    spool.colors.push("00FF00");
    expect(
      update.kind === "update" && update.changes.find((change) => change.field === "colors"),
    ).toMatchObject({ from: ["000000"], to: ["FFFFFF"] });
    expect(create.kind === "create" && create.values.colors).toEqual(["FFFFFF"]);
  });
  test("native record IDs take precedence over conflicting foreign cross-IDs", () => {
    const spoolman = makeSpool("spoolman", "1");
    const spoolio = makeSpool("spoolio", "a", { crossIds: { spoolmanId: 99 } });
    for (const spools of [
      [spoolman, spoolio],
      [spoolio, spoolman],
    ]) {
      const group = matchSpools(spools, { confirmed: ["spoolio:a|spoolman:1"], rejected: [] })
        .groups[0]!;
      const change = buildPlan(
        [group],
        new Map([[group.id, { values: {}, createIn: ["tigertag"] }]]),
      ).get("tigertag")![0]!;
      expect(change).toMatchObject({
        kind: "create",
        links: { spoolmanId: 1 },
        groupIds: { spoolmanId: 1, spoolioId: "a" },
      });
    }
  });

  test("disputed foreign IDs are not copied when the native service is absent", () => {
    const first = makeSpool("spoolio", "a", { crossIds: { spoolmanId: 1 } });
    const second = makeSpool("tigertag", "b", { crossIds: { spoolmanId: 2 } });
    const group = matchSpools([first, second], {
      confirmed: ["spoolio:a|tigertag:b"],
      rejected: [],
    }).groups[0]!;
    const change = buildPlan(
      [group],
      new Map([[group.id, { values: {}, createIn: ["threeDfp"] }]]),
    ).get("threeDfp")![0]!;
    expect(change.links).not.toHaveProperty("spoolmanId");
    expect(change.kind === "create" && change.groupIds).toEqual({
      spoolioId: "a",
      tigertagUid: "b",
    });
  });
  test("does not write changes back to read-only Spoolstock", () => {
    const group = linkedGroup();
    const plan = buildPlan(
      [group],
      new Map([
        [group.id, { values: { remainingWeight: 600, location: "Shelf A" }, createIn: [] }],
      ]),
    );
    expect(plan.get("spoolman")).toBeUndefined();
    expect(plan.get("spoolstock")).toBeUndefined();
  });

  test("stamps missing cross-ids even without field changes", () => {
    const spoolman = makeSpool("spoolman", "9", { crossIds: { spoolmanId: 9 } });
    const spoolstock = makeSpool("spoolstock", "s9");
    const [group] = matchSpools([spoolman, spoolstock], {
      confirmed: ["spoolman:9|spoolstock:s9"],
      rejected: [],
    }).groups;
    const plan = buildPlan([group!], new Map());
    expect(plan.get("spoolman")?.[0]).toMatchObject({
      kind: "update",
      changes: [],
      links: { spoolstockShortId: "s9" },
    });
  });

  test("creates in the services the user ticked, from merged values", () => {
    const only = makeSpool("spoolstock", "new1", { nozzleTempMin: 200, location: "Bin 3" });
    const [group] = matchSpools([only]).groups;
    const plan = buildPlan(
      [group!],
      new Map([[group!.id, { values: {}, createIn: ["spoolman"] }]]),
    );
    expect(plan.get("spoolman")?.[0]).toMatchObject({
      kind: "create",
      values: { vendor: "Prusament", location: "Bin 3", nozzleTempMin: 200 },
      links: { spoolstockShortId: "new1" },
    });
  });

  test("does not create a spool whose match is still pending", () => {
    const spoolman = makeSpool("spoolman", "7", { crossIds: { spoolmanId: 7 } });
    const spoolstock = makeSpool("spoolstock", "x");
    const { groups, suggestions } = matchSpools([spoolman, spoolstock]);
    expect(suggestions).toHaveLength(1);
    const createTargets = new Map(
      groups.map((g) => [g.id, { values: {}, createIn: ["spoolman" as const] }]),
    );
    expect(buildPlan(groups, createTargets, new Set(suggestions[0]!.groupIds)).size).toBe(0);
    expect(buildPlan(groups, createTargets).size).toBe(1);
  });
});

describe("mergedValues", () => {
  test("merged color arrays do not mutate their inventory or resolution", () => {
    const group = linkedGroup();
    const fromInventory = mergedValues(group, { values: {}, createIn: [] });
    fromInventory.colors.push("FFFFFF");
    expect(group.members.spoolman!.colors).toEqual(["1A1A1A"]);
    const colors = ["FF0000"];
    const resolved = mergedValues(group, { values: { colors }, createIn: [] });
    resolved.colors.push("000000");
    expect(colors).toEqual(["FF0000"]);
  });
  test("prefers resolved values, then the first service with a value", () => {
    const group = linkedGroup();
    const values = mergedValues(group, { values: { remainingWeight: 610 }, createIn: [] });
    expect(values.remainingWeight).toBe(610);
    expect(values.location).toBe("Shelf A");
    expect(values.nozzleTempMax).toBe(220);
  });
});
