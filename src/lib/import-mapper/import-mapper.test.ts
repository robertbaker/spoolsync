import { beforeEach, expect, test } from "bun:test";

import { loadSpoolmanFile } from "@spoolsync/core/adapters/spoolman/file-load";

import {
  convertToSpoolmanCsv,
  parseFlag,
  parseHexColor,
  parseLooseNumber,
  parseSourceTable,
  sampleValues,
} from "./convert";
import {
  headerSignature,
  mappingForHeaders,
  normalizeHeader,
  suggestMapping,
  validateMapping,
  type ColumnMapping,
} from "./fields";
import { dryRunConversion } from "./report";
import {
  COLUMN_MAPS_KEY,
  MAX_SAVED_MAPS,
  forgetColumnMapping,
  readColumnMaps,
  readSavedMapping,
  sanitizeColumnMaps,
  saveColumnMapping,
} from "./store";

beforeEach(() => localStorage.clear());

const SHEET = [
  "Brand,Type,Colour,Colour hex,Weight (g),Net weight,Price,Shelf,Notes,Finished,Other",
  "Prusament,PLA,Galaxy Black,#1a1a1a,640,1000,24.99,A1,first,no,",
  'eSun,PETG,Red,f00,150,1000,"1.234,50",B2,=HYPERLINK(),yes,',
  ",,,,,,,,,,unmapped",
  "Polymaker,,,zzz,abc,1000,-3,,,maybe,",
  ",,,,,,,C3,only a shelf,,",
].join("\n");

const MAPPING: ColumnMapping = {
  vendor: "Brand",
  material: "Type",
  name: "Colour",
  color: "Colour hex",
  remainingWeight: "Weight (g)",
  initialWeight: "Net weight",
  price: "Price",
  location: "Shelf",
  comment: "Notes",
  archived: "Finished",
};

test("column names are guessed, once per field and once per column", () => {
  const table = parseSourceTable(SHEET);
  const mapping = suggestMapping(table.headers, table.rows);
  expect(mapping).toMatchObject({
    vendor: "Brand",
    material: "Type",
    name: "Colour",
    color: "Colour hex",
    remainingWeight: "Weight (g)",
    initialWeight: "Net weight",
    price: "Price",
    location: "Shelf",
    comment: "Notes",
    archived: "Finished",
  });
  const used = Object.values(mapping);
  expect(new Set(used).size).toBe(used.length);
  expect(normalizeHeader("Remaining (g)")).toBe("remainingg");
  expect(suggestMapping(["Weight (g)"])).toEqual({ remainingWeight: "Weight (g)" });
  expect(suggestMapping(["foo", "bar"])).toEqual({});
});

test("a layout is recognised again whatever the column order or case", () => {
  const a = headerSignature(["Brand", "Type", "Weight"]);
  expect(headerSignature(["weight", " BRAND ", "type"])).toBe(a);
  expect(headerSignature(["Brand", "Type"])).not.toBe(a);
  expect(headerSignature(["Brand", "Type", "Weight2"])).not.toBe(a);
  expect(a).toMatch(/^\d+-[0-9a-f]{8}$/);
});

test("a mapping needs an identifying column, real headers, and one field per header", () => {
  const headers = ["Brand", "Weight"];
  expect(validateMapping({ vendor: "Brand", remainingWeight: "Weight" }, headers).problems).toEqual([]);
  expect(validateMapping({ remainingWeight: "Weight" }, headers).problems).toEqual([
    { kind: "identity" },
  ]);
  expect(validateMapping({ vendor: "Nope" }, headers).problems).toContainEqual({
    kind: "missing",
    header: "Nope",
  });
  const duplicate = validateMapping({ vendor: "Brand", material: "Brand" }, headers);
  expect(duplicate.problems).toContainEqual({
    kind: "duplicate",
    header: "Brand",
    fields: ["vendor", "material"],
  });
  expect(validateMapping({ vendor: "Brand" }, headers).notes).toContain("no-weight");
  expect(
    validateMapping({ vendor: "Brand", remainingWeight: "Weight", usedWeight: "Weight" }, headers)
      .notes,
  ).toContain("both-weights");
  expect(mappingForHeaders({ vendor: "Brand", material: "Gone" }, headers)).toEqual({
    vendor: "Brand",
  });
});

test("numbers are read the way people write them", () => {
  expect(parseLooseNumber("24.99")).toBe(24.99);
  expect(parseLooseNumber("$20")).toBe(20);
  expect(parseLooseNumber("20 €")).toBe(20);
  expect(parseLooseNumber("850 g")).toBe(850);
  expect(parseLooseNumber("1.234,50")).toBe(1234.5);
  expect(parseLooseNumber("1,234.50")).toBe(1234.5);
  expect(parseLooseNumber("12,5")).toBe(12.5);
  expect(parseLooseNumber("0,125")).toBe(0.125);
  expect(parseLooseNumber("1,234")).toBe(1234);
  expect(parseLooseNumber("1 234,5")).toBe(1234.5);
  expect(parseLooseNumber("1.234.567")).toBe(1234567);
  expect(parseLooseNumber("-3")).toBe(-3);
  expect(parseLooseNumber("1e3")).toBeNull();
  expect(parseLooseNumber("abc")).toBeNull();
  expect(parseLooseNumber("12 abc 3")).toBeNull();
  expect(parseLooseNumber("")).toBeNull();
  expect(parseLooseNumber("-")).toBeNull();
});

test("colors and flags", () => {
  expect(parseHexColor("#1a1a1a")).toBe("1A1A1A");
  expect(parseHexColor("f00")).toBe("FF0000");
  expect(parseHexColor("0xFF8800")).toBe("FF8800");
  expect(parseHexColor("#FF8800CC")).toBe("FF8800");
  expect(parseHexColor("red")).toBeNull();
  expect(parseHexColor("12345")).toBeNull();
  expect(parseFlag("Yes")).toBe(true);
  expect(parseFlag("")).toBe(false);
  expect(parseFlag("no")).toBe(false);
  expect(parseFlag("maybe")).toBeNull();
});

test("CSV files are read with their headers, trimming cells, and bad files are rejected", () => {
  const table = parseSourceTable("﻿A ; B\n 1 ; x \n2;y\n".replace(/ ; /g, ";"));
  expect(table.kind).toBe("csv");
  expect(table.headers).toEqual(["A", "B"]);
  expect(table.rows.map((row) => row["B"])).toEqual(["x", "y"]);
  expect(() => parseSourceTable("")).toThrow("empty");
  expect(() => parseSourceTable("A,B\n")).toThrow("no rows");
  expect(() => parseSourceTable("A,A\n1,2")).toThrow("duplicate");
  expect(() => parseSourceTable("A,\n1,2")).toThrow("unnamed");
  expect(() => parseSourceTable('A,B\n"1,2')).toThrow("quote");
  expect(() => parseSourceTable("{not json")).toThrow("not valid JSON");
});

test("JSON lists and wrapped lists are flattened to dotted columns", () => {
  const table = parseSourceTable(
    JSON.stringify({
      meta: { version: 1 },
      spools: [
        { brand: "A", filament: { color: "#FF0000", tags: ["x", "y"] }, grams: 10 },
        { brand: "B", extra: null },
        "not a record",
        [1, 2],
      ],
    }),
  );
  expect(table.kind).toBe("json");
  expect(table.rows).toHaveLength(2);
  expect(table.headers).toEqual(["brand", "filament.color", "filament.tags", "grams", "extra"]);
  expect(table.rows[0]!["filament.tags"]).toBe("x; y");
  expect(table.rows[1]!["grams"]).toBe("");
  expect(parseSourceTable('[{"a":1}]').rows[0]!["a"]).toBe("1");
  expect(() => parseSourceTable('{"a":1}')).toThrow("no list of records");
  expect(() => parseSourceTable("[]")).toThrow("no records");
  // A header named like an object prototype member is only a name.
  const odd = parseSourceTable('[{"__proto__x":"1","constructor":"c"}]');
  expect(odd.rows[0]!["constructor"]).toBe("c");
});

test("conversion makes a file the Spoolman importer loads, with every value accounted for", () => {
  const table = parseSourceTable(SHEET);
  const conversion = convertToSpoolmanCsv(table, MAPPING, { weightUnit: "g" });
  expect(conversion.rowsRead).toBe(5);
  expect(conversion.spoolCount).toBe(3);
  expect(conversion.sourceRows).toEqual([1, 2, 4]);
  // Row 3 has nothing in a mapped column; row 5 has only a shelf and a note, so it cannot be told apart.
  expect(conversion.skipped.map((item) => item.row)).toEqual([3, 5]);
  expect(conversion.skipped[0]!.reason).toBe("Every mapped column is empty.");
  const loaded = loadSpoolmanFile(conversion.csv);
  expect(loaded.warnings).toEqual([]);
  expect(loaded.spools.map((spool) => spool.vendor)).toEqual(["Prusament", "eSun", "Polymaker"]);
  const first = loaded.spools[0]!;
  expect(first).toMatchObject({
    material: "PLA",
    name: "Galaxy Black",
    colors: ["1A1A1A"],
    remainingWeight: 640,
    initialWeight: 1000,
    price: 24.99,
    location: "A1",
    archived: false,
  });
  expect(loaded.spools[1]).toMatchObject({ colors: ["FF0000"], price: 1234.5, archived: true });
  // The formula-looking note survives the spreadsheet escape round trip.
  expect(loaded.spools[1]!.comment).toBe("=HYPERLINK()");
  const reasons = conversion.changed.map((item) => `${item.row}: ${item.reason}`);
  expect(reasons).toContain('4: color "zzz" is not a hex color; ignored.');
  expect(reasons).toContain('4: remaining weight "abc" is not a number; left empty.');
  expect(reasons).toContain("4: price is negative; left empty.");
  expect(reasons).toContain('4: archived "maybe" is not yes or no; treated as not archived.');
});

test("the identity rule skips rows with no brand, material or name", () => {
  const table = parseSourceTable("Brand,Type,Shelf\n,,C3\nA,,\n");
  const conversion = convertToSpoolmanCsv(table, { vendor: "Brand", material: "Type", location: "Shelf" }, { weightUnit: "g" });
  expect(conversion.skipped.map((item) => item.row)).toEqual([1]);
  expect(conversion.skipped[0]!.reason).toContain("No brand, material, or name");
  expect(conversion.spoolCount).toBe(1);
});

test("weights are converted from the file's unit to grams", () => {
  const table = parseSourceTable("Brand,Left,Full\nA,0.5,1\nB,10,35.27\n");
  const mapping: ColumnMapping = { vendor: "Brand", remainingWeight: "Left", initialWeight: "Full" };
  const kg = loadSpoolmanFile(convertToSpoolmanCsv(table, mapping, { weightUnit: "kg" }).csv);
  expect(kg.spools.map((spool) => spool.remainingWeight)).toEqual([500, 10000]);
  const oz = loadSpoolmanFile(convertToSpoolmanCsv(table, mapping, { weightUnit: "oz" }).csv);
  expect(oz.spools[0]!.remainingWeight).toBeCloseTo(14.17, 1);
  const lb = loadSpoolmanFile(convertToSpoolmanCsv(table, mapping, { weightUnit: "lb" }).csv);
  expect(lb.spools[0]!.initialWeight).toBeCloseTo(453.59, 1);
});

test("used weight becomes remaining weight only with a full spool weight", () => {
  const table = parseSourceTable("Brand,Used,Full\nA,250,1000\nB,250,\nC,1500,1000\n");
  const conversion = convertToSpoolmanCsv(
    table,
    { vendor: "Brand", usedWeight: "Used", initialWeight: "Full" },
    { weightUnit: "g" },
  );
  const loaded = loadSpoolmanFile(conversion.csv);
  expect(loaded.spools.map((spool) => spool.remainingWeight)).toEqual([750, null, 0]);
  expect(conversion.changed.map((item) => item.row)).toEqual([2, 3]);
});

test("remaining weight wins when a row also has used weight", () => {
  const table = parseSourceTable("Brand,Left,Used,Full\nA,900,500,1000\n");
  const conversion = convertToSpoolmanCsv(
    table,
    { vendor: "Brand", remainingWeight: "Left", usedWeight: "Used", initialWeight: "Full" },
    { weightUnit: "g" },
  );
  expect(loadSpoolmanFile(conversion.csv).spools[0]!.remainingWeight).toBe(900);
});

test("a spool with several colors keeps them, and filaments and vendors share ids", () => {
  const table = parseSourceTable("Brand,Name,Hex\nA,Rainbow,\"#FF0000, 00ff00\"\nA,Rainbow,\"#FF0000, 00ff00\"\na,Other,#000\n");
  const conversion = convertToSpoolmanCsv(
    table,
    { vendor: "Brand", name: "Name", color: "Hex" },
    { weightUnit: "g" },
  );
  const rows = conversion.csv.trim().split(/\r\n/).slice(1);
  const filamentIds = rows.map((row) => row.split(",")[9]);
  expect(filamentIds).toEqual(["1", "1", "2"]);
  const loaded = loadSpoolmanFile(conversion.csv);
  expect(loaded.spools[0]!.colors).toEqual(["FF0000", "00FF00"]);
  // "A" and "a" are the same vendor.
  expect(conversion.csv).toContain(",1,A,");
});

test("an invalid mapping never produces a file", () => {
  const table = parseSourceTable(SHEET);
  expect(() => convertToSpoolmanCsv(table, { price: "Price" }, { weightUnit: "g" })).toThrow(
    "problems",
  );
  expect(() => convertToSpoolmanCsv(table, { vendor: "Missing" }, { weightUnit: "g" })).toThrow();
});

test("the dry run names problems by the row of the original file", () => {
  const table = parseSourceTable(SHEET);
  const conversion = convertToSpoolmanCsv(table, MAPPING, { weightUnit: "g" });
  const { report, result } = dryRunConversion(conversion, "sheet.csv");
  expect(result.spools).toHaveLength(3);
  expect(report.source).toBe("spoolman");
  expect(report.fileName).toBe("sheet.csv");
  expect(report.rowsRead).toBe(5);
  expect(report.spoolsLoaded).toBe(3);
  expect(report.skipped.map((item) => item.location)).toEqual(["Row 3", "Row 5"]);
  expect(report.changed.map((item) => item.row)).toEqual(expect.arrayContaining([4]));
  expect(report.unknownWeight).toBe(1);
});

test("a dry run of a file where nothing converts reports every row skipped", () => {
  const table = parseSourceTable("Brand,Weight\n,\n,\n");
  const conversion = convertToSpoolmanCsv(
    table,
    { vendor: "Brand", remainingWeight: "Weight" },
    { weightUnit: "g" },
  );
  expect(conversion.spoolCount).toBe(0);
  const { report } = dryRunConversion(conversion, null);
  expect(report.spoolsLoaded).toBe(0);
  expect(report.skipped).toHaveLength(2);
});

test("sample values are distinct, trimmed, and capped", () => {
  const table = parseSourceTable("A\nx\nx\n\ny\nz\nw\n");
  expect(sampleValues(table, "A")).toEqual(["x", "y", "z"]);
  expect(sampleValues(table, "Missing")).toEqual([]);
});

test("mappings are remembered per layout, validated, and capped", () => {
  const signature = headerSignature(["Brand", "Type"]);
  expect(readSavedMapping(signature)).toBeNull();
  expect(saveColumnMapping(signature, { vendor: "Brand", material: "Type" }, "oz")).toBe(true);
  expect(readSavedMapping(signature)).toMatchObject({
    mapping: { vendor: "Brand", material: "Type" },
    unit: "oz",
  });
  forgetColumnMapping(signature);
  expect(readSavedMapping(signature)).toBeNull();
  expect(localStorage.getItem(COLUMN_MAPS_KEY)).toBeNull();
  expect(saveColumnMapping("not-a-signature", { vendor: "Brand" }, "g")).toBe(false);

  for (let index = 0; index < MAX_SAVED_MAPS + 5; index++)
    saveColumnMapping(
      headerSignature([`Column ${index}`]),
      { vendor: `Column ${index}` },
      "g",
      new Date(Date.UTC(2026, 0, 1) + index * 1000),
    );
  const maps = readColumnMaps();
  expect(Object.keys(maps)).toHaveLength(MAX_SAVED_MAPS);
  // The oldest were dropped.
  expect(maps[headerSignature(["Column 0"])]).toBeUndefined();
  expect(maps[headerSignature([`Column ${MAX_SAVED_MAPS + 4}`])]).toBeDefined();
});

test("damaged or hostile stored mappings are cleaned or dropped", () => {
  const good = headerSignature(["Brand"]);
  const clean = sanitizeColumnMaps({
    [good]: {
      mapping: { vendor: "Brand", bogus: "x", material: 7, name: "" , price: "p".repeat(500) },
      unit: "stone",
      savedAt: "2026-01-01T00:00:00Z",
    },
    "1-zzzzzzzz": { mapping: { vendor: "x" }, savedAt: "2026-01-01T00:00:00Z" },
    [headerSignature(["Other"])]: { mapping: {}, savedAt: "2026-01-01T00:00:00Z" },
    [headerSignature(["Third"])]: { mapping: { vendor: "x" }, savedAt: "yesterday" },
  });
  expect(Object.keys(clean)).toEqual([good]);
  expect(clean[good]).toEqual({
    mapping: { vendor: "Brand" },
    unit: "g",
    savedAt: "2026-01-01T00:00:00.000Z",
  });
  expect(sanitizeColumnMaps("nope")).toEqual({});
  expect(sanitizeColumnMaps([1, 2])).toEqual({});
  localStorage.setItem(COLUMN_MAPS_KEY, "{broken");
  expect(readColumnMaps()).toEqual({});
});
