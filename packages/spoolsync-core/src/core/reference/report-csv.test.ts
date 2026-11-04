import { describe, expect, test } from "bun:test";

import Papa from "papaparse";

import { makeSpool } from "../testing";
import { analyzeReference } from "./analyze";
import { ReferenceCatalog } from "./catalog";
import { parseReferenceFile } from "./file";
import { REFERENCE_CSV_COLUMNS, referenceCsv } from "./report-csv";

const catalog = new ReferenceCatalog(
  parseReferenceFile(
    "ref.json",
    JSON.stringify([
      {
        brand: "Prusament",
        material: "PLA",
        color_name: "Galaxy Black",
        hex: "#1A1A1A",
        diameter: 1.75,
        density: 1.24,
        source_url: "https://example.org/r/1",
      },
    ]),
  ).filaments,
);

const read = (text: string) =>
  Papa.parse<Record<string, string>>(text.replace(/^\uFEFF/, ""), {
    header: true,
    skipEmptyLines: true,
  }).data;

describe("referenceCsv", () => {
  test("lists each field to fill or compare, with the source link", () => {
    const spools = [
      makeSpool("spoolman", "1", {
        vendor: "Prusament",
        material: "PLA",
        name: "Galaxy Black",
        colors: ["1A1A1A"],
        density: null,
      }),
    ];
    const items = analyzeReference(spools, catalog).items;
    const rows = read(referenceCsv(items, () => "Prusament PLA Galaxy Black"));
    const density = rows.find((row) => row["field"] === "density")!;
    expect(density).toMatchObject({
      service: "Spoolman",
      spool_id: "1",
      action: "fill",
      reference_value: "1.24",
      source_link: "https://example.org/r/1",
    });
    expect(Object.keys(rows[0]!)).toEqual([...REFERENCE_CSV_COLUMNS]);
  });

  test("a spool with no match still gets a line, and spreadsheet formulas are defused", () => {
    const spools = [
      makeSpool("spoolman", "9", { vendor: "Nobody", name: '=HYPERLINK("http://evil")' }),
    ];
    const text = referenceCsv(
      analyzeReference(spools, catalog).items,
      () => '=HYPERLINK("http://evil")',
    );
    const rows = read(text);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ match: "none", action: "none" });
    expect(rows[0]!["spool"]!.startsWith("'=")).toBe(true);
  });

  test("an empty list is just the header", () => {
    expect(referenceCsv([], () => "").trim()).toBe(REFERENCE_CSV_COLUMNS.join(","));
  });
});
