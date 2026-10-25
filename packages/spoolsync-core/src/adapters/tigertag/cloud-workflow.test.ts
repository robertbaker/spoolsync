import { expect, test } from "bun:test";

import type { PlannedUpdate } from "../../core/compare";
import { applyToTigertagCloud, loadTigertagCloud, type TigertagInventoryClient } from "./cloud";

test("cloud workflows accept an inventory port without transport or authentication", async () => {
  const writes: Array<{ id: string; fields: Record<string, unknown> }> = [];
  const client: TigertagInventoryClient = {
    uid: "test-account",
    async listInventory() {
      return [{ uid: "CLOUD_one", __docId: "document-one", color_name: "Before" }];
    },
    async writeDocument(id, fields) {
      writes.push({ id, fields });
    },
  };
  const loaded = await loadTigertagCloud(client);
  const change: PlannedUpdate = {
    kind: "update",
    source: "tigertag",
    groupId: "one",
    spool: loaded.spools[0]!,
    changes: [{ field: "name", from: "Before", to: "After" }],
    links: {},
  };
  expect(loaded.connectionId).toBe(client.uid);
  expect(loaded.file.exportedBy).toBe(client.uid);
  const log = await applyToTigertagCloud(client, [change]);
  expect(log[0]!.ok).toBe(true);
  expect(writes).toHaveLength(1);
  expect(writes[0]!.id).toBe("document-one");
  expect(writes[0]!.fields.color_name).toBe("After");
  expect(writes[0]!.fields).not.toHaveProperty("__docId");
  expect(loaded.spools[0]!.name).toBe("Before");
});
