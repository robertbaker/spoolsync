import type { CommonSpool } from "../model";
import type { RecordKey } from "./types";

/** `<source>:<sourceId>`, unique across everything loaded in a run. */

export const recordKey = (spool: CommonSpool): RecordKey => `${spool.source}:${spool.sourceId}`;

/** Stable group identity with escaped separators; ordinary numeric and UUID keys stay readable. */
export function groupKey(keys: readonly RecordKey[]): string {
  return keys
    .map((key) => key.replaceAll("%", "%25").replaceAll("+", "%2B"))
    .sort()
    .join("+");
}

/** Order-independent key for a pair of records, used for the user's match decisions. */
export function pairKey(a: RecordKey, b: RecordKey): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}
