import { expect, test } from "bun:test";

import type { PlannedUpdate } from "../../core/compare";
import { makeSpool } from "../../core/testing";
import { applyToTigertagCloud, loadTigertagCloud, type TigertagInventoryClient } from "./cloud";

const twinChange = (spool: PlannedUpdate["spool"]): PlannedUpdate => ({
  kind: "update",
  source: "tigertag",
  groupId: "twin",
  spool: {
    ...spool,
    raw: {
      records: [
        { uid: "chip_a", __docId: "doc-a", color_name: "Before" },
        { uid: "chip_b", __docId: "doc-b", color_name: "Before" },
      ],
    },
  },
  changes: [{ field: "name", from: "Before", to: "After" }],
  links: {},
});

async function twinSpool(writeDocument: TigertagInventoryClient["writeDocument"]) {
  const client: TigertagInventoryClient = {
    uid: "test-account",
    async listInventory() {
      return [{ uid: "chip_a", __docId: "doc-a", color_name: "Before" }];
    },
    writeDocument,
  };
  return { client, spool: (await loadTigertagCloud(client)).spools[0]! };
}

test("a twin writes the chip it loads from last, so a failure can be finished later", async () => {
  const written: string[] = [];
  const { client, spool } = await twinSpool(async (id) => {
    written.push(id);
  });
  const log = await applyToTigertagCloud(client, [twinChange(spool)]);
  expect(log[0]!.ok).toBe(true);
  expect(written).toEqual(["doc-b", "doc-a"]);
});

test("a twin that fails on its first chip is reported as half saved", async () => {
  const { client, spool } = await twinSpool(async (id) => {
    if (id === "doc-a") throw new Error("server error");
  });
  const log = await applyToTigertagCloud(client, [twinChange(spool)]);
  expect(log[0]!.ok).toBe(false);
  expect(log[0]!.message).toContain("One chip was saved; sync again to finish the other.");
});

test("a failure before any chip is saved does not claim one was", async () => {
  const { client, spool } = await twinSpool(async () => {
    throw new Error("server error");
  });
  const log = await applyToTigertagCloud(client, [twinChange(spool)]);
  expect(log[0]!.message).not.toContain("One chip was saved");
});

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

test("cloud writes report the same aspect warnings as the .ttag export", async () => {
  const client: TigertagInventoryClient = {
    uid: "test-account",
    async listInventory() {
      return [{ uid: "CLOUD_one", __docId: "document-one", color_name: "Before" }];
    },
    async writeDocument() {},
  };
  const loaded = await loadTigertagCloud(client);
  const update = (to: string): PlannedUpdate => ({
    kind: "update",
    source: "tigertag",
    groupId: "one",
    spool: loaded.spools[0]!,
    changes: [{ field: "finish", from: null, to }],
    links: {},
  });
  const apply = async (to: string) => (await applyToTigertagCloud(client, [update(to)]))[0]!;
  const odd = await apply("Plaid, Matte");
  const many = await apply("Matte, Silk, Glitter");
  const fine = await apply("Matte, Silk");
  expect(odd.ok).toBe(true);
  expect(odd.message).toContain("finish Plaid has no TigerTag aspect, so it was not exported.");
  expect(many.message).toContain(
    "only two aspects fit in a record; 1 finish word(s) were left out.",
  );
  expect(fine.message).not.toContain("aspect");
  const created = await applyToTigertagCloud(client, [
    {
      kind: "create",
      source: "tigertag",
      groupId: "new",
      groupIds: {},
      links: {},
      values: { ...makeSpool("spoolman", "1", { name: "New", finish: "Plaid" }) },
    },
  ]);
  expect(created[0]!.message).toContain("Plaid has no TigerTag aspect");
});
