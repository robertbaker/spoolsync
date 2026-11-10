import { expect, test } from "bun:test";

import type { PlannedChange } from "../../core/compare";
import { exportFilameter, loadFilameterFile } from "./index";

const docs = JSON.stringify({
  regular: [
    {
      _id: "a",
      filament: "Red",
      material: "PLA",
      color: "Red",
      price: 20,
      used_weight: 100,
      total_weight: 1000,
      calc_weight: 900,
    },
    {
      _id: "b",
      filament: "Odd",
      material: "PLA",
      color: "notacolor",
      used_weight: 0,
      total_weight: 1000,
    },
  ],
  local: [],
});

const update = (changes: unknown[], spool: unknown): PlannedChange =>
  ({
    kind: "update",
    source: "filameter",
    groupId: "g",
    spool,
    links: {},
    changes,
  }) as never;

test("FilaMeter reads CSS colour names and ignores unknown ones", () => {
  const { spools } = loadFilameterFile(docs);
  expect(spools[0]!.colors).toEqual(["FF0000"]);
  expect(spools[1]!.colors).toEqual([]);
});

test("FilaMeter update refreshes calc_weight and omits an emptied price", () => {
  const loaded = loadFilameterFile(docs);
  const out = exportFilameter(loaded, [
    update(
      [
        { field: "remainingWeight", from: 900, to: 600 },
        { field: "price", from: 20, to: null },
      ],
      loaded.spools[0],
    ),
  ]);
  const doc = JSON.parse(out.json).regular[0];
  expect(doc).toMatchObject({
    used_weight: 400,
    total_weight: 1000,
    calc_weight: 600,
  });
  expect("price" in doc).toBe(false);
});

test("FilaMeter create omits a null price", () => {
  const loaded = loadFilameterFile(docs);
  const create = {
    kind: "create",
    source: "filameter",
    groupId: "g",
    values: {
      vendor: "V",
      material: "PLA",
      name: "N",
      colors: [],
      price: null,
      location: null,
      comment: null,
      initialWeight: 1000,
      remainingWeight: 1000,
    },
    links: {},
    groupIds: {},
  } as never;
  const out = exportFilameter(loaded, [create], {
    randomUUID: () => "new-id",
  } as never);
  const added = JSON.parse(out.json).regular.at(-1);
  expect(added._id).toBe("new-id");
  expect("price" in added).toBe(false);
});

test("FilaMeter never writes a null total weight: unknown weights become a full 1000 g spool with a warning", () => {
  const loaded = loadFilameterFile(docs);
  const create = {
    kind: "create",
    source: "filameter",
    groupId: "g2",
    values: {
      vendor: "V",
      material: "PLA",
      name: "Unknown",
      colors: [],
      price: null,
      location: null,
      comment: null,
      initialWeight: null,
      remainingWeight: null,
    },
    links: {},
    groupIds: {},
  } as never;
  const out = exportFilameter(
    loaded,
    [
      create,
      update(
        [
          { field: "initialWeight", from: 1000, to: null },
          { field: "remainingWeight", from: 900, to: null },
        ],
        loaded.spools[0],
      ),
    ],
    { randomUUID: () => "unknown-id" } as never,
  );
  for (const text of [out.json, out.csv]) {
    const reloaded = loadFilameterFile(text).spools;
    for (const spool of [reloaded[0]!, reloaded.at(-1)!])
      expect(spool).toMatchObject({ initialWeight: 1000, remainingWeight: 1000 });
  }
  expect(out.json).not.toContain('"total_weight": null');
  // Limitation: FilaMeter's strict schema has no place for a placeholder marker, so the reload is a
  // measured 1000 g. The warning must say so, once per unknown-weight spool.
  const warned = out.warnings.filter((text) => text.includes("full 1000 g spool"));
  expect(warned).toHaveLength(2);
  for (const text of warned) expect(text).toContain("read back as a measured 1000 g");
});

test("FilaMeter keeps its required material and filament name when they are emptied", () => {
  const loaded = loadFilameterFile(docs);
  const out = exportFilameter(loaded, [
    update(
      [
        { field: "material", from: "PLA", to: null },
        { field: "name", from: "Red", to: "" },
      ],
      loaded.spools[0],
    ),
  ]);
  const doc = JSON.parse(out.json).regular[0];
  expect(doc).toMatchObject({ material: "PLA", filament: "Red" });
  expect(out.warnings).toEqual([
    expect.stringContaining("requires a material"),
    expect.stringContaining("requires a filament name"),
  ]);
});

test("FilaMeter names a new spool without a name rather than writing an empty filament", () => {
  const loaded = loadFilameterFile(docs);
  const create = {
    kind: "create",
    source: "filameter",
    groupId: "g",
    links: {},
    groupIds: {},
    values: {
      vendor: null,
      material: null,
      name: null,
      colors: [],
      initialWeight: 1000,
      remainingWeight: 1000,
      location: null,
      comment: null,
      price: null,
    },
  } as never;
  const out = exportFilameter(loaded, [create], { now: () => 0, randomUUID: () => "new" });
  const doc = JSON.parse(out.json).regular.at(-1);
  expect(doc.filament).toBe("Imported Filament");
  expect(out.warnings.join("\n")).toContain("requires a filament name");
});
