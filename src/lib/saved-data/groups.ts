import { browserCatalogBodies } from "../browser/storage/catalog-db";
import { invalidateApiInventory } from "../browser/storage/invalidate";

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
      "spoolsync:filament-db-connection",
    ],
    storage: "local",
  },
  {
    id: "preferences",
    label: "Preferences",
    description:
      "Table sort, filters, the low-stock threshold, auto-fetch, open panels, chart views, label options, saved table views, which data-cleanup rules are on, the reference-data provider and field choices, and recently used services, and your accent color.",
    keys: [
      "spoolsync:prefs",
      "spoolsync:palette",
      "spoolsync:low-stock-percent",
      "spoolsync:open-panels",
      "spoolsync:recent-sources",
      "spoolsync:chart-view",
      "spoolsync:chart-table-open",
      "spoolsync:trend-table-open",
      "spoolsync:cost-view",
      "spoolsync:cost-table-open",
      "spoolsync:label-options",
      "spoolsync:saved-views",
      "spoolsync:last-seen-version",
      "spoolsync:changelog-cache",
      "spoolsync:display",
      "spoolsync:setup-dismissed",
      "spoolsync:palette-recent",
      "spoolsync:sidebar",
      "spoolsync:cleanup-settings",
      "spoolsync:reference-settings",
      "spoolsync:weigh-in",
      "spoolsync:changelog-read",
      "spoolsync:language",
      "spoolsync:table-columns",
      "spoolsync:column-maps",
    ],
    storage: "local",
  },
  {
    id: "reference-cache",
    label: "Reference data cache",
    description:
      "A catalog from a reference service (such as the Open Filament Database or FilamentColors) with its credit line, kept so it is not downloaded again; the records are in this browser's database and a short description is listed here. Kept on this device only and never exported.",
    keys: ["spoolsync:reference-cache"],
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
      "For each service, the id, remaining weight, and name of every spool in the last file you loaded, so the next load can show what changed, plus a short copy of that comparison for the Since your last visit panel. Kept on this device only and never exported.",
    keys: ["spoolsync:inventory-snapshots", "spoolsync:since-visit"],
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
      "The total remaining weight and spool count of each service at each load, and the data health score at each load, for the trend charts. Never names or contents.",
    keys: ["spoolsync:stock-history", "spoolsync:health-history"],
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
    id: "reference-ruled-out",
    label: "Reference matches ruled out",
    description:
      "Spools you said no reference record fits, by service and id only, so the question is not asked again. Kept on this device only and never exported.",
    keys: ["spoolsync:reference-ruled-out"],
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
      "spoolsync:cleanup-accepted",
      "spoolsync:reference-accepted",
      "spoolsync:reference-choices",
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

export function store(kind: SavedGroup["storage"]): Storage | null {
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
    const primary = store(group.storage);
    if (!primary) return [];
    const keys = new Set(keysIn(primary, group));
    let bytes = [...keys].reduce(
      (sum, key) => sum + key.length + (primary.getItem(key)?.length ?? 0),
      0,
    );
    if (group.id === "connections") {
      const secondary = store("session");
      if (secondary) {
        for (const key of keysIn(secondary, group)) {
          if (key === "spoolsync:spoolman-token") continue;
          keys.add(key);
          bytes += key.length + (secondary.getItem(key)?.length ?? 0);
        }
      }
    }
    if (!keys.size) return [];
    return [{ group, keys: [...keys], bytes }];
  });
}

/** Removes everything in one group. Returns how many entries were removed. */
export function forgetGroup(id: string): number {
  const group = SAVED_GROUPS.find((candidate) => candidate.id === id);
  const storage = group && store(group.storage);
  if (!group || !storage) return 0;
  const keys = keysIn(storage, group);
  for (const key of keys) storage.removeItem(key);
  let removed = keys.length;
  if (id === "connections") {
    const secondary = store("session");
    if (secondary) {
      for (const key of keysIn(secondary, group)) {
        secondary.removeItem(key);
        removed++;
      }
    }
    for (const source of [
      "spoolman",
      "tigertag",
      "bambuddy",
      "filamentdb",
      "filamentDbApp",
    ] as const)
      invalidateApiInventory(source);
  }
  if (id === "reference-cache") void forgetCatalogRecords();
  return removed;
}

/** The kept reference catalogs' records live in IndexedDB; a failure to empty it is not an error. */
async function forgetCatalogRecords(): Promise<void> {
  try {
    await browserCatalogBodies.remove();
  } catch {
    // Nothing to do: without its description a kept catalog is never used.
  }
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
  void forgetCatalogRecords();
  return removed;
}

export function formatBytes(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
}
