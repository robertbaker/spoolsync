import { expect, test } from "bun:test";

import { exportFiladex, loadFiladexFile } from ".";
import type { PlannedChange } from "../../core/compare";
import { applyToFiladex, type FiladexWriteClient } from "./apply";

test("Filadex applies a changed field through a narrow client without transport internals", async () => {
  const record = {
    id: "one",
    material: "PLA",
    colorName: "Before",
    manufacturer: "Keep",
  };
  const loaded = loadFiladexFile(JSON.stringify([record]));
  const patches: Array<{
    id: string | number;
    payload: Record<string, unknown>;
  }> = [];
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

test("Filadex create sends density and catalog flags, and file export carries density", async () => {
  const values = {
    vendor: "Acme",
    material: "PETG",
    name: "Teal",
    colors: ["00AAAA"],
    diameter: 1.75,
    density: 1.27,
    nozzleTempMin: null,
    nozzleTempMax: null,
    initialWeight: 1000,
    remainingWeight: 500,
    price: null,
    location: null,
    upc: null,
    purchasedOn: null,
  };
  const change = {
    kind: "create",
    source: "filadex",
    groupId: "g1",
    values,
    links: {},
    groupIds: {},
  } as unknown as PlannedChange;
  const sent: Array<Record<string, unknown>> = [];
  const client: FiladexWriteClient = {
    async listFilaments() {
      return [];
    },
    async updateFilament() {},
    async createFilament(payload) {
      sent.push(payload);
      return { id: 3 };
    },
  };
  const log = await applyToFiladex(client, [change]);
  expect(log[0]!.ok).toBe(true);
  expect(sent[0]).toMatchObject({
    density: "1.27",
    saveManufacturer: true,
    saveMaterial: true,
    totalWeight: "1",
    remainingPercentage: "50",
  });

  const loaded = loadFiladexFile("[]");
  const out = exportFiladex(loaded, [change]);
  expect(JSON.parse(out.json)[0]).toMatchObject({ density: "1.27" });
  expect(out.csv).not.toContain("density");
});

test("Filadex update leaves density and unrelated fields out of the patch", async () => {
  const record = {
    id: "one",
    material: "PLA",
    colorName: "A",
    density: "1.24",
    status: "opened",
  };
  const loaded = loadFiladexFile(JSON.stringify([record]));
  expect(loaded.spools[0]!.density).toBe(1.24);
  const patches: Array<Record<string, unknown>> = [];
  const client: FiladexWriteClient = {
    async listFilaments() {
      return [record];
    },
    async updateFilament(_id, payload) {
      patches.push(payload);
    },
    async createFilament() {
      throw new Error("Unexpected creation");
    },
  };
  await applyToFiladex(client, [
    {
      kind: "update",
      source: "filadex",
      groupId: "one",
      spool: loaded.spools[0]!,
      changes: [{ field: "name", from: "A", to: "B" }],
      links: {},
    },
  ]);
  expect(patches).toEqual([{ colorName: "B" }]);
});

test("Filadex create always sends colorName and warns about invented weight and diameter", async () => {
  const change = {
    kind: "create",
    source: "filadex",
    groupId: "g2",
    values: {
      vendor: "Acme",
      material: "PLA",
      name: null,
      colors: [],
      diameter: null,
      nozzleTempMin: null,
      nozzleTempMax: null,
      initialWeight: null,
      remainingWeight: null,
      price: null,
      location: null,
      upc: null,
      purchasedOn: null,
    },
    links: {},
    groupIds: {},
  } as unknown as PlannedChange;
  const sent: Array<Record<string, unknown>> = [];
  const client: FiladexWriteClient = {
    async listFilaments() {
      return [];
    },
    async updateFilament() {},
    async createFilament(payload) {
      sent.push(payload);
      return { id: 4 };
    },
  };
  const log = await applyToFiladex(client, [change]);
  expect(log[0]!.ok).toBe(true);
  expect(sent[0]).toHaveProperty("colorName", "");
  expect(JSON.stringify(log)).toContain("weights are unknown");
  expect(JSON.stringify(log)).toContain("diameter was unknown");
});
