import { expect, test } from "bun:test";

import Papa from "papaparse";

import type { LoadResult } from "../core/model";
import { makeSpool } from "../core/testing";
import { loadInventoryFile } from "./load";
import { buildImportReport, importReportCsv, isCleanImport } from "./import-report";

const result = (warnings: string[], weights: Array<number | null> = [100]): LoadResult => ({
  source: "spoolhoarder",
  spools: weights.map((weight, index) =>
    makeSpool("spoolhoarder", String(index), { remainingWeight: weight }),
  ),
  warnings,
  loadedAt: "now",
});

test("a clean file has counts and nothing else", () => {
  const report = buildImportReport(result([], [10, 20]), "a.csv");
  expect(report).toMatchObject({ rowsRead: 2, spoolsLoaded: 2, fileName: "a.csv" });
  expect(isCleanImport(report)).toBe(true);
});

test("sorts warnings into skipped rows, assumed values and file notes", () => {
  const report = buildImportReport(
    result(
      [
        "Row 4: marked deleted in Spool Hoarder; skipped.",
        "Spool 7: remaining weight was unknown; the exported spool is treated as full.",
        "Filament abc: ID 9 appears more than once; using the first row.",
        "Eggs Red: initial weight was unknown; the remaining weight was used as the total.",
        "Record 55 is not a filament (type 3); skipped.",
        "Spool S9 appears more than once; using the first row.",
        "This is a HueForge library export.",
      ],
      [null, 5],
    ),
  );
  expect(report.skipped.map((item) => [item.location, item.row])).toEqual([
    ["Row 4", 4],
    ["Filament abc", null],
    ["Record 55", null],
    ["Spool S9", null],
  ]);
  expect(report.changed.map((item) => item.location)).toEqual(["Spool 7", "Eggs Red"]);
  expect(report.warnings).toEqual(["This is a HueForge library export."]);
  expect(report.rowsRead).toBe(6);
  expect(report.unknownWeight).toBe(1);
  expect(isCleanImport(report)).toBe(false);
});

test("validation failures that name a record count as skipped", () => {
  const report = buildImportReport(result(["Filament 2: weight Expected number"]));
  expect(report.skipped).toEqual([
    { location: "Filament 2", row: 2, reason: "weight Expected number" },
  ]);
});

test("the CSV neutralises formulas and keeps one line per finding", () => {
  const report = buildImportReport(
    result(['Row 3: =HYPERLINK("http://x"); skipped.', "+note"]),
    "=evil.csv",
  );
  const parsed = Papa.parse<Record<string, string>>(importReportCsv(report), { header: true });
  expect(parsed.data[0]).toMatchObject({ file: "'=evil.csv", outcome: "skipped", row: "3" });
  expect(parsed.data[0]!["reason"]).toStartWith("'=");
  expect(parsed.data[1]).toMatchObject({ outcome: "note", reason: "'+note" });
});

test("an empty report still has a header row", () => {
  expect(importReportCsv(buildImportReport(result([])))).toContain("file,service,outcome");
});

test("reads a real Spool Hoarder file: duplicate and deleted rows are reported with row numbers", async () => {
  const csv = [
    "spoolId,brand,material,remainingWeight,isDeleted",
    "a,Acme,PLA,300,false",
    "a,Dup,PLA,100,false",
    "gone,Acme,PETG,200,true",
    "b,Acme,ABS,50,false",
  ].join("\n");
  const loaded = await loadInventoryFile("spoolhoarder", csv);
  const report = buildImportReport(loaded, "hoarder.csv");
  expect(report.spoolsLoaded).toBe(2);
  expect(report.rowsRead).toBe(4);
  expect(report.skipped.map((item) => item.row)).toEqual([3, 4]);
  expect(report.skipped[0]!.reason).toContain("appears more than once");
  expect(report.skipped[1]!.reason).toContain("marked deleted");
  expect(report.changed).toEqual([]);
  const rows = importReportCsv(report).trim().split(/\r?\n/);
  expect(rows).toHaveLength(3);
});
