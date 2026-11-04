import {
  DEFAULT_REFERENCE_SETTINGS,
  MAX_CACHED_FILAMENTS,
  sanitizeAcceptedReferences,
  sanitizeFilaments,
  sanitizeReferenceCacheMeta,
  sanitizeReferenceChoices,
  sanitizeReferenceSettings,
  type AcceptedReference,
  type ReferenceCacheEntry,
  type ReferenceCacheMeta,
  type ReferenceFilament,
  type ReferenceSettings,
} from "@spoolsync/core/core/reference";

import { local, read, session, write } from "./access";
import { browserCatalogBodies, type CatalogBodies } from "./catalog-db";

const SETTINGS_KEY = "spoolsync:reference-settings";
const CACHE_KEY = "spoolsync:reference-cache";
const ACCEPTED_KEY = "spoolsync:reference-accepted";
const CHOICES_KEY = "spoolsync:reference-choices";
const RULED_OUT_KEY = "spoolsync:reference-ruled-out";

/** Most spools whose "not any of these" answer is remembered. */
const MAX_RULED_OUT = 20_000;

/** Which provider and fields are in use, and what was entered for each service. A preference. */
export function loadReferenceSettings(): ReferenceSettings {
  try {
    const raw = read(local, SETTINGS_KEY);
    return raw ? sanitizeReferenceSettings(JSON.parse(raw)) : { ...DEFAULT_REFERENCE_SETTINGS };
  } catch {
    return { ...DEFAULT_REFERENCE_SETTINGS };
  }
}

export function saveReferenceSettings(settings: ReferenceSettings): void {
  const clean = sanitizeReferenceSettings(settings);
  const isDefault = JSON.stringify(clean) === JSON.stringify(sanitizeReferenceSettings(null));
  write(local, SETTINGS_KEY, isDefault ? null : JSON.stringify(clean));
}

let bodies: CatalogBodies = browserCatalogBodies;

/** Swaps where catalog records are kept; for tests, which have no IndexedDB. */
export function setCatalogBodies(replacement: CatalogBodies | null): void {
  bodies = replacement ?? browserCatalogBodies;
}

/** Stored descriptions of kept catalogs, one per provider, each still to be checked against its TTL. */
export function loadReferenceCache(): Record<string, ReferenceCacheMeta> {
  try {
    const raw = read(local, CACHE_KEY);
    const meta = sanitizeReferenceCacheMeta(JSON.parse(raw ?? "null"));
    // Earlier versions kept the records in this key too; drop them to free the space.
    if (raw?.includes('"filaments"')) writeMeta(meta);
    return meta;
  } catch {
    return {};
  }
}

function writeMeta(meta: Record<string, ReferenceCacheMeta>): boolean {
  return write(local, CACHE_KEY, Object.keys(meta).length ? JSON.stringify(meta) : null);
}

/** The kept records of one provider, re-validated; `null` when none are kept. */
export async function loadReferenceCatalog(
  providerId: string,
): Promise<ReferenceFilament[] | null> {
  try {
    return sanitizeFilaments(await bodies.get(providerId));
  } catch {
    return null;
  }
}

/**
 * Keeps a fetched catalog for next time: the records in IndexedDB, then a small description in
 * localStorage, so a description never points at records that are not there. A catalog too large or
 * a browser that will not store it is simply not cached (the page still works from memory), and the
 * result says whether it was stored.
 */
export async function saveReferenceCacheEntry(entry: ReferenceCacheEntry): Promise<boolean> {
  if (entry.filaments.length > MAX_CACHED_FILAMENTS) return false;
  try {
    if (!(await bodies.put(entry.providerId, entry.filaments))) return false;
  } catch {
    return false;
  }
  const { filaments, ...rest } = entry;
  return writeMeta({
    ...loadReferenceCache(),
    [entry.providerId]: {
      ...rest,
      sourceToken: entry.sourceToken ?? null,
      via: entry.via ?? "fetch",
      count: filaments.length,
    },
  });
}

/** Records that the kept catalog was confirmed current at `fetchedAt`; its records are untouched. */
export function touchReferenceCache(providerId: string, fetchedAt: number): void {
  const all = loadReferenceCache();
  const found = all[providerId];
  if (found) writeMeta({ ...all, [providerId]: { ...found, fetchedAt } });
}

export async function clearReferenceCache(providerId?: string): Promise<void> {
  const rest = loadReferenceCache();
  if (providerId) delete rest[providerId];
  writeMeta(providerId ? rest : {});
  try {
    await bodies.remove(providerId);
  } catch {
    // Nothing more can be done; the description is gone, so the records are never used.
  }
}

/**
 * Reference changes accepted on the Load page, for this tab only (like the Sync page's choices).
 * Each keeps the value it was proposed for, so one that no longer matches the loaded data is
 * ignored.
 */
export function loadAcceptedReferences(): AcceptedReference[] {
  try {
    return sanitizeAcceptedReferences(JSON.parse(read(session, ACCEPTED_KEY) ?? "[]"));
  } catch {
    return [];
  }
}

export function saveAcceptedReferences(accepted: readonly AcceptedReference[]): void {
  write(session, ACCEPTED_KEY, accepted.length ? JSON.stringify(accepted) : null);
}

/** The reference a person picked for spools whose match was ambiguous, or `none`. */
export function loadReferenceChoices(): Map<string, string> {
  try {
    return sanitizeReferenceChoices(JSON.parse(read(session, CHOICES_KEY) ?? "null"));
  } catch {
    return new Map();
  }
}

/**
 * Spools a person said no reference record fits ("none of these"), kept across visits so the same
 * question is not asked again. Only the spool key is stored, never what the spool is called.
 */
export function loadReferenceRuledOut(): string[] {
  try {
    const raw: unknown = JSON.parse(read(local, RULED_OUT_KEY) ?? "[]");
    return Array.isArray(raw)
      ? [
          ...new Set(
            raw.filter(
              (key): key is string =>
                typeof key === "string" && key.length > 0 && key.length <= 300,
            ),
          ),
        ].slice(0, MAX_RULED_OUT)
      : [];
  } catch {
    return [];
  }
}

export function saveReferenceRuledOut(keys: readonly string[]): void {
  write(local, RULED_OUT_KEY, keys.length ? JSON.stringify(keys.slice(0, MAX_RULED_OUT)) : null);
}

export function saveReferenceChoices(choices: ReadonlyMap<string, string>): void {
  write(session, CHOICES_KEY, choices.size ? JSON.stringify(Object.fromEntries(choices)) : null);
}
