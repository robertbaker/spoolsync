import { describe, expect, test } from "bun:test";

import { exportTtag, loadTtag, type TigertagRaw } from ".";
import { buildPlan } from "../../core/compare";
import { matchSpools } from "../../core/match";
import { makeSpool } from "../../core/testing";
import { brandId, materialId } from "./reference";

const text = await Bun.file(new URL("./fixtures/studio.ttag", import.meta.url)).text();

test("TigerTag comment limits preserve complete Unicode characters", () => {
  const group = matchSpools([makeSpool("spoolman", "1", { comment: "x" + "🧵".repeat(500) })])
    .groups[0]!;
  const creates = buildPlan(
    [group],
    new Map([[group.id, { values: {}, createIn: ["tigertag"] }]]),
  ).get("tigertag")!;
  const output = exportTtag(loadTtag("{}"), creates);
  expect(loadTtag(output.json).spools[0]!.comment).toBe("x" + "🧵".repeat(499));
});

test("TigerTag does not report truncation for Unicode notes within the character limit", () => {
  const group = matchSpools([makeSpool("spoolman", "1", { comment: "🧵".repeat(300) })]).groups[0]!;
  const creates = buildPlan(
    [group],
    new Map([[group.id, { values: {}, createIn: ["tigertag"] }]]),
  ).get("tigertag")!;
  const output = exportTtag(loadTtag("{}"), creates);
  expect(output.warnings).toEqual([]);
  expect(loadTtag(output.json).spools[0]!.comment).toBe("🧵".repeat(300));
});

test("TigerTag distinguishes an unknown brand from the literal brand name Generic", () => {
  for (const vendor of [null, "Generic"]) {
    const group = matchSpools([makeSpool("spoolman", "1", { vendor })]).groups[0]!;
    const creates = buildPlan(
      [group],
      new Map([[group.id, { values: {}, createIn: ["tigertag"] }]]),
    ).get("tigertag")!;
    const output = exportTtag(loadTtag("{}"), creates);
    expect(loadTtag(output.json).spools[0]!.vendor).toBe(vendor);
  }
});

describe("reference lookups", () => {
  test("match brands and materials loosely", () => {
    expect(brandId("Anycubic")).toBe(15962);
    expect(brandId("Unheard Of")).toBe(65535);
    expect(materialId("PLA-Silk")).toBe(10602);
    expect(materialId("PLA")).toBe(38219);
    expect(materialId("PLA+ Silk")).toBe(8345);
    expect(materialId("PLA+")).toBe(46591);
  });
});

describe("loadTtag", () => {
  test("pairs twins, resolves reference ids, skips non-filament and deleted records", () => {
    const result = loadTtag(text);
    expect(result.spools).toHaveLength(2);
    expect(result.warnings).toEqual([
      "Record TigerData_resin is not a filament (type 173); skipped.",
    ]);
    const [twin, chipless] = result.spools.sort((a, b) => a.sourceId.localeCompare(b.sourceId));
    expect(twin).toMatchObject({
      sourceId: "04A1B2C3D4E5F6",
      crossIds: { tigertagUid: "04A1B2C3D4E5F6" },
      vendor: "Anycubic",
      material: "PLA",
      name: "Black",
      colors: ["000000"],
      diameter: 1.75,
      nozzleTempMin: 190,
      nozzleTempMax: 230,
      bedTempMin: 50,
      upc: "6971234567890",
      initialWeight: 1000,
      remainingWeight: 870,
      emptySpoolWeight: 140,
    });
    expect((twin!.raw as TigertagRaw).records).toHaveLength(2);
    expect(chipless).toMatchObject({
      crossIds: { tigertagUid: "TigerData_abc123", spoolmanId: 52 },
      vendor: "Mika 3D",
      colors: ["FF9753", "000001"],
      nozzleTempMin: null,
      initialWeight: 250,
    });
  });

  test("warns when Studio would import as copies", () => {
    const file = JSON.parse(text);
    delete file.exportedBy;
    expect(loadTtag(JSON.stringify(file)).warnings.some((w) => w.includes("new copies"))).toBe(
      true,
    );
  });

  test("rejects other files", () => {
    expect(() => loadTtag('{"format":"other"}')).toThrow(/not a TigerTag/);
    expect(() =>
      loadTtag('{"format":"tigertag","kind":"ttag","version":2,"records":[{"uid":"x"}]}'),
    ).toThrow();
  });
});

describe("exportTtag", () => {
  test("writes changed twins whole, new chipless records, and keeps exportedBy and backups", () => {
    const loaded = loadTtag(text);
    const twin = loaded.spools.find((s) => s.sourceId === "04A1B2C3D4E5F6")!;
    const spoolman = makeSpool("spoolman", "51", {
      crossIds: { spoolmanId: 51, tigertagUid: "04A1B2C3D4E5F6" },
      vendor: "Anycubic",
      material: "PLA",
      name: "Black",
      colors: ["000000"],
      remainingWeight: 800,
    });
    const extra = makeSpool("spoolman", "77", {
      crossIds: { spoolmanId: 77 },
      vendor: "Prusament",
      material: "PETG",
      name: "Galaxy Black Silk",
      colors: ["1A1A1A", "FFFFFF"],
      initialWeight: 1000,
      remainingWeight: null,
    });
    const { groups } = matchSpools([...loaded.spools, spoolman, extra]);
    const linked = groups.find((g) => g.members.tigertag === twin)!;
    const single = groups.find((g) => g.members.spoolman === extra)!;
    const plan = buildPlan(
      groups,
      new Map([
        [linked.id, { values: { remainingWeight: 800, comment: "Opened" }, createIn: [] }],
        [single.id, { values: {}, createIn: ["tigertag"] }],
      ]),
    );
    const result = exportTtag(loaded, plan.get("tigertag")!);
    expect(result).toMatchObject({ updated: 1, created: 1, records: 3, restoresInPlace: true });

    const file = JSON.parse(result.json);
    expect(file).toMatchObject({
      format: "tigertag",
      kind: "ttag",
      version: 1,
      exportedBy: "acct_123",
    });
    expect(file.rfidBackups).toEqual({ "04A1B2C3D4E5F6": { pages: "deadbeef" } });
    const [a, b, added] = file.records;
    for (const record of [a, b]) {
      expect(record).toMatchObject({
        weight_available: 800,
        message: "Opened",
        spoolmanId: 51,
        id_tigertag: 3155151767,
      });
    }
    expect(added.uid).toMatch(/^TigerData_[0-9a-f]{32}$/);
    expect(added).toMatchObject({
      id_type: 142,
      id_brand: 46392,
      id_material: 38256,
      id_aspect1: 92,
      id_unit: 21,
      measure: 1000,
      weight_available: 1000,
      color_r: 0x1a,
      color_r2: 255,
      data1: 56,
      id_product: 0xffffffff,
      spoolmanId: 77,
    });
    expect(added.id_tigertag).toBeUndefined();

    // The file reads back with the same values.
    const reread = loadTtag(result.json).spools.find((s) => s.sourceId === added.uid);
    expect(reread).toMatchObject({
      vendor: "Prusament",
      colors: ["1A1A1A", "FFFFFF"],
      crossIds: { spoolmanId: 77 },
    });
  });
});

test("loadTtag accepts a bare JSON list of records", () => {
  const records = JSON.parse(text).records;
  const result = loadTtag(JSON.stringify(records));
  expect(result.spools).toHaveLength(2);
  expect(result.warnings.some((w) => w.includes("new copies"))).toBe(true);
});

test("reads Studio Settings exports, including an empty account", async () => {
  const actual = await Bun.file(new URL("./fixtures/studio-settings.json", import.meta.url)).text();
  expect(loadTtag(actual).spools[0]).toMatchObject({
    sourceId: "TigerData_2816981665",
    vendor: "Polymaker",
    material: "PLA",
    name: "Purple",
    initialWeight: 1000,
    remainingWeight: 1000,
  });
  expect(loadTtag("{}")).toMatchObject({ spools: [], warnings: [] });
  expect(loadTtag('{"format":"tigertag","kind":"ttag","version":1,"records":[]}').spools).toEqual(
    [],
  );
});

test("pairs a one-way twin regardless of uid ordering", () => {
  const loaded = loadTtag(
    JSON.stringify([
      { uid: "A", id_type: 142 },
      { uid: "B", id_type: 142, twin_tag_uid: "A" },
    ]),
  );
  expect(loaded.spools).toHaveLength(1);
  expect((loaded.spools[0]!.raw as TigertagRaw).records).toHaveLength(2);
});

test("replacing or clearing a barcode removes stale aliases; black secondary colours survive", () => {
  const loaded = loadTtag(text);
  const spool = loaded.spools[0]!;
  const change = {
    kind: "update" as const,
    source: "tigertag" as const,
    groupId: "test",
    spool,
    changes: [{ field: "upc" as const, from: spool.upc, to: "new-sku" }],
    links: {},
  };
  expect(loadTtag(exportTtag(loaded, [change]).json).spools[0]?.upc).toBe("new-sku");
  const output = exportTtag(loaded, [
    {
      ...change,
      changes: [
        { field: "upc", from: spool.upc, to: null },
        { field: "colors", from: spool.colors, to: ["FF0000", "000000"] },
      ],
    },
  ]);
  expect(loadTtag(output.json).spools[0]).toMatchObject({
    upc: null,
    colors: ["FF0000", "000000"],
  });
});
