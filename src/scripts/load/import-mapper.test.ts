import { beforeEach, expect, test } from "bun:test";

import { reloadLocale, setLocale } from "~/lib/i18n";

import { convertedFilename, describeProblem, isMappableFile } from "./import-mapper";

beforeEach(() => {
  localStorage.clear();
  reloadLocale();
});

test("only delimited text and JSON files are offered the mapper", () => {
  for (const name of ["a.csv", "A.CSV", "stock.tsv", "notes.txt", "export.json", " a.csv "])
    expect(isMappableFile(name)).toBe(true);
  for (const name of ["a.xlsx", "a.zip", "a.pdf", "csv", "a.csv.exe", ""])
    expect(isMappableFile(name)).toBe(false);
});

test("the converted file name is safe and says what it is", () => {
  expect(convertedFilename("my sheet.csv")).toBe("my_sheet-spoolman.csv");
  expect(convertedFilename("../../etc/passwd.json")).toBe("etc_passwd-spoolman.csv");
  expect(convertedFilename("Filament ★ Liste (2).csv")).toBe("Filament_Liste_2-spoolman.csv");
  expect(convertedFilename(".csv")).toBe("inventory-spoolman.csv");
  expect(convertedFilename("x".repeat(200) + ".csv")).toBe(`${"x".repeat(60)}-spoolman.csv`);
});

test("problems are described in the page language", () => {
  expect(describeProblem({ kind: "identity" })).toBe(
    "Map at least a brand, material, or name column.",
  );
  expect(describeProblem({ kind: "missing", header: "Brand" })).toBe(
    'The column "Brand" is not in this file.',
  );
  expect(
    describeProblem({ kind: "duplicate", header: "Brand", fields: ["vendor", "material"] }),
  ).toBe('The column "Brand" is used for both Brand and Material.');
  setLocale("de");
  expect(describeProblem({ kind: "identity" })).toBe(
    "Ordnen Sie mindestens eine Spalte für Marke, Material oder Name zu.",
  );
  setLocale("en");
});
