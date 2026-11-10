import { describe, expect, test } from "bun:test";

import { loadSpoolstockCsv, parseSpoolstockCsv } from ".";

const csv = await Bun.file(new URL("./fixtures/export.csv", import.meta.url)).text();

describe("parseSpoolstockCsv", () => {
  test("rejects damaged CSV before interpreting inventory values", () => {
    for (const text of [
      "short_id,size\nabc,1000,extra",
      "short_id,size\nabc",
      'short_id,notes\nabc,"unfinished',
      "short_id,short_id\nabc,def",
      "short_id,\nabc,1000",
    ]) {
      expect(() => parseSpoolstockCsv(text)).toThrow("CSV");
    }
  });

  test("accepts header-only, single-column, and delimiter-declared inventories", () => {
    expect(parseSpoolstockCsv("short_id\n")).toEqual({
      records: [],
      warnings: [],
    });
    expect(parseSpoolstockCsv("short_id\nabc\n")).toEqual({
      records: [{ short_id: "abc" }],
      warnings: [],
    });
    expect(parseSpoolstockCsv("\uFEFFsep=;\r\nshort_id;size\r\nabc;1000")).toEqual({
      records: [{ short_id: "abc", size: "1000" }],
      warnings: [],
    });
  });

  test("reads quoted, multiline fields from a real export", () => {
    const { records, warnings } = parseSpoolstockCsv(csv);
    expect(warnings).toEqual([]);
    expect(records).toHaveLength(2);
    expect(records[0]?.short_id).toBe("410e5312");
    expect(records[0]?.["filament.material.description"]).toBe("PLA description\nwith a newline");
  });

  test("tolerates a byte-order mark and CRLF line endings", () => {
    const { records } = parseSpoolstockCsv(`﻿${csv.replaceAll("\n", "\r\n")}`);
    expect(records.map((record) => record.short_id)).toEqual(["410e5312", "dup00001"]);
  });

  test("rejects a file that is not a Spoolstock export", () => {
    expect(() => parseSpoolstockCsv("name,weight\nfoo,1\n")).toThrow("short_id");
  });

  test("flags rows without a short_id instead of failing the file", () => {
    const { records, warnings } = parseSpoolstockCsv("short_id,size\nabc,1000\n,500\n");
    expect(records).toHaveLength(1);
    expect(warnings).toEqual(["Row 3: short_id is empty"]);
  });
});

describe("loadSpoolstockCsv", () => {
  test("maps rows to common spools", () => {
    const { spools } = loadSpoolstockCsv(csv);
    const [black, silk] = spools;
    expect(black).toMatchObject({
      source: "spoolstock",
      sourceId: "410e5312",
      crossIds: { spoolstockShortId: "410e5312" },
      vendor: "Anycubic",
      material: "PLA",
      name: "Black",
      colors: ["000000"],
      diameter: 1.75,
      density: 1.25,
      nozzleTempMin: 180,
      nozzleTempMax: 220,
      bedTempMin: null,
      bedTempMax: 70,
      upc: "AHPLBK-105",
      initialWeight: 1000,
      remainingWeight: 875,
      emptySpoolWeight: 140,
      price: 12,
      purchasedOn: "2025-05-06",
      comment: "Opened for K2\n\nFilament notes: Reliable spool",
      finish: null,
      archived: false,
    });
    expect(silk).toMatchObject({
      colors: ["5B2A86", "000000"],
      archived: true,
      initialWeight: null,
    });
  });

  test("reads a price of 0 as not set", () => {
    const { spools } = loadSpoolstockCsv("short_id,size,price\nabc,1000,0\ndef,1000,5\n");
    expect(spools.map((spool) => spool.price)).toEqual([null, 5]);
  });

  test("keeps the first row when a short_id repeats", () => {
    const lines = csv.trimEnd().split("\n");
    const duplicated = `${[...lines, lines.at(-1)].join("\n")}\n`;
    const result = loadSpoolstockCsv(duplicated);
    expect(result.spools).toHaveLength(2);
    expect(result.warnings).toEqual([
      "Spool dup00001 appears more than once; using the first row.",
    ]);
  });
});

describe("finish and filament notes", () => {
  const load = (row: Record<string, string>) => {
    const headers = ["short_id", ...Object.keys(row)];
    const values = ["abc", ...Object.values(row)].map(
      (value) => `"${value.replaceAll('"', '""')}"`,
    );
    return loadSpoolstockCsv(`${headers.join(",")}\n${values.join(",")}\n`).spools[0]!;
  };

  test("joins filament features into the finish", () => {
    expect(load({ "filament.features": '["Metallic","Silk"]' }).finish).toBe("Metallic, Silk");
    expect(load({ "filament.features": '["Multicolor ", "Matte"]' }).finish).toBe(
      "Matte, Multicolor",
    );
    // Spellings and order are the common ones, so other services' words compare equal.
    expect(load({ "filament.features": '["UV Glow","Matt","Gradient/Multicolor"]' }).finish).toBe(
      "Glow In the Dark, Gradient/Multicolor, Matte",
    );
    expect(load({ "filament.features": '["Silk","Matte"]' }).finish).toBe("Matte, Silk");
    expect(load({ "filament.features": "[]" }).finish).toBeNull();
    expect(load({ "filament.features": "Matte" }).finish).toBe("Matte");
    // product_family is a product line ("Ender PLA"), not a finish.
    expect(load({ "filament.product_family": "Matte PLA" }).finish).toBeNull();
  });

  test("appends filament notes after the spool notes", () => {
    expect(load({ notes: "Mine", "filament.notes": "Dries well" }).comment).toBe(
      "Mine\n\nFilament notes: Dries well",
    );
    expect(load({ "filament.notes": "Dries well" }).comment).toBe("Filament notes: Dries well");
    expect(load({ notes: "Mine" }).comment).toBe("Mine");
    expect(load({ notes: "Mine", "filament.notes": " " }).comment).toBe("Mine");
  });
});

describe("parseSpoolstockCsv without a short_id column", () => {
  test("throws instead of returning an empty list", () => {
    expect(() => parseSpoolstockCsv("size,brand\n1000,Acme\n")).toThrow(/no short_id column/);
    expect(() => loadSpoolstockCsv("size,brand\n1000,Acme\n")).toThrow(/no short_id column/);
  });
});

describe("empty spool weight", () => {
  test("a known zero tare is kept and a blank one is unset", () => {
    const weight = (value: string) =>
      loadSpoolstockCsv(`short_id,empty_spool.weight\nabc,${value}\n`).spools[0]!.emptySpoolWeight;
    expect(weight("0")).toBe(0);
    expect(weight("")).toBeNull();
    expect(weight("160")).toBe(160);
  });
});
