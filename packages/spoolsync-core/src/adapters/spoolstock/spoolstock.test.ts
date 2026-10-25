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
    expect(parseSpoolstockCsv("short_id\n")).toEqual({ records: [], warnings: [] });
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
    const { records, warnings } = parseSpoolstockCsv("name,weight\nfoo,1\n");
    expect(records).toEqual([]);
    expect(warnings[0]).toContain("short_id");
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
      comment: "Opened for K2",
      archived: false,
    });
    expect(silk).toMatchObject({
      colors: ["5B2A86", "000000"],
      archived: true,
      initialWeight: null,
    });
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
