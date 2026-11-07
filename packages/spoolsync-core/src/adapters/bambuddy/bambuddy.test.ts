import { expect, test } from "bun:test";

import { exportBambuddyCsv, loadBambuddyFile } from ".";
import { makeSpool } from "../../core/testing";
import { exportInventory, loadInventoryFile } from "../../workflow";

test("Bambuddy exports warn when planned edits cannot be represented by its create-only CSV", async () => {
  const loaded = await loadInventoryFile(
    "bambuddy",
    JSON.stringify([{ id: 1, material: "PLA", color_name: "Blue" }]),
  );
  const result = await exportInventory("bambuddy", loaded, [
    {
      kind: "update",
      source: "bambuddy",
      groupId: "group",
      spool: loaded.spools[0]!,
      links: {},
      changes: [{ field: "name", from: "Blue", to: "Green" }],
    },
  ]);
  expect(result.updated).toBe(0);
  expect(result.created).toBe(0);
  expect(result.warnings).toHaveLength(1);
  expect(result.warnings[0]).toContain("1 planned update was omitted");
  expect((await loadInventoryFile("bambuddy", result.text)).spools).toEqual([]);
});

test("Bambuddy CSV export writes finish as subtype and the lot number as material_number", () => {
  const values = makeSpool("bambuddy", "x", {
    finish: "Silk",
    lotNr: "B-15",
    emptySpoolWeight: 230,
    archived: true,
  });
  const loaded = loadBambuddyFile(["material", "PLA", ""].join("\n"));
  const result = exportBambuddyCsv(loaded, [
    {
      kind: "create",
      source: "bambuddy",
      groupId: "g",
      values,
      links: {},
      groupIds: {},
    },
  ]);
  const [header, row] = result.csv.trim().split(String.fromCharCode(10));
  const columns = header!.trim().split(",");
  const cells = row!.trim().split(",");
  expect(cells[columns.indexOf("subtype")]).toBe("Silk");
  expect(cells[columns.indexOf("material_number")]).toBe("B-15");
  expect(columns).not.toContain("effect_type");
  expect(columns).not.toContain("core_weight");
  expect(result.warnings.join(" ")).toContain("empty spool weight was omitted");
  expect(result.warnings.join(" ")).toContain("archived state was omitted");
  const reloaded = loadBambuddyFile(result.csv).spools[0]!;
  expect(reloaded).toMatchObject({
    finish: "Silk",
    lotNr: "B-15",
    crossIds: {},
  });
});

test("Bambuddy CSV export leaves unknown weights blank instead of a 0 g label weight", () => {
  const values = makeSpool("bambuddy", "x", { initialWeight: null, remainingWeight: null });
  const loaded = loadBambuddyFile(["material", "PLA", ""].join("\n"));
  const result = exportBambuddyCsv(loaded, [
    { kind: "create", source: "bambuddy", groupId: "g", values, links: {}, groupIds: {} },
  ]);
  const [header, row] = result.csv.trim().split(String.fromCharCode(10));
  const columns = header!.trim().split(",");
  const cells = row!.trim().split(",");
  expect(cells[columns.indexOf("label_weight")]).toBe("");
  expect(cells[columns.indexOf("weight_used")]).toBe("");
  expect(result.warnings.join(" ")).toContain("weights are unknown");
  expect(loadBambuddyFile(result.csv).spools[0]).toMatchObject({
    initialWeight: null,
    remainingWeight: null,
  });
});
