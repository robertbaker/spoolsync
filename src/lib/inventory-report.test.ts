import { expect, test } from "bun:test";

import { makeSpool } from "@spoolsync/core/core/testing";
import { DEFAULT_LOW_STOCK } from "@spoolsync/core/core/stock";
import type { UniqueSpool } from "@spoolsync/core/workflow";

import {
  buildInventoryReport,
  reportCsv,
  reportFilename,
  reportMarkdown,
  reportNotes,
  summaryLines,
  type ReportFormat,
} from "./inventory-report";

const unique = (...spools: ReturnType<typeof makeSpool>[]): UniqueSpool[] =>
  spools.map((spool) => ({ spool, members: [spool] }));

const grams: ReportFormat = {
  unit: "g",
  weight: (value) => (value === null || value === undefined ? "–" : `${Math.round(value)} g`),
  money: (amount) => `$${amount.toFixed(2)}`,
};

const ounces: ReportFormat = {
  unit: "oz",
  weight: (value) => (value === null || value === undefined ? "–" : `${(value / 28.349523125).toFixed(1)} oz`),
  money: grams.money,
};

const now = new Date("2026-11-03T12:00:00Z");

const spools = unique(
  makeSpool("spoolman", "1", {
    vendor: "Polymaker",
    material: "PLA",
    name: "Teal",
    remainingWeight: 100,
    initialWeight: 1000,
    price: 20,
    location: "Shelf A",
  }),
  makeSpool("spoolman", "2", {
    vendor: "polymaker",
    material: "pla",
    name: "Red",
    remainingWeight: 900,
    initialWeight: 1000,
    price: 20,
  }),
  makeSpool("spoolman", "3", {
    vendor: "Prusament",
    material: "PETG",
    name: "Black",
    remainingWeight: 500,
    initialWeight: 1000,
    price: null,
  }),
  makeSpool("spoolman", "4", {
    vendor: null,
    material: null,
    name: null,
    remainingWeight: null,
    initialWeight: null,
  }),
  makeSpool("spoolman", "5", { vendor: "Old", material: "ABS", remainingWeight: 50, archived: true }),
);

test("totals, percent left, spend and the value still on spools", () => {
  const report = buildInventoryReport(spools, DEFAULT_LOW_STOCK, now);
  expect(report).toMatchObject({
    spools: 4,
    archived: 1,
    includesArchived: false,
    remainingGrams: 1500,
    fullGrams: 3000,
    unknownWeights: 1,
    percentLeft: 50,
    spend: 40,
    pricedSpools: 2,
    valueRemaining: 20,
    services: ["Spoolman"],
  });
});

test("groups materials and brands without regard to case, largest first", () => {
  const report = buildInventoryReport(spools, DEFAULT_LOW_STOCK, now);
  expect(report.byMaterial.map((row) => [row.label, row.spools, row.remainingGrams])).toEqual([
    ["PLA", 2, 1000],
    ["PETG", 1, 500],
    ["No material", 1, 0],
  ]);
  expect(report.byBrand[0]).toMatchObject({ label: "Polymaker", spools: 2, spend: 40 });
  expect(report.byBrand.at(-1)?.label).toBe("No brand");
  expect(report.byBrand.find((row) => row.label === "Prusament")?.spend).toBeNull();
});

test("lists spools running low, emptiest first, with their location", () => {
  const report = buildInventoryReport(spools, DEFAULT_LOW_STOCK, now);
  expect(report.low).toEqual([
    {
      label: "PLA Teal",
      brand: "Polymaker",
      service: "Spoolman",
      remainingGrams: 100,
      percent: 10,
      location: "Shelf A",
    },
  ]);
});

test("archived spools are counted only when asked for", () => {
  const report = buildInventoryReport(spools, DEFAULT_LOW_STOCK, now, { includeArchived: true });
  expect(report.spools).toBe(5);
  expect(report.byMaterial.map((row) => row.label)).toContain("ABS");
  expect(reportNotes(report).join(" ")).toContain("1 archived spool included");
  // An archived spool is finished, so it is never "running low".
  expect(report.low).toHaveLength(1);
});

test("an empty inventory produces a valid, honest report", () => {
  const report = buildInventoryReport([], DEFAULT_LOW_STOCK, now);
  expect(report).toMatchObject({ spools: 0, percentLeft: null, spend: null, valueRemaining: null });
  expect(summaryLines(report, grams).map(([name]) => name)).not.toContain("Spent");
  expect(reportMarkdown(report, grams)).toContain("Nothing is running low.");
});

test("markdown uses the display unit and escapes table separators in names", () => {
  const report = buildInventoryReport(
    unique(makeSpool("spoolio", "1", { vendor: "A|B", material: "PLA", remainingWeight: 283.5, initialWeight: 1000 })),
    DEFAULT_LOW_STOCK,
    now,
  );
  const markdown = reportMarkdown(report, ounces);
  expect(markdown).toContain("# SpoolSync inventory report");
  expect(markdown).toContain("A\\|B");
  expect(markdown).toContain("10.0 oz");
  expect(markdown).toContain("Generated 2026-11-03");
});

test("csv names the unit, quotes awkward cells and defuses formulas", () => {
  const report = buildInventoryReport(
    unique(
      makeSpool("spoolio", "1", {
        vendor: "=cmd()",
        material: 'PLA, "matte"',
        remainingWeight: 100,
        initialWeight: 1000,
        location: "@home",
      }),
    ),
    DEFAULT_LOW_STOCK,
    now,
  );
  const csv = reportCsv(report, ounces);
  const [header] = csv.split("\r\n");
  expect(header).toBe("section,name,brand,spools,left_oz,full_oz,percent_left,spent,location");
  expect(csv).toContain("'=cmd()");
  expect(csv).toContain('"PLA, ""matte"""');
  expect(csv).toContain("'@home");
  expect(csv).toContain("total,All spools,,1,3.5,35.3,10,,");
  expect(csv.endsWith("\r\n")).toBe(true);
});

test("file names carry the date", () => {
  const report = buildInventoryReport([], DEFAULT_LOW_STOCK, now);
  expect(reportFilename(report, "md")).toBe("spoolsync-inventory-report-2026-11-03.md");
  expect(reportFilename(report, "html")).toBe("spoolsync-inventory-report-2026-11-03.html");
});
