import { SOURCE_LABELS, type CommonSpool } from "@spoolsync/core/core/model";
import type { ReorderItem } from "@spoolsync/core/workflow";

/**
 * The smart reorder list: low-stock spools grouped by brand, with shop search links and a
 * spreadsheet-safe CSV. Pure functions only; the Load page panel does the drawing.
 */

export const NO_BRAND = "No brand";
const SHOP_SEARCH_URL = "https://www.google.com/search";

export interface BrandGroup {
  /** Display name, in the casing of the first spool seen; `No brand` for spools without one. */
  brand: string;
  items: ReorderItem[];
  /** A search for the brand's filament in general, or `null` for the no-brand group. */
  searchUrl: string | null;
}

const clean = (value: string | null | undefined): string => (value ?? "").replace(/\s+/g, " ").trim();

/**
 * A shopping search for a brand, material and color. Parts are joined into one `q` value and
 * encoded by `URLSearchParams`, so spaces, `&`, `#`, quotes and non-Latin names cannot change the
 * query's structure. Empty parts are left out; returns `null` when nothing is left to search for.
 */
export function shopSearchUrl(
  brand: string | null | undefined,
  material?: string | null,
  color?: string | null,
): string | null {
  const terms = [brand, material, color].map(clean).filter(Boolean);
  if (!terms.length) return null;
  const url = new URL(SHOP_SEARCH_URL);
  url.searchParams.set("tbm", "shop");
  url.searchParams.set("q", [...terms, ...(terms.length === 1 ? ["filament"] : [])].join(" "));
  return url.toString();
}

/** The search for one spool: its brand, material and color (or filament) name. */
export function spoolSearchUrl(spool: CommonSpool): string | null {
  return shopSearchUrl(spool.vendor, spool.material, spool.name);
}

/**
 * Groups reorder items by brand (case-insensitively), brands in alphabetical order with the
 * no-brand group last. Inside a group the incoming order (emptiest first) is kept.
 */
export function groupByBrand(items: readonly ReorderItem[]): BrandGroup[] {
  const groups = new Map<string, BrandGroup>();
  const blank: BrandGroup = { brand: NO_BRAND, items: [], searchUrl: null };
  for (const item of items) {
    const brand = clean(item.spool.vendor);
    if (!brand) {
      blank.items.push(item);
      continue;
    }
    const id = brand.toLowerCase();
    const group = groups.get(id) ?? { brand, items: [], searchUrl: shopSearchUrl(brand, "filament") };
    group.items.push(item);
    groups.set(id, group);
  }
  const ordered = [...groups.values()].sort((a, b) =>
    a.brand.localeCompare(b.brand, undefined, { numeric: true, sensitivity: "base" }),
  );
  return blank.items.length ? [...ordered, blank] : ordered;
}

/** A label such as `PLA Galaxy Black`, falling back to the id when the spool has no description. */
export function itemLabel(spool: CommonSpool): string {
  return (
    [clean(spool.material), clean(spool.name)].filter(Boolean).join(" ") || spool.sourceId
  );
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

/** The shopping list as CSV text (no byte-order mark; the download adds one for Excel). */
export function reorderCsv(groups: readonly BrandGroup[]): string {
  const lines: string[] = [CSV_COLUMNS.join(",")];
  for (const group of groups) {
    for (const { spool, fraction } of group.items) {
      const url = spoolSearchUrl(spool);
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
