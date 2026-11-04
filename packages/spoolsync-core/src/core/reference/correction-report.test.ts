import { describe, expect, test } from "bun:test";

import { makeSpool } from "../testing";
import { analyzeReference } from "./analyze";
import { ReferenceCatalog } from "./catalog";
import { correctionRecords, correctionReport } from "./correction-report";
import type { ReferenceFilament } from "./types";

const record = (overrides: Partial<ReferenceFilament>): ReferenceFilament => ({
  id: "r1",
  providerId: "openfilamentdatabase",
  providerLabel: "Open Filament Database",
  vendor: "Prusament",
  name: null,
  material: "PLA",
  colorName: "Galaxy Black",
  colorHex: "1A1A1A",
  colorHexes: ["1A1A1A"],
  diameter: 1.75,
  density: 1.24,
  nozzleTempMin: null,
  nozzleTempMax: null,
  bedTempMin: null,
  bedTempMax: null,
  initialWeight: 1000,
  emptySpoolWeight: null,
  price: null,
  barcode: null,
  url: null,
  sourceUrl: "https://openfilamentdatabase.org/brands/prusament/pla/galaxy-black",
  attribution: "OFD",
  license: "CC0",
  ...overrides,
});

const spool = (id: string, overrides = {}) =>
  makeSpool("spoolman", id, {
    vendor: "Prusament",
    material: "PLA",
    name: "Galaxy Black",
    colors: ["1A1A1A"],
    upc: "8594173670001",
    diameter: 1.75,
    density: 1.24,
    initialWeight: 1000,
    ...overrides,
  });

// A shared barcode makes the match certain even when the colors disagree.
const analyze = (
  spools: ReturnType<typeof spool>[],
  filaments = [record({ barcode: "8594173670001" })],
) => analyzeReference(spools, new ReferenceCatalog(filaments)).items;

describe("correction report", () => {
  test("is empty when the spools agree with the catalog", () => {
    const report = correctionReport(analyze([spool("1")]));
    expect(report).toEqual({ markdown: "", records: 0, points: 0, providers: [] });
  });

  test("lists differing values and colors for a certain match, with a link", () => {
    const items = analyze([spool("1", { diameter: 2.85, colors: ["4A4A4A"] })]);
    const report = correctionReport(items);
    expect(report.records).toBe(1);
    expect(report.points).toBe(2);
    expect(report.providers).toEqual(["Open Filament Database"]);
    expect(report.markdown).toContain("## Open Filament Database");
    expect(report.markdown).toContain("### Prusament PLA Galaxy Black");
    expect(report.markdown).toContain(
      "https://openfilamentdatabase.org/brands/prusament/pla/galaxy-black",
    );
    expect(report.markdown).toContain("- **Color**: catalog says #1A1A1A; my spool says #4A4A4A");
    expect(report.markdown).toMatch(
      /- \*\*Diameter[^*]*\*\*: catalog says 1\.75; my spool says 2\.85/,
    );
  });

  test("counts spools that disagree in the same way once, with how many", () => {
    const items = analyze([
      spool("1", { diameter: 2.85 }),
      spool("2", { diameter: 2.85 }),
      spool("3", { diameter: 3 }),
    ]);
    const [entry] = correctionRecords(items);
    const point = entry!.points.find((candidate) => candidate.field === "diameter")!;
    expect(point.spools.map((spoolEntry) => spoolEntry.count).sort()).toEqual([1, 2]);
    expect(correctionReport(items).markdown).toContain("(2 spools)");
  });

  test("ignores values the spool lacks, vendor and price, and uncertain matches", () => {
    const missing = analyze([spool("1", { diameter: null })]);
    expect(correctionRecords(missing)).toEqual([]);
    const priced = analyze([spool("2", { price: 99 })], [record({ price: 20 })]);
    expect(correctionRecords(priced)).toEqual([]);
    const unrelated = analyze([
      spool("3", { vendor: "Nobody", name: "Mystery", upc: null, diameter: 2.85 }),
    ]);
    expect(correctionRecords(unrelated)).toEqual([]);
  });

  test("carries no spool names, ids, services or weights", () => {
    const report = correctionReport(
      analyze([
        spool("secret-id", { diameter: 2.85, remainingWeight: 123, notes: "private note" }),
      ]),
    );
    expect(report.markdown).not.toContain("secret-id");
    expect(report.markdown).not.toContain("private note");
    expect(report.markdown).not.toContain("123");
    expect(report.markdown.toLowerCase()).not.toContain("spoolman");
  });
});
