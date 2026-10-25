import type { LoadResult } from "./model";

/** API snapshots must be reloaded after changing server or account. Legacy snapshots fail closed. */
export function snapshotMatchesTarget(snapshot: LoadResult, identity: string | undefined): boolean {
  return snapshot.origin !== "api" || (!!identity && snapshot.connectionId === identity);
}
