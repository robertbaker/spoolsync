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
      "Table sort, filters, the low-stock threshold, open panels, chart view, and recently used services.",
    keys: [
      "spoolsync:prefs",
      "spoolsync:low-stock-percent",
      "spoolsync:open-panels",
      "spoolsync:recent-sources",
      "spoolsync:chart-view",
      "spoolsync:chart-table-open",
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
    keys: ["spoolsync:load:*", "spoolsync:resolutions", "spoolsync:spoolman-token"],
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
