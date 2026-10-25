import { expect, test } from "bun:test";

import { buildPlan } from "../../core/compare";
import { matchSpools } from "../../core/match";
import { makeSpool } from "../../core/testing";
import { createEmptyInventory, exportInventory, loadInventoryFile } from "../../workflow";

for (const source of ["spoolio", "tigertag", "threeDfp"] as const) {
  for (const weight of [0, null]) {
    test(`${source} preserves ${weight === null ? "unknown" : "zero"} empty-spool weight on export and reload`, async () => {
      const donor = makeSpool("spoolman", "1", { emptySpoolWeight: weight });
      const group = matchSpools([donor]).groups[0]!;
      const changes = buildPlan(
        [group],
        new Map([[group.id, { values: {}, createIn: [source] }]]),
      ).get(source)!;
      const output = await exportInventory(source, await createEmptyInventory(source), changes);
      const loaded = await loadInventoryFile(source, output.text);
      expect(loaded.spools).toHaveLength(1);
      expect(loaded.spools[0]!.emptySpoolWeight).toBe(weight);
    });
  }
}
