import { expect, test } from "bun:test";

import { loadBambuddyApi } from "@spoolsync/core/adapters/bambuddy";
import { loadSpoolmanFile, unflatten } from "@spoolsync/core/adapters/spoolman/file";
import { loadInventoryFile } from "@spoolsync/core/workflow";

import { csvText, parseRows } from "../../packages/spoolsync-core/src/adapters/shared/tabular";

test("Bambuddy API imports include archived spools so they are not mistaken for missing inventory", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = Object.assign(
    async (input: string | URL | Request) => {
      const url = new URL(String(input));
      expect(url.searchParams.get("include_archived")).toBe("true");
      return new Response(
        JSON.stringify([{ id: 1, material: "PLA", archived_at: "2026-01-01T00:00:00Z" }]),
        {
          headers: { "Content-Type": "application/json" },
        },
      );
    },
    { preconnect: original.preconnect },
  );
  try {
    const result = await loadBambuddyApi({ baseUrl: "https://bambuddy.test", apiKey: "test" });
    expect(result.spools[0]).toMatchObject({ sourceId: "1", archived: true });
  } finally {
    globalThis.fetch = original;
  }
});

test("Bambuddy canonicalizes numeric IDs and rejects duplicates and invalid explicit CSV IDs", async () => {
  expect(
    (await loadInventoryFile("bambuddy", '[{"id":"01","material":"PLA"}]')).spools[0]?.sourceId,
  ).toBe("1");
  expect((await loadInventoryFile("bambuddy", "id,material\n0,PLA\n")).spools[0]?.sourceId).toBe(
    "0",
  );
  for (const text of [
    '[{"id":1,"material":"PLA"},{"id":"01","material":"PLA"}]',
    "id,material\n1,PLA\n01,PLA\n",
  ])
    await expect(loadInventoryFile("bambuddy", text)).rejects.toThrow(
      "Duplicate Bambuddy record ID",
    );
  for (const id of ["invalid", "1.5", "-1", "9007199254740992"]) {
    await expect(loadInventoryFile("bambuddy", `id,material\n${id},PLA`)).rejects.toThrow(
      "invalid ID",
    );
    await expect(
      loadInventoryFile("bambuddy", JSON.stringify([{ id, material: "PLA" }])),
    ).rejects.toThrow("invalid record");
  }
});

test("Spoolman database files receive an actionable error before CSV parsing", async () => {
  await expect(
    loadInventoryFile("spoolman", "SQLite format 3\0binary database contents"),
  ).rejects.toThrow("Export your spool inventory from Spoolman as JSON or CSV");
});

test("TigerTag UID-keyed exports cannot wrap arrays as inventory records", async () => {
  for (const value of [[], [{ name: "Not a record" }]]) {
    await expect(
      loadInventoryFile("tigertag", JSON.stringify({ TigerData_bad: value })),
    ).rejects.toThrow("not a TigerTag file");
  }
});

test("3DFilamentProfiles rejects malformed nested properties before updates can disappear", async () => {
  for (const spool_properties of [[], ["price"], "not an object", 12, false]) {
    await expect(
      loadInventoryFile(
        "threeDfp",
        JSON.stringify([{ short_code: "one", brand: "Test", spool_properties }]),
      ),
    ).rejects.toThrow("spool_properties must be a JSON object or null");
  }
  expect(
    (
      await loadInventoryFile(
        "threeDfp",
        '[{"short_code":"one","brand":"Test","spool_properties":null}]',
      )
    ).spools,
  ).toHaveLength(1);
});

test("TigerTag rejects duplicate UIDs before grouping can discard conflicting records", async () => {
  const records = [
    { uid: "TigerData_sample", name: "Original" },
    { uid: "TigerData_sample", name: "Conflicting" },
  ];
  for (const text of [
    JSON.stringify(records),
    JSON.stringify({
      format: "tigertag",
      kind: "ttag",
      version: 1,
      records,
    }),
  ]) {
    await expect(loadInventoryFile("tigertag", text)).rejects.toThrow(
      "Duplicate TigerTag record UID",
    );
  }
  const twins = await loadInventoryFile(
    "tigertag",
    JSON.stringify([
      { uid: "A", twin_tag_uid: "B", name: "Original" },
      { uid: "B", twin_tag_uid: "A", name: "Original" },
    ]),
  );
  expect(twins.spools).toHaveLength(1);
});

test("Spoolman decodes formula protection only in CSV, preserving literal JSON apostrophes", () => {
  const record = { id: 1, "filament.id": 1, "filament.name": "'+Literal", comment: "'=Literal" };
  const json = loadSpoolmanFile(JSON.stringify([record]));
  expect(json.spools[0]).toMatchObject({ name: "'+Literal", comment: "'=Literal" });
  const csv = loadSpoolmanFile("id,filament.id,filament.name,comment\n1,1,'+Literal,'=Literal");
  expect(csv.spools[0]).toMatchObject({ name: "+Literal", comment: "=Literal" });
});

test("CSV export retains columns that appear only on later rows", () => {
  const csv = csvText([
    { brand: "First" },
    { brand: "Second", notes: 'A comma, a quote " and\na newline', custom_field: "kept" },
  ]);
  expect(parseRows(csv)).toEqual([
    { brand: "First", notes: "", custom_field: "" },
    { brand: "Second", notes: 'A comma, a quote " and\na newline', custom_field: "kept" },
  ]);
});

test("Spoolman CSV rejects damaged tables before interpreting spool fields", () => {
  expect(() => loadSpoolmanFile("id,filament.id\n1,2,unexpected")).toThrow("Could not read CSV");
  expect(() => loadSpoolmanFile("id,filament.id,id\n1,2,3")).toThrow("duplicate column names");
});

test("Spoolman flattened columns cannot write into object prototypes", () => {
  for (const column of [
    "__proto__.spoolsyncTest",
    "constructor.prototype.spoolsyncTest",
    "filament.__proto__.spoolsyncTest",
  ]) {
    expect(() => unflatten({ filament: {}, [column]: "polluted" })).toThrow(
      "Unsupported Spoolman export column",
    );
  }
  const result = unflatten({ "filament.id": 1 });
  expect(Object.getPrototypeOf(result)).toBeNull();
  expect(Object.prototype.hasOwnProperty.call(Object.prototype, "spoolsyncTest")).toBe(false);
});

test("Spoolman reads mixed JSON row shapes and reports conflicting flat columns", () => {
  const result = loadSpoolmanFile(
    JSON.stringify([
      { id: 1, filament: { id: 10, name: "Nested" } },
      { id: 2, "filament.id": 20, "filament.name": "Flat" },
      { id: 3, filament: "invalid", "filament.id": 30 },
    ]),
  );
  expect(result.spools.map((spool) => spool.name)).toEqual(["Nested", "Flat"]);
  expect(result.warnings).toHaveLength(1);
  expect(result.warnings[0]).toContain("Conflicting Spoolman export columns");
});

test("3DFilamentProfiles rejects unrelated CSV columns and nested JSON arrays", async () => {
  await expect(loadInventoryFile("threeDfp", "first_name,last_name\nAda,Lovelace")).rejects.toThrow(
    "spool columns",
  );
  await expect(loadInventoryFile("threeDfp", '[{"brand":"Test"},[]]')).rejects.toThrow(
    "expected a JSON list",
  );
});

test("CSV rejects malformed quoting and mismatched row lengths", () => {
  for (const csv of [
    'filament,brand\n"Unclosed,Test',
    "filament,brand\nPLA,Test,unexpected",
    "filament,brand\nPLA,Test\nPETG",
  ])
    expect(() => parseRows(csv)).toThrow("Could not read CSV");
});

test("CSV rejects duplicate normalized headers and unnamed columns", () => {
  expect(() => parseRows("Color Name,color-name\nRed,Blue")).toThrow("duplicate column names");
  expect(() => parseRows("filament,\nPLA,Test")).toThrow("unnamed column");
});

test("CSV still supports single columns, semicolons, quoted newlines, and BOMs", () => {
  expect(parseRows("filament\nPLA\nPETG")).toEqual([{ filament: "PLA" }, { filament: "PETG" }]);
  expect(parseRows('\uFEFFfilament;comments\r\nPLA;"First line\nSecond; line"\r\n')).toEqual([
    { filament: "PLA", comments: "First line\nSecond; line" },
  ]);
});

test("CSV honors spreadsheet delimiter declarations without treating them as headers", () => {
  for (const delimiter of [",", ";", "\t", "|"]) {
    expect(
      parseRows(`\uFEFFsep=${delimiter}\r\nfilament${delimiter}brand\r\nPLA${delimiter}Test`),
    ).toEqual([{ filament: "PLA", brand: "Test" }]);
  }
  expect(parseRows('sep=;\nfilament;comments\nPLA;"A comma, and\na newline"')).toEqual([
    { filament: "PLA", comments: "A comma, and\na newline" },
  ]);
});

test("Spoolman CSV accepts spreadsheet delimiter declarations", () => {
  const loaded = loadSpoolmanFile("sep=;\nid;filament.id;filament.name\n1;2;Example");
  expect(loaded.spools[0]?.name).toBe("Example");
});

test("Bambuddy accepts JSON arrays and empty JSON inventories", async () => {
  const result = await loadInventoryFile(
    "bambuddy",
    JSON.stringify([{ id: 7, material: "PLA", brand: "Test" }]),
  );
  expect(result.spools[0]).toMatchObject({ sourceId: "7", material: "PLA", vendor: "Test" });
  expect((await loadInventoryFile("bambuddy", "[]")).spools).toEqual([]);
});

test("Bambuddy CSV decodes the source app's formula protection without stripping ordinary apostrophes", async () => {
  const loaded = await loadInventoryFile(
    "bambuddy",
    "material,brand,color_name,note\nPLA,'+Brand,'Blue,'=test\n",
  );
  expect(loaded.spools[0]).toMatchObject({ vendor: "+Brand", name: "'Blue", comment: "=test" });
});

test("3DFilamentProfiles rejects HueForge exports instead of misreading colors and names", async () => {
  for (const text of [
    "Brand, Type, Color, Name, TD, Tags, Secondary_Type, Secondary_Color, Secondary_Strength, Owned, Uuid\nTest,PLA,#123456,Blue,0.3,,None,#0000ff,0,true,{example}",
    JSON.stringify({ Filaments: [{ Brand: "Test", Type: "PLA", Color: "#123456", Name: "Blue" }] }),
  ]) {
    await expect(loadInventoryFile("threeDfp", text)).rejects.toThrow("HueForge");
  }
});

test("Bambuddy rejects malformed JSON records instead of silently dropping them", async () => {
  for (const invalid of [null, [], { material: "PLA" }, { id: "invalid" }]) {
    await expect(
      loadInventoryFile("bambuddy", JSON.stringify({ spools: [{ id: 1 }, invalid] })),
    ).rejects.toThrow("invalid record");
  }
});
