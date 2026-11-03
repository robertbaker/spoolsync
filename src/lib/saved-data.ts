import { isLowStockPercent } from "@spoolsync/core/core/stock";

import { sanitizeFileHistory } from "./browser/storage/file-history";
import { sanitizeWatchlist } from "./browser/storage/insights";
import { sanitizeStockHistory } from "./browser/storage/stock-history";
import { LABEL_PRESETS, LABEL_SELECTIONS } from "./labels/labels";
import { sanitizePreferences } from "./preferences";

/**
 * What SpoolSync keeps in this browser, grouped in plain words, so the visitor can see it and take
 * any part of it back. Everything lives under the `spoolsync:` prefix; nothing is sent anywhere.
 */
export interface SavedGroup {
  id: string;
  label: string;
  description: string;
  /** Keys that belong to the group (exact names), or a prefix ending in `*`. */
  keys: readonly string[];
  storage: "local" | "session";
}

export const SAVED_GROUPS: readonly SavedGroup[] = [
  {
    id: "connections",
    label: "Connections",
    description:
      "Spoolman and other server addresses, tokens you chose to keep, and your TigerTag sign-in.",
    keys: [
      "spoolsync:spoolman-connection",
      "spoolsync:spoolman-token",
      "spoolsync:tigertag-session",
      "spoolsync:bambuddy-connection",
      "spoolsync:filamentdb-connection",
    ],
    storage: "local",
  },
  {
    id: "preferences",
    label: "Preferences",
    description:
      "Table sort, filters, the low-stock threshold, auto-fetch, open panels, chart views, label options, and recently used services.",
    keys: [
      "spoolsync:prefs",
      "spoolsync:low-stock-percent",
      "spoolsync:open-panels",
      "spoolsync:recent-sources",
      "spoolsync:chart-view",
      "spoolsync:chart-table-open",
      "spoolsync:trend-table-open",
      "spoolsync:cost-view",
      "spoolsync:cost-table-open",
      "spoolsync:label-options",
      "spoolsync:last-seen-version",
      "spoolsync:changelog-cache",
    ],
    storage: "local",
  },
  {
    id: "files",
    label: "File history",
    description:
      "The name, size, and date of the last file used for each service. Never the contents.",
    keys: ["spoolsync:file-history"],
    storage: "local",
  },
  {
    id: "snapshots",
    label: "Previous inventory summaries",
    description:
      "For each service, the id, remaining weight, and name of every spool in the last file you loaded, so the next load can show what changed. Kept on this device only and never exported.",
    keys: ["spoolsync:inventory-snapshots"],
    storage: "local",
  },
  {
    id: "watchlist",
    label: "Watchlist",
    description: "The spools you pinned to watch for weight drops (service and id only).",
    keys: ["spoolsync:watchlist"],
    storage: "local",
  },
  {
    id: "history",
    label: "Stock history",
    description:
      "The total remaining weight and spool count of each service at each load, for the trend chart. Never names or contents.",
    keys: ["spoolsync:stock-history"],
    storage: "local",
  },
  {
    id: "sync-history",
    label: "Sync history",
    description:
      "When each apply or download happened, with counts per service and any error text. Never spool details. Kept on this device only and never exported.",
    keys: ["spoolsync:sync-history"],
    storage: "local",
  },
  {
    id: "answers",
    label: "Match answers",
    description: "Which possible matches you confirmed or rejected.",
    keys: ["spoolsync:match-decisions"],
    storage: "local",
  },
  {
    id: "inventories",
    label: "Loaded inventories (this tab only)",
    description:
      "Spools you loaded and the choices made on the Sync page. They clear when the tab closes.",
    keys: [
      "spoolsync:load:*",
      "spoolsync:resolutions",
      "spoolsync:bulk-edits",
      "spoolsync:spoolman-token",
    ],
    storage: "session",
  },
];

export interface SavedItem {
  group: SavedGroup;
  /** Keys that currently hold something. */
  keys: string[];
  bytes: number;
}

function store(kind: SavedGroup["storage"]): Storage | null {
  try {
    return kind === "local" ? localStorage : sessionStorage;
  } catch {
    return null;
  }
}

function keysIn(storage: Storage, group: SavedGroup): string[] {
  const names: string[] = [];
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (!key) continue;
    if (
      group.keys.some((pattern) =>
        pattern.endsWith("*") ? key.startsWith(pattern.slice(0, -1)) : key === pattern,
      )
    )
      names.push(key);
  }
  return names;
}

/** What is saved right now, for every group that holds something. */
export function listSavedData(): SavedItem[] {
  return SAVED_GROUPS.flatMap((group) => {
    const storage = store(group.storage);
    if (!storage) return [];
    const keys = keysIn(storage, group);
    if (!keys.length) return [];
    const bytes = keys.reduce(
      (sum, key) => sum + key.length + (storage.getItem(key)?.length ?? 0),
      0,
    );
    return [{ group, keys, bytes }];
  });
}

/** Removes everything in one group. Returns how many entries were removed. */
export function forgetGroup(id: string): number {
  const group = SAVED_GROUPS.find((candidate) => candidate.id === id);
  const storage = group && store(group.storage);
  if (!group || !storage) return 0;
  const keys = keysIn(storage, group);
  for (const key of keys) storage.removeItem(key);
  return keys.length;
}

/** Removes everything SpoolSync saved, in both kinds of storage, including keys no group names. */
export function forgetEverything(): number {
  let removed = 0;
  for (const kind of ["local", "session"] as const) {
    const storage = store(kind);
    if (!storage) continue;
    const keys: string[] = [];
    for (let index = 0; index < storage.length; index++) {
      const key = storage.key(index);
      if (key?.startsWith("spoolsync:")) keys.push(key);
    }
    for (const key of keys) storage.removeItem(key);
    removed += keys.length;
  }
  return removed;
}

export function formatBytes(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
}

// ---- Moving settings between browsers -------------------------------------------------------

const EXPORT_FORMAT = "spoolsync-settings";
const EXPORT_VERSION = 1;
/** The groups that are safe and useful to carry over. Connections hold credentials and stay put. */
const PORTABLE_GROUPS = ["preferences", "files", "watchlist", "history", "answers"] as const;

const CHART_VIEWS = ["service", "material", "brand", "color", "location"];
const COST_VIEWS = ["service", "material", "vendor"];

const isStringList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

/** Whether a stored value has the shape its key expects, so an imported file cannot plant junk. */
function isValidEntry(key: string, text: string): boolean {
  try {
    switch (key) {
      case "spoolsync:prefs": {
        const clean = sanitizePreferences(JSON.parse(text));
        return Object.keys(clean).length > 0;
      }
      case "spoolsync:file-history":
        return Object.keys(sanitizeFileHistory(JSON.parse(text))).length > 0;
      case "spoolsync:watchlist":
        return sanitizeWatchlist(JSON.parse(text)).length > 0;
      case "spoolsync:low-stock-percent":
        return isLowStockPercent(Number(text));
      case "spoolsync:open-panels":
      case "spoolsync:recent-sources":
        return isStringList(JSON.parse(text));
      case "spoolsync:chart-view":
        return CHART_VIEWS.includes(text);
      case "spoolsync:chart-table-open":
      case "spoolsync:trend-table-open":
      case "spoolsync:cost-table-open":
        return text === "0" || text === "1";
      case "spoolsync:cost-view":
        return COST_VIEWS.includes(text);
      case "spoolsync:stock-history":
        return Object.keys(sanitizeStockHistory(JSON.parse(text))).length > 0;
      case "spoolsync:label-options": {
        const value = JSON.parse(text) as { preset?: unknown; selection?: unknown };
        return (
          LABEL_PRESETS.some((preset) => preset.id === value.preset) &&
          LABEL_SELECTIONS.some((selection) => selection.id === value.selection)
        );
      }
      case "spoolsync:match-decisions": {
        const value = JSON.parse(text) as { confirmed?: unknown; rejected?: unknown };
        return isStringList(value.confirmed) && isStringList(value.rejected);
      }
      default:
        return false;
    }
  } catch {
    return false;
  }
}

const portableKeys = () =>
  SAVED_GROUPS.filter((group) => (PORTABLE_GROUPS as readonly string[]).includes(group.id)).flatMap(
    (group) => group.keys,
  );

/** The portable settings as a JSON document. Credentials and loaded inventories are never included. */
export function exportSettings(now: Date = new Date()): string {
  const entries: Record<string, string> = {};
  const storage = store("local");
  if (storage)
    for (const key of portableKeys()) {
      const value = storage.getItem(key);
      if (value !== null && isValidEntry(key, value)) entries[key] = value;
    }
  return `${JSON.stringify({ format: EXPORT_FORMAT, version: EXPORT_VERSION, exportedAt: now.toISOString(), entries }, null, 2)}\n`;
}

export interface ImportResult {
  imported: string[];
  skipped: string[];
}

/**
 * Applies an exported settings document. Only portable keys with valid values are written; anything
 * else is skipped and named, so a hand-edited or hostile file cannot change credentials or store
 * arbitrary data. Throws when the text is not a SpoolSync settings export at all.
 */
export function importSettings(text: string): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("This file is not valid JSON. Choose a settings file exported from SpoolSync.");
  }
  const document = parsed as { format?: unknown; version?: unknown; entries?: unknown };
  if (!document || typeof document !== "object" || document.format !== EXPORT_FORMAT)
    throw new Error("This is not a SpoolSync settings export.");
  if (document.version !== EXPORT_VERSION)
    throw new Error(
      `This export is version ${String(document.version)}, which this page cannot read.`,
    );
  if (!document.entries || typeof document.entries !== "object" || Array.isArray(document.entries))
    throw new Error("This settings export has no entries.");
  const storage = store("local");
  if (!storage) throw new Error("Browser storage is unavailable, so settings cannot be imported.");
  const allowed = new Set(portableKeys());
  const result: ImportResult = { imported: [], skipped: [] };
  for (const [key, value] of Object.entries(document.entries as Record<string, unknown>)) {
    if (allowed.has(key) && typeof value === "string" && isValidEntry(key, value)) {
      storage.setItem(key, value);
      result.imported.push(key);
    } else result.skipped.push(key);
  }
  return result;
}
