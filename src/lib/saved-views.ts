import { SOURCE_LABELS, type CommonSpool } from "@spoolsync/core/core/model";
import { HEALTH_ISSUES } from "@spoolsync/core/workflow";

import { local, read, write } from "./browser/storage/access";
import type { SortKey } from "./preferences";

/**
 * Saved views of the Load page's spool table: a name for a combination of filters, sort and
 * grouping. This module is pure apart from the storage helpers at the bottom, which go through the
 * shared access layer so blocked storage is tolerated.
 */

export const SAVED_VIEWS_KEY = "spoolsync:saved-views";
export const MAX_VIEWS = 30;
export const MAX_VIEW_NAME = 60;
export const MAX_TEXT = 100;
/** Larger than any real spool, so a typo cannot store an absurd bound. */
export const MAX_GRAMS = 100_000;

export const VIEW_GROUPS = ["none", "source", "vendor", "material", "location"] as const;
export type ViewGroup = (typeof VIEW_GROUPS)[number];

export const VIEW_GROUP_LABELS: Record<ViewGroup, string> = {
  none: "No grouping",
  source: "By service",
  vendor: "By brand",
  material: "By material",
  location: "By location",
};

const SORT_KEYS: readonly SortKey[] = [
  "source",
  "vendor",
  "material",
  "name",
  "remaining",
  "location",
];
const INSIGHT_FILTERS: readonly string[] = ["duplicates", "watched", ...HEALTH_ISSUES];

/** Everything a view remembers. `search` is stored lower-cased, as the table uses it. */
export interface ViewSettings {
  search: string;
  lowOnly: boolean;
  /** Duplicates, watched, or a health check id; `null` for none. */
  insight: string | null;
  sort: { key: SortKey; direction: "asc" | "desc" } | null;
  group: ViewGroup;
  /** Case-insensitive substring of the material (for example `pla` also matches `PLA+`). */
  material: string;
  minGrams: number | null;
  maxGrams: number | null;
}

export interface SavedView extends ViewSettings {
  id: string;
  name: string;
}

export const EMPTY_VIEW: ViewSettings = {
  search: "",
  lowOnly: false,
  insight: null,
  sort: null,
  group: "none",
  material: "",
  minGrams: null,
  maxGrams: null,
};

function cleanText(value: unknown, max: number): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function cleanGrams(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= MAX_GRAMS
    ? value
    : null;
}

/** Parses a grams input: empty is "no bound", anything else must be a number from 0 up. */
export function parseGrams(text: string): number | null | "invalid" {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const value = Number(trimmed.replace(",", "."));
  return Number.isFinite(value) && value >= 0 && value <= MAX_GRAMS ? value : "invalid";
}

/** Validates settings from any source (storage, the table); unknown values fall back. */
export function sanitizeSettings(raw: unknown): ViewSettings {
  const input =
    raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const sort = input["sort"] as { key?: unknown; direction?: unknown } | null | undefined;
  let minGrams = cleanGrams(input["minGrams"]);
  let maxGrams = cleanGrams(input["maxGrams"]);
  // A reversed range could never match; swap it rather than silently showing nothing.
  if (minGrams !== null && maxGrams !== null && minGrams > maxGrams)
    [minGrams, maxGrams] = [maxGrams, minGrams];
  return {
    search: cleanText(input["search"], MAX_TEXT).toLowerCase(),
    lowOnly: input["lowOnly"] === true,
    insight:
      typeof input["insight"] === "string" && INSIGHT_FILTERS.includes(input["insight"])
        ? input["insight"]
        : null,
    sort:
      sort &&
      typeof sort === "object" &&
      SORT_KEYS.includes(sort.key as SortKey) &&
      (sort.direction === "asc" || sort.direction === "desc")
        ? { key: sort.key as SortKey, direction: sort.direction }
        : null,
    group: VIEW_GROUPS.includes(input["group"] as ViewGroup)
      ? (input["group"] as ViewGroup)
      : "none",
    material: cleanText(input["material"], MAX_TEXT),
    minGrams,
    maxGrams,
  };
}

/** A view with a usable name and id, or `null`. */
export function sanitizeView(raw: unknown): SavedView | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const input = raw as Record<string, unknown>;
  const name = cleanText(input["name"], MAX_VIEW_NAME);
  const id = cleanText(input["id"], 40);
  if (!name || !id) return null;
  return { id, name, ...sanitizeSettings(input) };
}

const sameName = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** Well-formed views only, with unique ids and names, capped in number. */
export function sanitizeViews(raw: unknown): SavedView[] {
  if (!Array.isArray(raw)) return [];
  const views: SavedView[] = [];
  for (const item of raw) {
    const view = sanitizeView(item);
    if (!view) continue;
    if (views.some((v) => v.id === view.id || sameName(v.name, view.name))) continue;
    views.push(view);
    if (views.length >= MAX_VIEWS) break;
  }
  return views;
}

export type ViewResult =
  | { ok: true; views: SavedView[]; view: SavedView }
  | { ok: false; error: string };

function checkName(views: readonly SavedView[], name: string, exceptId?: string): string | null {
  const clean = cleanText(name, MAX_VIEW_NAME + 1);
  if (!clean) return "Give the view a name.";
  if (clean.length > MAX_VIEW_NAME) return `Use at most ${MAX_VIEW_NAME} characters for the name.`;
  if (views.some((view) => view.id !== exceptId && sameName(view.name, clean)))
    return `A view named "${clean}" already exists.`;
  return null;
}

let counter = 0;
function defaultId(): string {
  counter += 1;
  return `${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Adds a view. Fails with a message for an empty, long, or duplicate name, or a full list. */
export function addView(
  views: readonly SavedView[],
  name: string,
  settings: ViewSettings,
  newId: () => string = defaultId,
): ViewResult {
  const error = checkName(views, name);
  if (error) return { ok: false, error };
  if (views.length >= MAX_VIEWS)
    return { ok: false, error: `You can keep at most ${MAX_VIEWS} views. Delete one first.` };
  const view: SavedView = {
    id: newId(),
    name: cleanText(name, MAX_VIEW_NAME),
    ...sanitizeSettings(settings),
  };
  return { ok: true, views: [...views, view], view };
}

export function renameView(views: readonly SavedView[], id: string, name: string): ViewResult {
  const current = views.find((view) => view.id === id);
  if (!current) return { ok: false, error: "That view no longer exists." };
  const error = checkName(views, name, id);
  if (error) return { ok: false, error };
  const view = { ...current, name: cleanText(name, MAX_VIEW_NAME) };
  return { ok: true, views: views.map((v) => (v.id === id ? view : v)), view };
}

/** Replaces a view's settings with the current ones, keeping its name. */
export function updateView(
  views: readonly SavedView[],
  id: string,
  settings: ViewSettings,
): ViewResult {
  const current = views.find((view) => view.id === id);
  if (!current) return { ok: false, error: "That view no longer exists." };
  const view = { id, name: current.name, ...sanitizeSettings(settings) };
  return { ok: true, views: views.map((v) => (v.id === id ? view : v)), view };
}

export function deleteView(views: readonly SavedView[], id: string): SavedView[] {
  return views.filter((view) => view.id !== id);
}

/** Whether two settings describe the same view (used to show which saved view is in effect). */
export function sameSettings(a: ViewSettings, b: ViewSettings): boolean {
  return JSON.stringify(sanitizeSettings(a)) === JSON.stringify(sanitizeSettings(b));
}

/** The weight and material part of a view. Spools without a known weight fail any weight bound. */
export function matchesRange(
  spool: Pick<CommonSpool, "material" | "remainingWeight">,
  settings: Pick<ViewSettings, "material" | "minGrams" | "maxGrams">,
): boolean {
  const material = settings.material.trim().toLowerCase();
  if (material && !(spool.material ?? "").toLowerCase().includes(material)) return false;
  if (settings.minGrams === null && settings.maxGrams === null) return true;
  const grams = spool.remainingWeight;
  if (grams === null || !Number.isFinite(grams)) return false;
  if (settings.minGrams !== null && grams < settings.minGrams) return false;
  if (settings.maxGrams !== null && grams > settings.maxGrams) return false;
  return true;
}

export interface SpoolGroupSection {
  label: string;
  spools: CommonSpool[];
}

const UNKNOWN_LABEL: Record<Exclude<ViewGroup, "none">, string> = {
  source: "Unknown service",
  vendor: "No brand",
  material: "No material",
  location: "No location",
};

/**
 * Splits spools into sections, keeping the incoming (sorted) order inside each. Sections are
 * ordered by name with the blank section last. `none` gives a single unlabelled section.
 */
export function groupSpools(spools: readonly CommonSpool[], group: ViewGroup): SpoolGroupSection[] {
  if (group === "none") return [{ label: "", spools: [...spools] }];
  const sections = new Map<string, SpoolGroupSection>();
  const blank: SpoolGroupSection = { label: UNKNOWN_LABEL[group], spools: [] };
  for (const spool of spools) {
    const value = group === "source" ? SOURCE_LABELS[spool.source] : spool[group]?.trim();
    if (!value) {
      blank.spools.push(spool);
      continue;
    }
    // Compare case-insensitively so "PLA" and "pla" share one section.
    const id = value.toLowerCase();
    const section = sections.get(id) ?? { label: value, spools: [] };
    section.spools.push(spool);
    sections.set(id, section);
  }
  const ordered = [...sections.values()].sort((a, b) =>
    a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: "base" }),
  );
  return blank.spools.length ? [...ordered, blank] : ordered;
}

/** A short plain-language description, for the status line. */
export function describeSettings(
  settings: ViewSettings,
  insightLabel?: (id: string) => string,
): string {
  const parts: string[] = [];
  if (settings.search) parts.push(`search "${settings.search}"`);
  if (settings.material) parts.push(`material "${settings.material}"`);
  if (settings.minGrams !== null && settings.maxGrams !== null)
    parts.push(`${settings.minGrams}–${settings.maxGrams} g left`);
  else if (settings.minGrams !== null) parts.push(`at least ${settings.minGrams} g left`);
  else if (settings.maxGrams !== null) parts.push(`under ${settings.maxGrams} g left`);
  if (settings.lowOnly) parts.push("running low");
  if (settings.insight) parts.push(insightLabel?.(settings.insight) ?? settings.insight);
  if (settings.sort) parts.push(`sorted by ${settings.sort.key} ${settings.sort.direction}`);
  if (settings.group !== "none") parts.push(VIEW_GROUP_LABELS[settings.group].toLowerCase());
  return parts.length ? parts.join(", ") : "all spools";
}

// ---- Storage --------------------------------------------------------------------------------

export function readViews(): SavedView[] {
  try {
    return sanitizeViews(JSON.parse(read(local, SAVED_VIEWS_KEY) ?? "[]"));
  } catch {
    return [];
  }
}

/** Returns false when storage is unavailable or full, so the caller can say the view is not kept. */
export function saveViews(views: readonly SavedView[]): boolean {
  const clean = sanitizeViews(views);
  return write(local, SAVED_VIEWS_KEY, clean.length ? JSON.stringify(clean) : null);
}
