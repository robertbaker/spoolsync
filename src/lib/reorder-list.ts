import { SOURCE_LABELS, type CommonSpool } from "@spoolsync/core/core/model";
import type { ReorderItem } from "@spoolsync/core/workflow";

import { local, read, write } from "./browser/storage/access";

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
  template?: string | null,
): string | null {
  const terms = [brand, material, color].map(clean).filter(Boolean);
  if (!terms.length) return null;
  if (template) {
    const custom = expandShopTemplate(template, {
      brand: clean(brand),
      material: clean(material),
      color: clean(color),
    });
    if (custom) return custom;
  }
  const url = new URL(SHOP_SEARCH_URL);
  url.searchParams.set("tbm", "shop");
  url.searchParams.set("q", [...terms, ...(terms.length === 1 ? ["filament"] : [])].join(" "));
  return url.toString();
}

/** The search for one spool: its brand, material and color (or filament) name. */
export function spoolSearchUrl(spool: CommonSpool, template?: string | null): string | null {
  return shopSearchUrl(spool.vendor, spool.material, spool.name, template);
}

// ---- Shop link template -----------------------------------------------------------------------

export const SHOP_TEMPLATE_KEY = "spoolsync:shop-template";
export const SHOP_PLACEHOLDERS = ["brand", "material", "color"] as const;
export const MAX_SHOP_TEMPLATE = 300;
export const SHOP_TEMPLATE_EXAMPLE = "https://www.example-shop.com/search?q={brand}+{material}+{color}";

const PLACEHOLDER = /\{([^{}]*)\}/g;

export type ShopTemplateResult = { ok: true; template: string } | { ok: false; error: string };

/**
 * Checks a shop link template: an `https` address with at least one of `{brand}`, `{material}` and
 * `{color}`, none of them in the host name (so a filament name can never choose the site). Other
 * braces are refused rather than guessed at. Returns the trimmed template when it is usable.
 */
export function validateShopTemplate(input: string): ShopTemplateResult {
  const template = input.trim();
  if (!template) return { ok: false, error: "Enter a shop address, or reset to use web search." };
  if (template.length > MAX_SHOP_TEMPLATE)
    return { ok: false, error: `Use at most ${MAX_SHOP_TEMPLATE} characters.` };
  if (!/^https:\/\//i.test(template)) return { ok: false, error: "The address must start with https://." };
  const known: readonly string[] = SHOP_PLACEHOLDERS;
  const used = [...template.matchAll(PLACEHOLDER)].map((match) => match[1]!);
  const unknown = used.find((name) => !known.includes(name));
  if (unknown !== undefined)
    return { ok: false, error: `{${unknown}} is not a placeholder. Use {brand}, {material} or {color}.` };
  if (!used.length)
    return { ok: false, error: "Include {brand}, {material} or {color} so each link searches for the spool." };
  if (template.replace(PLACEHOLDER, "").includes("{") || template.replace(PLACEHOLDER, "").includes("}"))
    return { ok: false, error: "Braces must wrap one of {brand}, {material} or {color}." };
  const authority = template.slice("https://".length).split(/[/?#]/)[0] ?? "";
  if (authority.includes("{")) return { ok: false, error: "Placeholders belong in the path or query, not the site name." };
  try {
    const parsed = new URL(template.replace(PLACEHOLDER, "x"));
    if (parsed.protocol !== "https:" || !parsed.hostname)
      return { ok: false, error: "The address must be a valid https address." };
    if (parsed.username || parsed.password)
      return { ok: false, error: "The address cannot contain a user name or password." };
  } catch {
    return { ok: false, error: "The address is not a valid web address." };
  }
  return { ok: true, template };
}

/**
 * Fills a template for one spool. Each part is percent-encoded, so spaces, `&`, `#` and non-Latin
 * names cannot change the address's structure. Returns `null` for an unusable template or result.
 */
export function expandShopTemplate(
  template: string,
  parts: { brand: string; material: string; color: string },
): string | null {
  const checked = validateShopTemplate(template);
  if (!checked.ok) return null;
  const filled = checked.template.replace(PLACEHOLDER, (_match, name: string) =>
    encodeURIComponent(parts[name as keyof typeof parts] ?? ""),
  );
  try {
    const url = new URL(filled);
    return url.protocol === "https:" && !url.username && !url.password ? url.toString() : null;
  } catch {
    return null;
  }
}

export function readShopTemplate(): string | null {
  const stored = read(local, SHOP_TEMPLATE_KEY);
  if (!stored) return null;
  const checked = validateShopTemplate(stored);
  return checked.ok ? checked.template : null;
}

/** Saves a valid template (or clears it with `null`). Returns false when storage refuses it. */
export function saveShopTemplate(template: string | null): boolean {
  if (template === null) return write(local, SHOP_TEMPLATE_KEY, null);
  const checked = validateShopTemplate(template);
  return checked.ok && write(local, SHOP_TEMPLATE_KEY, checked.template);
}

/**
 * Groups reorder items by brand (case-insensitively), brands in alphabetical order with the
 * no-brand group last. Inside a group the incoming order (emptiest first) is kept.
 */
export function groupByBrand(items: readonly ReorderItem[], template?: string | null): BrandGroup[] {
  const groups = new Map<string, BrandGroup>();
  const blank: BrandGroup = { brand: NO_BRAND, items: [], searchUrl: null };
  for (const item of items) {
    const brand = clean(item.spool.vendor);
    if (!brand) {
      blank.items.push(item);
      continue;
    }
    const id = brand.toLowerCase();
    const group = groups.get(id) ?? { brand, items: [], searchUrl: shopSearchUrl(brand, "filament", null, template) };
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
export function reorderCsv(groups: readonly BrandGroup[], template?: string | null): string {
  const lines: string[] = [CSV_COLUMNS.join(",")];
  for (const group of groups) {
    for (const { spool, fraction } of group.items) {
      const url = spoolSearchUrl(spool, template);
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
