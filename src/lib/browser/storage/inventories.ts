import type { LoadResult, SourceId } from "@spoolsync/core/core/model";

import { read, write, session } from "./access";

const LOAD_KEY_PREFIX = "spoolsync:load:";

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
    return JSON.parse(raw) as LoadResult;
  } catch {
    return null;
  }
}

export function clearLoadResult(source: SourceId): void {
  write(session, LOAD_KEY_PREFIX + source, null);
}
