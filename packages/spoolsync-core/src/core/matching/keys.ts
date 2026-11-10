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

const escapePairPart = (key: string): string => key.replaceAll("%", "%25").replaceAll("|", "%7C");

/**
 * Order-independent key for a pair of records, used for the user's match decisions. `|` and `%`
 * inside a record ID are escaped, so the separator is unambiguous; ordinary IDs stay readable.
 */
export function pairKey(a: RecordKey, b: RecordKey): string {
  return a < b
    ? `${escapePairPart(a)}|${escapePairPart(b)}`
    : `${escapePairPart(b)}|${escapePairPart(a)}`;
}

/** The two record keys of a {@link pairKey}, or `undefined` when the text is not a pair key. */
export function splitPairKey(pair: string): [RecordKey, RecordKey] | undefined {
  const parts = pair.split("|");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return undefined;
  const unescape = (part: string) => part.replaceAll("%7C", "|").replaceAll("%25", "%");
  return [unescape(parts[0]), unescape(parts[1])];
}

/**
 * The current {@link pairKey} form of a stored pair key. Keys saved before `%` and `|` were escaped
 * hold the raw IDs; a `%` that is not part of an escape marks such a key, which is re-keyed. (A
 * legacy ID that literally contained "%25" or "%7C", or a `|`, cannot be told apart and stays as it
 * was.) Text that is not a pair key is returned unchanged.
 */
export function canonicalPairKey(pair: string): string {
  if (/%(?!25|7C)/.test(pair)) {
    const parts = pair.split("|");
    if (parts.length === 2 && parts[0] && parts[1]) return pairKey(parts[0], parts[1]);
    return pair;
  }
  const records = splitPairKey(pair);
  return records ? pairKey(records[0], records[1]) : pair;
}

/** Saved decisions with every pair key in its current form, without duplicates. */
export function canonicalDecisions(decisions: {
  confirmed: readonly string[];
  rejected: readonly string[];
}): { confirmed: string[]; rejected: string[] } {
  return {
    confirmed: [...new Set(decisions.confirmed.map(canonicalPairKey))],
    rejected: [...new Set(decisions.rejected.map(canonicalPairKey))],
  };
}
