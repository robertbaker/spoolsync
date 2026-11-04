import { SOURCE_LABELS, type CommonSpool, type SourceId } from "@spoolsync/core/core/model";
import { isRunningLow, type LowStockRule } from "@spoolsync/core/core/stock";
import type { UniqueSpool } from "@spoolsync/core/workflow";

import { gramsToUnit, type WeightUnit } from "./units";

/**
 * The inventory report: totals, a split by material and by brand, what is running low, and what the
 * spools cost. Built from one entry per physical spool (a spool linked across services counts
 * once). Pure; the Load page draws it and offers it as a print view, Markdown and CSV.
 */

export const NO_MATERIAL = "No material";
export const NO_BRAND = "No brand";

export interface ReportRow {
  label: string;
  spools: number;
  remainingGrams: number;
  /** Sum of the full weights of the spools that have one. */
  fullGrams: number;
  /** Sum of purchase prices recorded for the group, or `null` when none has a price. */
  spend: number | null;
}

export interface LowRow {
  label: string;
  brand: string;
  service: string;
  remainingGrams: number | null;
  /** Share of the full weight left, 0 to 100, or `null` when the full weight is unknown. */
  percent: number | null;
  location: string | null;
}

export interface InventoryReport {
  generatedAt: string;
  /** Names of the services the loaded spools came from. */
  services: string[];
  spools: number;
  /** Archived spools left out (or counted, when asked to include them). */
  archived: number;
  includesArchived: boolean;
  remainingGrams: number;
  fullGrams: number;
  /** Spools whose remaining weight is not recorded. */
  unknownWeights: number;
  /** Remaining over full weight for spools that have both, 0 to 100. */
  percentLeft: number | null;
  /** Total of purchase prices as recorded, with no currency conversion. */
  spend: number | null;
  pricedSpools: number;
  /** Price scaled by how much is left, for spools with a price, a full weight and a weight. */
  valueRemaining: number | null;
  byMaterial: ReportRow[];
  byBrand: ReportRow[];
  low: LowRow[];
}

export interface ReportOptions {
  includeArchived?: boolean;
}

const clean = (value: string | null | undefined): string =>
  (value ?? "").replace(/\s+/g, " ").trim();
const round1 = (value: number): number => Math.round(value * 10) / 10;

function title(spool: CommonSpool): string {
  return [clean(spool.material), clean(spool.name)].filter(Boolean).join(" ") || spool.sourceId;
}

function addTo(rows: Map<string, ReportRow>, label: string, spool: CommonSpool): void {
  const id = label.toLowerCase();
  const row = rows.get(id) ?? { label, spools: 0, remainingGrams: 0, fullGrams: 0, spend: null };
  row.spools += 1;
  row.remainingGrams += spool.remainingWeight ?? 0;
  row.fullGrams += spool.initialWeight ?? 0;
  if (spool.price !== null && Number.isFinite(spool.price))
    row.spend = (row.spend ?? 0) + spool.price;
  rows.set(id, row);
}

/** Largest first, ties by name, so the same inventory always produces the same report. */
function ranked(rows: Map<string, ReportRow>): ReportRow[] {
  return [...rows.values()]
    .map((row) => ({
      ...row,
      remainingGrams: Math.round(row.remainingGrams),
      fullGrams: Math.round(row.fullGrams),
      spend: row.spend === null ? null : Math.round(row.spend * 100) / 100,
    }))
    .sort((a, b) => b.remainingGrams - a.remainingGrams || a.label.localeCompare(b.label));
}

export function buildInventoryReport(
  unique: readonly UniqueSpool[],
  rule: LowStockRule,
  now: Date = new Date(),
  options: ReportOptions = {},
): InventoryReport {
  const includesArchived = options.includeArchived === true;
  const services = new Set<SourceId>();
  const materials = new Map<string, ReportRow>();
  const brands = new Map<string, ReportRow>();
  const low: Array<LowRow & { sort: number }> = [];
  let archived = 0;
  let spools = 0;
  let remaining = 0;
  let full = 0;
  let unknown = 0;
  let measuredRemaining = 0;
  let measuredFull = 0;
  let spend = 0;
  let priced = 0;
  let valueRemaining = 0;
  let valued = 0;

  for (const { spool, members } of unique) {
    for (const member of members) services.add(member.source);
    if (spool.archived) {
      archived += 1;
      if (!includesArchived) continue;
    }
    spools += 1;
    addTo(materials, clean(spool.material) || NO_MATERIAL, spool);
    addTo(brands, clean(spool.vendor) || NO_BRAND, spool);
    if (spool.remainingWeight === null) unknown += 1;
    else remaining += spool.remainingWeight;
    full += spool.initialWeight ?? 0;
    if (spool.remainingWeight !== null && spool.initialWeight && spool.initialWeight > 0) {
      measuredRemaining += Math.min(spool.remainingWeight, spool.initialWeight);
      measuredFull += spool.initialWeight;
    }
    if (spool.price !== null && Number.isFinite(spool.price)) {
      spend += spool.price;
      priced += 1;
      if (spool.remainingWeight !== null && spool.initialWeight && spool.initialWeight > 0) {
        valueRemaining += spool.price * Math.min(1, spool.remainingWeight / spool.initialWeight);
        valued += 1;
      }
    }
    // A linked spool is low if any of its records says so, as the reorder list decides.
    if (!spool.archived && members.some((member) => isRunningLow(member, rule))) {
      const percent =
        spool.remainingWeight !== null && spool.initialWeight && spool.initialWeight > 0
          ? round1((spool.remainingWeight / spool.initialWeight) * 100)
          : null;
      low.push({
        label: title(spool),
        brand: clean(spool.vendor) || NO_BRAND,
        service: SOURCE_LABELS[spool.source],
        remainingGrams: spool.remainingWeight === null ? null : Math.round(spool.remainingWeight),
        percent,
        location: clean(spool.location) || null,
        sort: percent ?? 101,
      });
    }
  }
  low.sort(
    (a, b) => a.sort - b.sort || a.brand.localeCompare(b.brand) || a.label.localeCompare(b.label),
  );

  return {
    generatedAt: now.toISOString(),
    services: [...services].map((source) => SOURCE_LABELS[source]).sort(),
    spools,
    archived,
    includesArchived,
    remainingGrams: Math.round(remaining),
    fullGrams: Math.round(full),
    unknownWeights: unknown,
    percentLeft: measuredFull > 0 ? round1((measuredRemaining / measuredFull) * 100) : null,
    spend: priced ? Math.round(spend * 100) / 100 : null,
    pricedSpools: priced,
    valueRemaining: valued ? Math.round(valueRemaining * 100) / 100 : null,
    byMaterial: ranked(materials),
    byBrand: ranked(brands),
    low: low.map(({ sort: _sort, ...row }) => row),
  };
}

/** How numbers are written: injected so the report follows the visitor's units and currency. */
export interface ReportFormat {
  unit: WeightUnit;
  weight(grams: number | null | undefined): string;
  money(amount: number): string;
}

export const reportDate = (report: InventoryReport): string => report.generatedAt.slice(0, 10);

/** `spoolsync-inventory-report-2026-11-03.md` */
export function reportFilename(report: InventoryReport, extension: "md" | "csv" | "html"): string {
  return `spoolsync-inventory-report-${reportDate(report)}.${extension}`;
}

const plural = (count: number, one: string, many = `${one}s`) =>
  `${count.toLocaleString()} ${count === 1 ? one : many}`;

/** Summary lines shared by the Markdown and on-screen versions. */
export function summaryLines(
  report: InventoryReport,
  format: ReportFormat,
): Array<[string, string]> {
  const lines: Array<[string, string]> = [
    ["Spools", report.spools.toLocaleString()],
    ["Filament left", format.weight(report.remainingGrams)],
    ["Full weight", report.fullGrams ? format.weight(report.fullGrams) : "–"],
    ["Percent left", report.percentLeft === null ? "–" : `${report.percentLeft}%`],
    ["Running low", report.low.length.toLocaleString()],
  ];
  if (report.spend !== null)
    lines.push([
      "Spent",
      `${format.money(report.spend)} on ${plural(report.pricedSpools, "priced spool")}`,
    ]);
  if (report.valueRemaining !== null)
    lines.push(["Value still on spools", format.money(report.valueRemaining)]);
  return lines;
}

/** Notes that qualify the numbers, so a report is never read as more exact than it is. */
export function reportNotes(report: InventoryReport): string[] {
  const notes: string[] = [];
  if (report.unknownWeights)
    notes.push(
      `${plural(report.unknownWeights, "spool")} without a recorded remaining weight count as 0 in the totals.`,
    );
  if (report.archived)
    notes.push(
      report.includesArchived
        ? `${plural(report.archived, "archived spool")} included.`
        : `${plural(report.archived, "archived spool")} left out.`,
    );
  if (report.spend !== null) notes.push("Prices are as recorded, with no currency conversion.");
  notes.push(
    `Linked spools are counted once across ${report.services.join(", ") || "no services"}.`,
  );
  return notes;
}

const mdCell = (text: string): string =>
  text
    .replace(/\\/g, "\\\\")
    .replace(/\|/g, "\\|")
    .replace(/[\r\n]+/g, " ");

function mdTable(headers: string[], rows: string[][]): string[] {
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(mdCell).join(" | ")} |`),
  ];
}

const groupRows = (rows: readonly ReportRow[], format: ReportFormat): string[][] =>
  rows.map((row) => [
    row.label,
    String(row.spools),
    format.weight(row.remainingGrams),
    row.spend === null ? "–" : format.money(row.spend),
  ]);

/** The report as Markdown: headings, a summary list, and pipe tables. */
export function reportMarkdown(report: InventoryReport, format: ReportFormat): string {
  const lines = [
    "# SpoolSync inventory report",
    "",
    `Generated ${report.generatedAt.slice(0, 10)} from ${report.services.join(", ") || "no services"}.`,
    "",
    "## Summary",
    "",
    ...summaryLines(report, format).map(([name, value]) => `- **${name}:** ${mdCell(value)}`),
    "",
    "## By material",
    "",
    ...mdTable(["Material", "Spools", "Left", "Spent"], groupRows(report.byMaterial, format)),
    "",
    "## By brand",
    "",
    ...mdTable(["Brand", "Spools", "Left", "Spent"], groupRows(report.byBrand, format)),
    "",
    "## Running low",
    "",
    ...(report.low.length
      ? mdTable(
          ["Spool", "Brand", "Left", "Percent", "Location"],
          report.low.map((row) => [
            row.label,
            row.brand,
            format.weight(row.remainingGrams),
            row.percent === null ? "–" : `${row.percent}%`,
            row.location ?? "",
          ]),
        )
      : ["Nothing is running low."]),
    "",
    ...reportNotes(report).map((note) => `> ${note}`),
    "",
  ];
  return lines.join("\n");
}

/**
 * Inventory files are untrusted, and spreadsheets read cells starting with these characters as
 * formulas, so such cells are prefixed with an apostrophe, as the other CSV exports do.
 */
function safeText(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

const csvWeight = (grams: number | null, unit: WeightUnit): string =>
  grams === null ? "" : String(Math.round(gramsToUnit(grams, unit) * 10) / 10);

/**
 * One flat table for spreadsheets: a `section` column says whether a row is the total, a material,
 * a brand or a low spool. Weights are numbers in the chosen unit, named in the column headers.
 */
export function reportCsv(report: InventoryReport, format: ReportFormat): string {
  const unit = format.unit;
  const header = [
    "section",
    "name",
    "brand",
    "spools",
    `left_${unit}`,
    `full_${unit}`,
    "percent_left",
    "spent",
    "location",
  ];
  const rows: Array<Array<string | number>> = [
    [
      "total",
      "All spools",
      "",
      report.spools,
      csvWeight(report.remainingGrams, unit),
      csvWeight(report.fullGrams, unit),
      report.percentLeft ?? "",
      report.spend ?? "",
      "",
    ],
  ];
  for (const [section, list] of [
    ["material", report.byMaterial],
    ["brand", report.byBrand],
  ] as const)
    for (const row of list)
      rows.push([
        section,
        safeText(row.label),
        "",
        row.spools,
        csvWeight(row.remainingGrams, unit),
        csvWeight(row.fullGrams, unit),
        row.fullGrams > 0 ? round1((row.remainingGrams / row.fullGrams) * 100) : "",
        row.spend ?? "",
        "",
      ]);
  for (const row of report.low)
    rows.push([
      "low",
      safeText(row.label),
      safeText(row.brand),
      1,
      csvWeight(row.remainingGrams, unit),
      "",
      row.percent ?? "",
      "",
      safeText(row.location ?? ""),
    ]);
  return `${[header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}
