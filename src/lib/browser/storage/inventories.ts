import {
  COMPARABLE_FIELDS,
  SOURCE_IDS,
  type CommonSpool,
  type LoadResult,
  type SourceId,
} from "@spoolsync/core/core/model";

import { read, write, session } from "./access";

const LOAD_KEY_PREFIX = "spoolsync:load:";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const isNullableString = (value: unknown) => value === null || typeof value === "string";
const isNullableNumber = (value: unknown) =>
  value === null || (typeof value === "number" && Number.isFinite(value));

function isStoredSpool(value: unknown, source: SourceId): value is CommonSpool {
  if (!isRecord(value) || value.source !== source || typeof value.sourceId !== "string")
    return false;
  // Session inventories can survive a deployment; older snapshots predate these nullable fields.
  if (!Object.hasOwn(value, "finish")) value.finish = null;
  if (!Object.hasOwn(value, "td")) value.td = null;
  if (
    !isRecord(value.crossIds) ||
    !Array.isArray(value.colors) ||
    !value.colors.every((x) => typeof x === "string")
  )
    return false;
  if (
    ![
      "vendor",
      "material",
      "name",
      "upc",
      "location",
      "purchasedOn",
      "lotNr",
      "finish",
      "comment",
    ].every((field) => isNullableString(value[field]))
  )
    return false;
  if (
    ![
      "diameter",
      "density",
      "nozzleTempMin",
      "nozzleTempMax",
      "bedTempMin",
      "bedTempMax",
      "initialWeight",
      "remainingWeight",
      "emptySpoolWeight",
      "price",
      "td",
    ].every((field) => isNullableNumber(value[field]))
  )
    return false;
  if (typeof value.archived !== "boolean" || !Object.hasOwn(value, "raw")) return false;
  return (
    value.unavailable === undefined ||
    (Array.isArray(value.unavailable) &&
      value.unavailable.every((field) =>
        COMPARABLE_FIELDS.some((comparableField) => comparableField === field),
      ))
  );
}

function isStoredInventory(value: unknown, source: SourceId): value is LoadResult {
  return (
    isRecord(value) &&
    typeof value.source === "string" &&
    SOURCE_IDS.some((candidate) => candidate === value.source) &&
    value.source === source &&
    typeof value.loadedAt === "string" &&
    Array.isArray(value.warnings) &&
    value.warnings.every((warning) => typeof warning === "string") &&
    Array.isArray(value.spools) &&
    value.spools.every((spool) => isStoredSpool(spool, source)) &&
    (value.origin === undefined || value.origin === "api" || value.origin === "file") &&
    (value.connectionId === undefined || typeof value.connectionId === "string")
  );
}

/**
 * What was loaded in this tab, so later steps can pick it up. Session storage only: closing the tab
 * drops it, and SpoolSync never keeps an inventory of its own.
 */
export function saveLoadResult(result: LoadResult): boolean {
  const key = LOAD_KEY_PREFIX + result.source;
  if (write(session, key, JSON.stringify(result))) return true;
  // A quota failure must not make Sync silently reuse an older version of this inventory.
  write(session, key, null);
  return false;
}

export function readLoadResult(source: SourceId): LoadResult | null {
  const raw = read(session, LOAD_KEY_PREFIX + source);
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (isStoredInventory(value, source)) return value;
  } catch {
    // Clear damaged storage below so it does not break the next page load again.
  }
  clearLoadResult(source);
  return null;
}

/** Whether a valid inventory is stored for this source. Damaged entries are cleared on read. */
export function hasLoadResult(source: SourceId): boolean {
  return readLoadResult(source) !== null;
}

export function clearLoadResult(source: SourceId): void {
  write(session, LOAD_KEY_PREFIX + source, null);
}
