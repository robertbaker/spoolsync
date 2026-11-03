import { local, read, write } from "./browser/storage/access";

const KEY = "spoolsync:prefs";

export type SortKey = "source" | "vendor" | "material" | "name" | "remaining" | "location";
const SORT_KEYS: readonly SortKey[] = [
  "source",
  "vendor",
  "material",
  "name",
  "remaining",
  "location",
];
const SOURCE_FILTERS = ["all", "loaded", "api", "readonly"] as const;
const SYNC_FILTERS = ["all", "open", "missing"] as const;

export interface Preferences {
  /** How the loaded-spools table is ordered. */
  tableSort?: { key: SortKey; direction: "asc" | "desc" };
  /** Show only spools that are running low. */
  lowOnly?: boolean;
  /** Which services the Load page list shows. */
  sourceFilter?: (typeof SOURCE_FILTERS)[number];
  /** Which groups the Sync page list shows. */
  syncFilter?: (typeof SYNC_FILTERS)[number];
}

/** Keeps only values of the right shape, so a damaged or hand-edited entry cannot break a page. */
function sanitize(raw: unknown): Preferences {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const input = raw as Record<string, unknown>;
  const result: Preferences = {};
  const sort = input["tableSort"] as { key?: unknown; direction?: unknown } | undefined;
  if (
    sort &&
    typeof sort === "object" &&
    SORT_KEYS.includes(sort.key as SortKey) &&
    (sort.direction === "asc" || sort.direction === "desc")
  )
    result.tableSort = { key: sort.key as SortKey, direction: sort.direction };
  if (typeof input["lowOnly"] === "boolean") result.lowOnly = input["lowOnly"];
  if (SOURCE_FILTERS.includes(input["sourceFilter"] as never))
    result.sourceFilter = input["sourceFilter"] as Preferences["sourceFilter"] & string;
  if (SYNC_FILTERS.includes(input["syncFilter"] as never))
    result.syncFilter = input["syncFilter"] as Preferences["syncFilter"] & string;
  return result;
}

export function readPreferences(): Preferences {
  try {
    return sanitize(JSON.parse(read(local, KEY) ?? "{}"));
  } catch {
    return {};
  }
}

/** Merges a change into the saved preferences. A key set to `undefined` is forgotten. */
export function updatePreferences(patch: {
  [K in keyof Preferences]?: Preferences[K] | undefined;
}): void {
  const next: Record<string, unknown> = { ...readPreferences() };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) delete next[key];
    else next[key] = value;
  }
  const clean = sanitize(next);
  write(local, KEY, Object.keys(clean).length ? JSON.stringify(clean) : null);
}

export function clearPreferences(): void {
  write(local, KEY, null);
}
