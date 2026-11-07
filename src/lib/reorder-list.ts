import { SOURCE_LABELS, type CommonSpool } from "@spoolsync/core/core/model";
import type { ReorderItem } from "@spoolsync/core/workflow";

import { SITE_URL } from "../config/site";
import { buyLinks, type BuyLink } from "./affiliates";

/**
 * The smart reorder list: low-stock spools grouped by brand, with shop links and a spreadsheet-safe
 * CSV. Pure functions only; the Load page panel does the drawing. The shops and their affiliate
 * programs live in `lib/affiliates`.
 */

export const NO_BRAND = "No brand";

export interface BrandGroup {
  /** Display name, in the casing of the first spool seen; `No brand` for spools without one. */
  brand: string;
  items: ReorderItem[];
  /** Shop links for the brand's filament in general; empty for the no-brand group. */
  links: BuyLink[];
}

const clean = (value: string | null | undefined): string =>
  (value ?? "").replace(/\s+/g, " ").trim();

/** The shop links for one spool: its brand, material and color (or filament) name. */
export function spoolBuyLinks(spool: CommonSpool, languages?: readonly string[]): BuyLink[] {
  return buyLinks({ brand: spool.vendor, material: spool.material, color: spool.name }, languages);
}

const NUMERIC_COLLATOR = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

/**
 * Groups reorder items by brand (case-insensitively), brands in alphabetical order with the
 * no-brand group last. Inside a group the incoming order (emptiest first) is kept.
 */
export function groupByBrand(
  items: readonly ReorderItem[],
  languages?: readonly string[],
): BrandGroup[] {
  const groups = new Map<string, BrandGroup>();
  const blank: BrandGroup = { brand: NO_BRAND, items: [], links: [] };
  for (const item of items) {
    const brand = clean(item.spool.vendor);
    if (!brand) {
      blank.items.push(item);
      continue;
    }
    const id = brand.toLowerCase();
    const group = groups.get(id) ?? {
      brand,
      items: [],
      links: buyLinks({ brand, material: "filament" }, languages),
    };
    group.items.push(item);
    groups.set(id, group);
  }
  const ordered = [...groups.values()].sort((a, b) => NUMERIC_COLLATOR.compare(a.brand, b.brand));
  return blank.items.length ? [...ordered, blank] : ordered;
}

/** A label such as `PLA Galaxy Black`, falling back to the id when the spool has no description. */
export function itemLabel(spool: CommonSpool): string {
  return [clean(spool.material), clean(spool.name)].filter(Boolean).join(" ") || spool.sourceId;
}

const CSV_COLUMNS = [
  "brand",
  "material",
  "name",
  "color",
  "service",
  "id",
  "remaining_g",
  "full_g",
  "percent_left",
  "location",
  "search_url",
] as const;

/**
 * Inventory files are untrusted, and spreadsheets read cells starting with these characters as
 * formulas, so such cells are prefixed with an apostrophe, as `combinedInventoryCsv` does.
 */
function safeText(value: string | null | undefined): string {
  const text = value ?? "";
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/**
 * The shopping list as CSV text (no byte-order mark; the download adds one for Excel). `search_url`
 * is the first shop link, the maker's own store when SpoolSync has one for the brand.
 */
export function reorderCsv(groups: readonly BrandGroup[], languages?: readonly string[]): string {
  const lines: string[] = [CSV_COLUMNS.join(",")];
  for (const group of groups) {
    for (const { spool, fraction } of group.items) {
      const path = spoolBuyLinks(spool, languages)[0]?.url;
      const url = path ? new URL(path, SITE_URL).href : undefined;
      const cells: Array<string | number> = [
        safeText(spool.vendor ? clean(spool.vendor) : ""),
        safeText(spool.material),
        safeText(spool.name),
        spool.colors.map((color) => `#${color}`).join(" "),
        SOURCE_LABELS[spool.source],
        safeText(spool.sourceId),
        spool.remainingWeight === null ? "" : Math.round(spool.remainingWeight),
        spool.initialWeight === null ? "" : Math.round(spool.initialWeight),
        fraction === null ? "" : Math.round(fraction * 100),
        safeText(spool.location),
        url ?? "",
      ];
      lines.push(cells.map(csvCell).join(","));
    }
  }
  return `${lines.join("\r\n")}\r\n`;
}

/** The download name, for example `spoolsync-reorder-2026-11-03.csv`. */
export function reorderFilename(date: Date): string {
  return `spoolsync-reorder-${date.toISOString().slice(0, 10)}.csv`;
}
