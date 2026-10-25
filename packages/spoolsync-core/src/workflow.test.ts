import { expect, test } from "bun:test";

import { buildPlan } from "./core/compare";
import type { PlannedChange } from "./core/compare";
import { matchSpools } from "./core/match";
import { WRITABLE_SOURCE_IDS } from "./core/model";
import { makeSpool } from "./core/testing";
import { createEmptyInventory, exportInventory, loadInventoryFile } from "./workflow";

test("exports reject foreign, missing, and duplicate update targets", async () => {
  const loaded = await loadInventoryFile("spoolio", '{"version":1,"filaments":[{"id":"a"}]}');
  const update: PlannedChange = {
    kind: "update",
    source: "spoolio",
    groupId: "group",
    spool: loaded.spools[0]!,
    changes: [],
    links: {},
  };
  await expect(
    exportInventory("spoolio", loaded, [{ ...update, source: "spoolman" }]),
  ).rejects.toThrow("Cannot apply spoolman changes");
  await expect(
    exportInventory("spoolio", loaded, [{ ...update, spool: makeSpool("spoolio", "missing") }]),
  ).rejects.toThrow("missing");
  await expect(exportInventory("spoolio", loaded, [update, update])).rejects.toThrow(
    "Duplicate update",
  );
});

test("exports reject duplicate creations before generating duplicate spools", async () => {
  const loaded = await createEmptyInventory("spoolio");
  const group = matchSpools([makeSpool("spoolman", "42")]).groups[0]!;
  const changes = buildPlan(
    [group],
    new Map([[group.id, { values: {}, createIn: ["spoolio"] }]]),
  ).get("spoolio")!;
  await expect(exportInventory("spoolio", loaded, [...changes, ...changes])).rejects.toThrow(
    "Duplicate creation",
  );
});

for (const source of WRITABLE_SOURCE_IDS) {
  test(`creates a usable empty ${source} inventory and exports a new spool`, async () => {
    const loaded = await createEmptyInventory(source);
    expect(loaded).toMatchObject({ source, spools: [], warnings: [], origin: "file" });
    const donor =
      source === "spoolman" ? makeSpool("spoolio", "donor") : makeSpool("spoolman", "42");
    const group = matchSpools([donor]).groups[0]!;
    const changes = buildPlan(
      [group],
      new Map([[group.id, { values: {}, createIn: [source] }]]),
    ).get(source)!;
    const exported = await exportInventory(source, loaded, changes);
    expect(exported.created).toBe(1);
    const reloaded = await loadInventoryFile(source, exported.text);
    expect(reloaded.spools).toHaveLength(1);
    expect(reloaded.spools[0]?.material).toBe("PLA");
    expect(loaded.spools).toEqual([]);
  });
}

test("read-only sources cannot become empty targets", async () => {
  await expect(createEmptyInventory("spoolstock")).rejects.toThrow("read-only");
});

test("rejects duplicate native IDs before matching can merge records", async () => {
  await expect(
    loadInventoryFile(
      "spoolio",
      JSON.stringify({
        version: 1,
        filaments: [{ id: "duplicate" }, { id: "duplicate" }],
      }),
    ),
  ).rejects.toThrow('Duplicate spoolio record ID "duplicate"');
});

test("accepts unique native IDs in a BOM-prefixed file", async () => {
  const loaded = await loadInventoryFile(
    "spoolio",
    '\uFEFF{"version":1,"filaments":[{"id":"a"},{"id":"b"}]}',
  );
  expect(loaded.spools.map((spool) => spool.sourceId)).toEqual(["a", "b"]);
});
