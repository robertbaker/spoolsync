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
