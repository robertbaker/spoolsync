import { expect, test } from "bun:test";

import type { FieldChange, PlannedChange } from "../../core/compare";
import { makeSpool } from "../../core/testing";
import { applyToBambuddy } from "./apply";
import { BambuddyClient, type BambuddyWriteClient } from "./client";
import { loadBambuddyFile } from "./load";
import type { BambuddySpool, BambuddySpoolPayload } from "./types";

const records: BambuddySpool[] = [
  {
    id: 4,
    material: "PLA",
    subtype: "Matte",
    brand: "Polymaker",
    color_name: "Jade",
    rgba: "1A2B3C80",
    extra_colors: "",
    effect_type: "silk",
    category: "Production",
    low_stock_threshold_pct: 15,
    label_weight: 1000,
    core_weight: 250,
    weight_used: 200,
    cost_per_kg: 20,
    material_number: "15",
    storage_location: "Shelf A",
    note: "first",
    archived_at: null,
  },
  {
    id: 5,
    material: "PETG",
    label_weight: 1000,
    weight_used: 0,
    archived_at: "2026-01-01T00:00:00",
  },
];

type Call = [string, ...unknown[]];

/** Records every call and can fail chosen ones; stands in for the HTTP transport. */
function fakeClient(failures: Record<string, string> = {}) {
  const calls: Call[] = [];
  const fail = (name: string) => {
    if (failures[name]) throw new Error(failures[name]);
  };
  const client: BambuddyWriteClient = {
    baseUrl: "https://bambuddy.test",
    async listSpools() {
      return structuredClone(records);
    },
    async usesSpoolman() {
      return false;
    },
    async createSpool(payload: BambuddySpoolPayload) {
      calls.push(["create", payload]);
      fail("create");
      return { ...payload, id: 50, material: String(payload["material"]) };
    },
    async updateSpool(id, payload) {
      calls.push(["update", id, payload]);
      fail("update");
      return { id, material: "PLA" };
    },
    async archiveSpool(id) {
      calls.push(["archive", id]);
      fail("archive");
      return { id, material: "PLA" };
    },
    async restoreSpool(id) {
      calls.push(["restore", id]);
      fail("restore");
      return { id, material: "PLA" };
    },
  };
  return { client, calls };
}

const loaded = () => loadBambuddyFile(JSON.stringify(records));
const update = (id: number, changes: FieldChange[]): PlannedChange => ({
  kind: "update",
  source: "bambuddy",
  groupId: `group-${id}`,
  spool: loaded().spools.find((spool) => spool.sourceId === String(id))!,
  changes,
  links: {},
});
const create = (
  overrides: Parameters<typeof makeSpool>[2] = {},
  groupId = "new",
): PlannedChange => ({
  kind: "create",
  source: "bambuddy",
  groupId,
  values: makeSpool("bambuddy", "x", overrides),
  links: {},
  groupIds: {},
});

test("Bambuddy weight writes keep the spool's weight lock as it was", async () => {
  const { client, calls } = fakeClient();
  await applyToBambuddy(client, [update(4, [{ field: "remainingWeight", from: 800, to: 500 }])]);
  expect(calls[0]).toEqual(["update", 4, { weight_used: 500, weight_locked: false }]);
});

test("Bambuddy writes are refused while its inventory lives in Spoolman", async () => {
  const { client, calls } = fakeClient();
  client.usesSpoolman = async () => true;
  await expect(
    applyToBambuddy(client, [update(4, [{ field: "remainingWeight", from: 800, to: 500 }])]),
  ).rejects.toThrow("Connect SpoolSync to Spoolman");
  expect(calls).toEqual([]);
});

test("Bambuddy maps subtype to finish and material_number to lotNr", () => {
  const [spool] = loaded().spools;
  expect(spool).toMatchObject({
    finish: "Matte",
    lotNr: "15",
    purchasedOn: null,
  });
  expect(spool!.crossIds).toEqual({ bambuddyId: 4 });
});

test("Bambuddy updates send only the moved fields and leave Bambuddy-only fields alone", async () => {
  const { client, calls } = fakeClient();
  const log = await applyToBambuddy(client, [
    update(4, [
      { field: "remainingWeight", from: 800, to: 650 },
      { field: "finish", from: "Matte", to: "Silk" },
      { field: "lotNr", from: "15", to: null },
      { field: "location", from: "Shelf A", to: "Shelf B" },
      { field: "comment", from: "first", to: "second" },
      { field: "emptySpoolWeight", from: 250, to: 220 },
    ]),
  ]);
  expect(log).toHaveLength(1);
  expect(log[0]).toMatchObject({ ok: true, groupId: "group-4" });
  expect(calls).toEqual([
    [
      "update",
      4,
      {
        weight_used: 350,
        weight_locked: false,
        subtype: "Silk",
        material_number: null,
        storage_location: "Shelf B",
        note: "second",
        core_weight: 220,
      },
    ],
  ]);
});

test("Bambuddy colour updates send exactly eight hex characters and keep the stored alpha", async () => {
  const { client, calls } = fakeClient();
  await applyToBambuddy(client, [
    update(4, [{ field: "colors", from: ["1A2B3C"], to: ["1A2B3C", "ff0000", "00FF00"] }]),
  ]);
  expect(calls).toEqual([["update", 4, { extra_colors: "FF0000,00FF00" }]]);
  const changed = fakeClient();
  await applyToBambuddy(changed.client, [
    update(4, [{ field: "colors", from: ["1A2B3C"], to: ["abcdef"] }]),
  ]);
  const payload = changed.calls[0]![2] as BambuddySpoolPayload;
  expect(payload["rgba"]).toBe("ABCDEFFF");
  expect(String(payload["rgba"])).toMatch(/^[0-9A-F]{8}$/);
});

test("Bambuddy keeps the spool price when the label weight changes", async () => {
  const { client, calls } = fakeClient();
  await applyToBambuddy(client, [
    update(4, [
      { field: "initialWeight", from: 1000, to: 500 },
      { field: "remainingWeight", from: 800, to: 400 },
    ]),
  ]);
  expect(calls).toEqual([
    ["update", 4, { label_weight: 500, weight_used: 100, weight_locked: false, cost_per_kg: 40 }],
  ]);
});

test("Bambuddy updates skip values the server already has", async () => {
  const { client, calls } = fakeClient();
  const log = await applyToBambuddy(client, [
    update(4, [{ field: "finish", from: "Basic", to: "matte" }]),
  ]);
  expect(calls).toEqual([]);
  expect(log[0]!.ok).toBe(true);
});

test("Bambuddy archives and restores through their own endpoints", async () => {
  const { client, calls } = fakeClient();
  const log = await applyToBambuddy(client, [
    update(4, [{ field: "archived", from: false, to: true }]),
    update(5, [{ field: "archived", from: true, to: false }]),
  ]);
  expect(log.every((entry) => entry.ok)).toBe(true);
  expect(calls).toEqual([
    ["archive", 4],
    ["restore", 5],
  ]);
});

test("Bambuddy creates spools with every mapped field, then archives when asked", async () => {
  const { client, calls } = fakeClient();
  const progress: number[] = [];
  const log = await applyToBambuddy(
    client,
    [
      create({
        vendor: "Polymaker",
        material: "PETG",
        name: "Jade",
        colors: ["1A2B3C", "FF0000"],
        nozzleTempMin: 220,
        nozzleTempMax: 250,
        initialWeight: 1000,
        remainingWeight: 750,
        emptySpoolWeight: 230,
        location: "Shelf C",
        price: 18,
        lotNr: " 77 ",
        finish: "Silk",
        comment: "note",
        archived: true,
      }),
    ],
    (done) => progress.push(done),
  );
  expect(log[0]).toMatchObject({ ok: true });
  expect(log[0]!.message).toContain("Created spool 50");
  expect(calls).toEqual([
    [
      "create",
      {
        material: "PETG",
        brand: "Polymaker",
        color_name: "Jade",
        subtype: "Silk",
        material_number: "77",
        note: "note",
        storage_location: "Shelf C",
        nozzle_temp_min: 220,
        nozzle_temp_max: 250,
        core_weight: 230,
        rgba: "1A2B3CFF",
        extra_colors: "FF0000",
        label_weight: 1000,
        weight_used: 250,
        cost_per_kg: 18,
      },
    ],
    ["archive", 50],
  ]);
  expect(progress).toEqual([1]);
});

test("Bambuddy creation omits empty values and notes what it assumed", async () => {
  const { client, calls } = fakeClient();
  const log = await applyToBambuddy(client, [
    create({
      material: null,
      name: null,
      vendor: null,
      colors: [],
      initialWeight: null,
      remainingWeight: null,
      price: 12,
    }),
  ]);
  expect(calls).toEqual([["create", { material: "PLA" }]]);
  expect(log[0]!.message).toContain("material was unknown");
  expect(log[0]!.message).toContain("price was not written");
});

test("Bambuddy creation refuses values the schema rejects", async () => {
  const { client, calls } = fakeClient();
  const log = await applyToBambuddy(client, [
    create({ lotNr: "x".repeat(65) }),
    create({ initialWeight: 1000.5, remainingWeight: 500 }, "fractional"),
  ]);
  expect(calls).toEqual([]);
  expect(log.map((entry) => entry.ok)).toEqual([false, false]);
  expect(log[0]!.message).toContain("at most 64 characters");
  expect(log[1]!.message).toContain("whole number");
});

test("Bambuddy applies the remaining changes after a failure and reports partial writes", async () => {
  const { client, calls } = fakeClient({ archive: "Bambuddy answered 500." });
  const log = await applyToBambuddy(client, [
    update(4, [
      { field: "comment", from: "first", to: "again" },
      { field: "archived", from: false, to: true },
    ]),
    create({ name: "After" }, "after"),
  ]);
  expect(log.map((entry) => entry.ok)).toEqual([false, true]);
  expect(log[0]!.message).toContain("Failed on spool 4");
  expect(log[0]!.message).toContain("Its other fields were saved");
  expect(calls.map((call) => call[0])).toEqual(["update", "archive", "create"]);
});

test("Bambuddy reports a create whose archive step failed", async () => {
  const { client } = fakeClient({ archive: "nope" });
  const log = await applyToBambuddy(client, [create({ archived: true })]);
  expect(log[0]!.ok).toBe(false);
  expect(log[0]!.message).toContain("created without its archived state");
});

test("Bambuddy never writes to a record whose ID came from a CSV row number", async () => {
  const csv = loadBambuddyFile("material,brand,color_name\nPLA,Acme,Red\n");
  expect(csv.spools[0]!.sourceId).toBe("1");
  expect(csv.spools[0]!.crossIds).toEqual({});
  const { client, calls } = fakeClient();
  const log = await applyToBambuddy(client, [
    {
      kind: "update",
      source: "bambuddy",
      groupId: "csv",
      spool: csv.spools[0]!,
      changes: [{ field: "name", from: "Red", to: "Blue" }],
      links: {},
    },
  ]);
  expect(calls).toEqual([]);
  expect(log[0]!.ok).toBe(false);
  expect(log[0]!.message).toContain("no Bambuddy ID");
});

test("Bambuddy keeps explicit CSV IDs and fails updates for spools that disappeared", async () => {
  const csv = loadBambuddyFile("id,material,subtype,material_number\n9,PLA,Silk,L1\n");
  expect(csv.spools[0]).toMatchObject({
    finish: "Silk",
    lotNr: "L1",
    crossIds: { bambuddyId: 9 },
  });
  const { client, calls } = fakeClient();
  const log = await applyToBambuddy(client, [
    {
      kind: "update",
      source: "bambuddy",
      groupId: "gone",
      spool: csv.spools[0]!,
      changes: [{ field: "finish", from: "Silk", to: "Matte" }],
      links: {},
    },
  ]);
  expect(calls).toEqual([]);
  expect(log[0]!.message).toContain("no longer exists");
});

test("Bambuddy client sends the API key and JSON to the inventory endpoints", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const client = new BambuddyClient(
    { baseUrl: "https://bambuddy.test/", apiKey: "test-key" },
    async (url, init) => {
      requests.push({ url, init });
      return Response.json({ id: 8, material: "PLA" });
    },
  );
  await client.createSpool({ material: "PLA" });
  await client.updateSpool(8, { note: null });
  await client.archiveSpool(8);
  await client.restoreSpool(8);
  expect(requests.map((request) => `${request.init?.method} ${request.url}`)).toEqual([
    "POST https://bambuddy.test/api/v1/inventory/spools",
    "PATCH https://bambuddy.test/api/v1/inventory/spools/8",
    "POST https://bambuddy.test/api/v1/inventory/spools/8/archive",
    "POST https://bambuddy.test/api/v1/inventory/spools/8/restore",
  ]);
  expect(requests[0]!.init).toMatchObject({
    headers: { "X-API-Key": "test-key", "Content-Type": "application/json" },
    body: '{"material":"PLA"}',
  });
  expect(requests[1]!.init!.body).toBe('{"note":null}');
  expect(requests[2]!.init!.headers).toEqual({ "X-API-Key": "test-key" });
  expect(requests[2]!.init!.body).toBeUndefined();
});

test("Bambuddy client explains a key without the inventory scope and shows validation detail", async () => {
  const respond = (status: number, body: unknown) =>
    new BambuddyClient({ baseUrl: "https://bambuddy.test", apiKey: "k" }, async () =>
      Response.json(body, { status }),
    );
  expect(respond(403, { detail: "API key lacks permission" }).createSpool({})).rejects.toThrow(
    /answered 403: API key lacks permission\. The API key may not change the inventory\..*can_manage_inventory/,
  );
  expect(respond(401, { detail: "Invalid API key" }).archiveSpool(1)).rejects.toThrow(
    /rejected the API key/,
  );
  expect(
    respond(422, {
      detail: [{ loc: ["body", "rgba"], msg: "String should match pattern" }],
    }).updateSpool(1, {}),
  ).rejects.toThrow("answered 422: rgba: String should match pattern");
});
