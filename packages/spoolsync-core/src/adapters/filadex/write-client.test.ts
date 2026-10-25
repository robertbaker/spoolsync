import { expect, test } from "bun:test";

import { loadFiladexFile } from ".";
import { applyToFiladex, type FiladexWriteClient } from "./apply";

test("Filadex applies a changed field through a narrow client without transport internals", async () => {
  const record = { id: "one", material: "PLA", colorName: "Before", manufacturer: "Keep" };
  const loaded = loadFiladexFile(JSON.stringify([record]));
  const patches: Array<{ id: string | number; payload: Record<string, unknown> }> = [];
  const client: FiladexWriteClient = {
    async listFilaments() {
      return [record];
    },
    async updateFilament(id, payload) {
      patches.push({ id, payload });
    },
    async createFilament() {
      throw new Error("Unexpected creation");
    },
  };
  const log = await applyToFiladex(client, [
    {
      kind: "update",
      source: "filadex",
      groupId: "one",
      spool: loaded.spools[0]!,
      changes: [{ field: "name", from: "Before", to: "After" }],
      links: {},
    },
  ]);
  expect(log[0]!.ok).toBe(true);
  expect(patches).toEqual([{ id: "one", payload: { colorName: "After" } }]);
  expect(record.colorName).toBe("Before");
});
