import { SOURCE_IDS, type CommonSpool } from "../model";
import type { RecordKey } from "./types";

export const SOURCE_INDEX = new Map<string, number>(SOURCE_IDS.map((id, index) => [id, index]));

/** `<source>:<sourceId>`, unique across everything loaded in a run. */

export const recordKey = (spool: CommonSpool): RecordKey => `${spool.source}:${spool.sourceId}`;

export const escapeGroupKeyPart = (key: string): string =>
  key.replaceAll("%", "%25").replaceAll("+", "%2B");

/** Stable group identity with escaped separators; ordinary numeric and UUID keys stay readable. */
export function groupKey(keys: readonly RecordKey[]): string {
  if (keys.length === 1) return escapeGroupKeyPart(keys[0]!);
  if (keys.length === 0) return "";
  return keys.map(escapeGroupKeyPart).sort().join("+");
}

/** Order-independent key for a pair of records, used for the user's match decisions. */
export function pairKey(a: RecordKey, b: RecordKey): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}
