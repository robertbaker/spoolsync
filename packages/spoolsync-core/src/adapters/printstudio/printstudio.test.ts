import { expect, test } from "bun:test";

import { loadPrintStudioApi, loadPrintStudioFile } from ".";
import type { FieldChange, PlannedChange } from "../../core/compare";
import { matchSpools } from "../../core/match";
import { makeSpool } from "../../core/testing";
import { applyToPrintStudio } from "./apply";
import { PrintStudioClient } from "./client";
import { createFakePrintStudio } from "./fake-server";
import { createPayload } from "./payload";
import type { PrintStudioLot } from "./types";

const lots = (): PrintStudioLot[] => [
  {
    id: "spoolman-7",
    code: "pla",
    family: "filament",
    label: "Polymaker PLA Jade",
    brand: "Polymaker",
    material: "PLA",
    colorName: "Jade",
    quantityOnHand: 640,
    unit: "g",
    unitCostUsd: 0.02,
    sourceSystem: "spoolman",
    reorderPoint: 200,
    appearance: { colors: ["#1A2B3C"], pattern: "solid", effects: [] },
    futureField: { keep: true },
  },
  {
    id: "local-aa",
    code: "petg",
    family: "filament",
    label: "Prusa PETG Orange",
    brand: "Prusa",
    material: "PETG",
    colorName: "Orange",
    quantityOnHand: 900,
    unit: "g",
    unitCostUsd: 0.025,
    sourceSystem: "local",
    reorderPoint: 100,
    appearance: { colors: ["#FF8800"], pattern: "solid", effects: ["matte"] },
  },
  {
    id: "lot-resin",
    code: "resin",
    family: "ink",
    label: "Resin",
    quantityOnHand: 500,
    unit: "ml",
    unitCostUsd: 0.04,
    sourceSystem: "inventree",
    reorderPoint: 0,
  },
  {
    id: "spoolstock-1",
    code: "pla",
    family: "filament",
    label: "Bare lot",
    quantityOnHand: 100,
    unit: "g",
    unitCostUsd: 0.01,
    sourceSystem: "spoolstock_pro",
    reorderPoint: 0,
  },
];

const fakeServer = () => createFakePrintStudio(lots());

const connection = { baseUrl: "http://127.0.0.1:8787/", operatorId: "web-ops" };

test("PrintStudio lots map to spools, keeping unknowns unknown and the raw lot whole", () => {
  const result = loadPrintStudioFile(JSON.stringify(lots()));
  expect(result.spools.map((spool) => spool.sourceId)).toEqual([
    "spoolman-7",
    "local-aa",
    "spoolstock-1",
  ]);
  const [spoolman, local, bare] = result.spools;
  expect(spoolman).toMatchObject({
    vendor: "Polymaker",
    material: "PLA",
    name: "Jade",
    colors: ["1A2B3C"],
    remainingWeight: 640,
    initialWeight: null,
    price: null,
    archived: false,
  });
  expect(spoolman!.crossIds).toEqual({ printstudioId: "spoolman-7", spoolmanId: 7 });
  expect((spoolman!.raw as PrintStudioLot)["futureField"]).toEqual({ keep: true });
  expect(local!.crossIds).toEqual({ printstudioId: "local-aa" });
  expect(bare).toMatchObject({ vendor: null, material: null, name: null, colors: [] });
  expect(result.warnings).toEqual([
    "PrintStudio lot lot-resin: skipped because it is ink counted in ml; only filament counted in grams maps to a spool.",
  ]);
});

test("only Spoolman-sourced spoolman-<id> lots carry a Spoolman id", () => {
  const result = loadPrintStudioFile(
    JSON.stringify([
      { ...lots()[1], id: "spoolman-9" },
      { ...lots()[0], id: "spoolman-abc" },
    ]),
  );
  expect(result.spools.map((spool) => spool.crossIds.spoolmanId)).toEqual([undefined, undefined]);
});

test("PrintStudio files accept a wrapper and reject invalid or duplicate records", () => {
  expect(loadPrintStudioFile(JSON.stringify({ materials: lots() })).spools).toHaveLength(3);
  expect(() => loadPrintStudioFile("nope")).toThrow("not valid PrintStudio JSON");
  expect(() => loadPrintStudioFile("{}")).toThrow("did not contain a material lot list");
  expect(() => loadPrintStudioFile('[{"family":"filament"}]')).toThrow("invalid record");
  expect(() => loadPrintStudioFile('[{"id":"a"},{"id":"a"}]')).toThrow("Duplicate PrintStudio lot");
});

test("API loading sends the operator id, drops the trailing slash and records the connection", async () => {
  const server = fakeServer();
  const result = await loadPrintStudioApi(connection, server.fetchImpl);
  expect(result.origin).toBe("api");
  expect(result.connectionId).toBe("http://127.0.0.1:8787");
  expect(result.spools).toHaveLength(3);
  expect(server.requests).toEqual([{ method: "GET", path: "/materials" }]);
});

test("API loading explains a refused operator id and bad connection values", async () => {
  await expect(
    loadPrintStudioApi({ ...connection, operatorId: "nope" }, fakeServer().fetchImpl),
  ).rejects.toThrow("PrintStudio answered 403: Forbidden. Check the operator id.");
  expect(() => new PrintStudioClient({ ...connection, operatorId: " " })).toThrow("operator id");
  expect(() => new PrintStudioClient({ ...connection, baseUrl: "ftp://x" })).toThrow("http://");
  expect(() => new PrintStudioClient({ ...connection, baseUrl: "http://u:p@x" })).toThrow(
    "credentials",
  );
});

test("Spoolman spools match PrintStudio's imported lots by spoolmanId", () => {
  const spoolman = { spools: [makeSpool("spoolman", "7")] };
  const printstudio = loadPrintStudioFile(JSON.stringify(lots()));
  const groups = matchSpools([...spoolman.spools, ...printstudio.spools]).groups;
  const group = groups.find((entry) => entry.members.printstudio?.sourceId === "spoolman-7");
  expect(group?.members.spoolman?.sourceId).toBe("7");
});

const loadedSpools = () => loadPrintStudioFile(JSON.stringify(lots())).spools;
const update = (sourceId: string, changes: FieldChange[]): PlannedChange => ({
  kind: "update",
  source: "printstudio",
  groupId: `group-${sourceId}`,
  spool: loadedSpools().find((spool) => spool.sourceId === sourceId)!,
  changes,
  links: {},
});

test("updates to a local lot keep its other fields and adjust stock for the new weight", async () => {
  const server = fakeServer();
  const client = new PrintStudioClient(connection, server.fetchImpl);
  const log = await applyToPrintStudio(client, [
    update("local-aa", [
      { field: "vendor", from: "Prusa", to: "Prusament" },
      { field: "colors", from: ["FF8800"], to: ["FF0000"] },
      { field: "remainingWeight", from: 900, to: 750 },
    ]),
  ]);
  expect(log).toEqual([
    {
      groupId: "group-local-aa",
      ok: true,
      message: "Updated lot local-aa: brand, color, remaining (g)",
    },
  ]);
  expect(server.requests.slice(1)).toEqual([
    {
      method: "PUT",
      path: "/api/materials/local-aa",
      body: {
        code: "petg",
        family: "filament",
        label: "Prusament PETG Orange",
        brand: "Prusament",
        material: "PETG",
        colorName: "Orange",
        unit: "g",
        unitCostUsd: 0.025,
        reorderPoint: 100,
        appearance: { colors: ["#FF0000"], pattern: "solid", effects: ["matte"] },
      },
    },
    {
      method: "POST",
      path: "/materials/local-aa/adjust-stock",
      body: { quantityDelta: -150, reason: "Synced by SpoolSync" },
    },
  ]);
  expect(server.store.get("local-aa")).toMatchObject({ quantityOnHand: 750, brand: "Prusament" });
});

test("clearing a brand goes through the details route because a PUT keeps omitted fields", async () => {
  const server = fakeServer();
  await applyToPrintStudio(new PrintStudioClient(connection, server.fetchImpl), [
    update("local-aa", [{ field: "vendor", from: "Prusa", to: null }]),
  ]);
  expect(server.requests.map((request) => `${request.method} ${request.path}`).slice(1)).toEqual([
    "PUT /api/materials/local-aa",
    "PATCH /api/materials/local-aa/details",
  ]);
  expect(server.store.get("local-aa")?.["brand"]).toBeUndefined();
});

test("lots owned by another sync are refused and never written", async () => {
  const server = fakeServer();
  const log = await applyToPrintStudio(new PrintStudioClient(connection, server.fetchImpl), [
    update("spoolman-7", [{ field: "remainingWeight", from: 640, to: 100 }]),
    update("spoolstock-1", [{ field: "vendor", from: null, to: "X" }]),
  ]);
  expect(log.map((entry) => entry.ok)).toEqual([false, false]);
  expect(log[0]!.message).toContain("managed by PrintStudio's spoolman sync");
  expect(log[1]!.message).toContain("spoolstock_pro sync");
  expect(server.requests.filter((request) => request.method !== "GET")).toEqual([]);
});

test("updates PrintStudio cannot store are refused with the spool named", async () => {
  const server = fakeServer();
  const log = await applyToPrintStudio(new PrintStudioClient(connection, server.fetchImpl), [
    update("local-aa", [{ field: "location", from: null, to: "Shelf" }]),
    update("local-aa", [{ field: "name", from: "Orange", to: null }]),
  ]).catch((error: Error) => error);
  // Two updates to one lot in a batch are refused up front.
  expect(log).toBeInstanceOf(Error);
  const single = await applyToPrintStudio(new PrintStudioClient(connection, server.fetchImpl), [
    update("local-aa", [{ field: "location", from: null, to: "Shelf" }]),
  ]);
  expect(single[0]).toMatchObject({ ok: false });
  expect(single[0]!.message).toContain("PrintStudio has no place for location");
  const name = await applyToPrintStudio(new PrintStudioClient(connection, server.fetchImpl), [
    update("local-aa", [{ field: "name", from: "Orange", to: null }]),
  ]);
  expect(name[0]!.message).toContain("cannot clear a color name");
});

test("creating makes a local lot with a derived code, label, cost and gradient pattern", async () => {
  const server = fakeServer();
  const spool = makeSpool("spoolman", "1", {
    vendor: "Sunlu",
    material: "PLA+2.0",
    name: "Grey Blue",
    colors: ["636767", "0000FF"],
    initialWeight: 1000,
    remainingWeight: 800,
    price: 20,
  });
  const change: PlannedChange = {
    kind: "create",
    source: "printstudio",
    groupId: "g1",
    values: spool,
    links: {},
    groupIds: {},
  };
  const log = await applyToPrintStudio(new PrintStudioClient(connection, server.fetchImpl), [
    change,
  ]);
  expect(log[0]).toMatchObject({ ok: true });
  expect(log[0]!.message).toContain("Created local lot local-1");
  expect(server.requests.at(-1)!.body).toEqual({
    code: "pla-2-0",
    family: "filament",
    label: "Sunlu PLA+2.0 Grey Blue",
    brand: "Sunlu",
    material: "PLA+2.0",
    colorName: "Grey Blue",
    quantityOnHand: 800,
    unit: "g",
    unitCostUsd: 0.02,
    reorderPoint: 0,
    appearance: { colors: ["#636767", "#0000FF"], pattern: "gradient" },
  });
  expect(server.store.get("local-1")?.sourceSystem).toBe("local");
});

test("a create with unknown weights and no colors says what it assumed", () => {
  const plan = createPayload(
    makeSpool("spoolman", "2", {
      vendor: null,
      material: null,
      name: null,
      colors: [],
      remainingWeight: null,
      initialWeight: null,
      price: 5,
    }),
    "PrintStudio X",
  );
  expect(plan.payload).toMatchObject({ code: "filament", label: "Filament", quantityOnHand: 0 });
  expect(plan.payload["appearance"]).toBeUndefined();
  expect(plan.notes.join(" ")).toContain("weight is unknown");
  expect(plan.notes.join(" ")).toContain("price was not written");
});

test("a batch that is not for PrintStudio is refused before anything is written", async () => {
  const server = fakeServer();
  await expect(
    applyToPrintStudio(new PrintStudioClient(connection, server.fetchImpl), [
      { ...update("local-aa", []), source: "bambuddy" } as unknown as PlannedChange,
    ]),
  ).rejects.toThrow("Cannot apply bambuddy changes to a printstudio target");
  expect(server.requests).toEqual([]);
});

test("the import file holds new lots only, reads back, and warns about omitted updates", async () => {
  const { exportPrintStudio } = await import("./export");
  const create: PlannedChange = {
    kind: "create",
    source: "printstudio",
    groupId: "g1",
    values: makeSpool("spoolman", "1", {
      vendor: "Sunlu",
      material: "PLA",
      name: "Grey",
      colors: ["636767"],
      remainingWeight: 500,
    }),
    links: {},
    groupIds: {},
  };
  const result = exportPrintStudio([
    create,
    update("local-aa", [{ field: "remainingWeight", from: 900, to: 1 }]),
  ]);
  expect(result.created).toBe(1);
  expect(result.warnings.join(" ")).toContain("1 planned update was omitted");
  const file = JSON.parse(result.json) as { materials: Array<Record<string, unknown>> };
  expect(file.materials[0]).toMatchObject({
    code: "pla",
    family: "filament",
    quantityOnHand: 500,
    unit: "g",
  });
  const reloaded = loadPrintStudioFile(result.json);
  expect(reloaded.spools[0]).toMatchObject({ vendor: "Sunlu", name: "Grey", remainingWeight: 500 });
});
