import { expect, test } from "bun:test";

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
