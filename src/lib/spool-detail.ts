import { editReachesGroup } from "@spoolsync/core/core/compare";
import { pairKey, type MatchDecisions } from "@spoolsync/core/core/match";
import {
  SOURCE_IDS,
  SOURCE_LABELS,
  type CommonSpool,
  type CrossIds,
} from "@spoolsync/core/core/model";
import { findMatches } from "@spoolsync/core/planner";
import { spoolKey, type DuplicateGroup, type WeightChange } from "@spoolsync/core/workflow";

import type { StockHistory, StockPoint } from "./browser/storage/stock-history";

/**
 * What the spool detail drawer shows for one spool: the same physical spool as every loaded service
 * sees it, the other records it might be, and a matrix of field values. Pure so it can be tested
 * without a page; the drawer module draws it.
 */

export type DetailKind = "text" | "weight" | "money" | "colors" | "flag";

/** Dispatched on `document` with `{ key }` (a spool key) to open that spool's drawer. */
export const OPEN_SPOOL_EVENT = "spoolsync:open-spool";

export interface DetailRow {
  id: string;
  label: string;
  kind: DetailKind;
  /** One value per column, in column order. `null` or an empty list means not set. */
  values: Array<string | number | boolean | string[] | null>;
  /** True when the services disagree about this field. */
  differs: boolean;
}

export type CandidateReason = "suggestion" | "duplicate" | "confirmed";

/** Another record that may or may not be the same spool, with the pair a decision would name. */
export interface Candidate {
  spool: CommonSpool;
  reason: CandidateReason;
  /** The two record keys a "different spool" answer is stored under. */
  pair: [string, string];
  /** Plain-language reasons from the matcher or duplicate check, when there are any. */
  because: string[];
}

export interface SpoolDetail {
  key: string;
  /** The spool the drawer was opened for. */
  spool: CommonSpool;
  /** Every loaded record of this spool, one per service, the opened one first. */
  columns: CommonSpool[];
  candidates: Candidate[];
  /** The match group the spool sits in; bulk edits are staged against it. `null` when unmatched. */
  groupId: string | null;
  /** Whether some member is in a service that can store a changed remaining weight. */
  canStageWeight: boolean;
}

export const CROSS_ID_LABELS: Record<keyof CrossIds, string> = {
  spoolmanId: "Spoolman",
  spoolstockShortId: "Spoolstock",
  spoolioId: "Spoolio",
  tigertagUid: "TigerTag",
  threeDfpId: "3DFP",
  bambuddyId: "Bambuddy",
  filameterId: "FilaMeter",
  filadexId: "Filadex",
  filamentdbSerial: "FilamentDB",
  filamentDbAppId: "Filament DB",
  spoolmasterId: "SpoolMaster",
  spoolhoarderId: "Spool Hoarder",
  spoolappId: "Spool",
  spoolkeepId: "SpoolKeep",
};

/** Where `spools` are the records of every loaded service, finds the spool and what surrounds it. */
export function findSpoolDetail(
  spools: readonly CommonSpool[],
  key: string,
  decisions: MatchDecisions,
  duplicates: readonly DuplicateGroup[] = [],
): SpoolDetail | null {
  const byKey = new Map(spools.map((spool) => [spoolKey(spool), spool]));
  const spool = byKey.get(key);
  if (!spool) return null;

  const { groups, suggestions } = findMatches([...spools], decisions);
  const group = groups.find((candidate) =>
    SOURCE_IDS.some((source) => {
      const member = candidate.members[source];
      return member !== undefined && spoolKey(member) === key;
    }),
  );
  const members = group ? SOURCE_IDS.flatMap((source) => group.members[source] ?? []) : [spool];
  const columns = [spool, ...members.filter((member) => member !== spool)];
  const memberKeys = new Set(columns.map(spoolKey));

  const candidates: Candidate[] = [];
  const seen = new Set<string>(memberKeys);
  const add = (other: CommonSpool | undefined, candidate: Omit<Candidate, "spool">) => {
    if (!other) return;
    const otherKey = spoolKey(other);
    if (seen.has(otherKey)) return;
    seen.add(otherKey);
    candidates.push({ spool: other, ...candidate });
  };

  for (const suggestion of suggestions) {
    if (!group || !suggestion.groupIds.includes(group.id)) continue;
    const [first, second] = suggestion.pair;
    const other = memberKeys.has(first) ? second : first;
    add(byKey.get(other), {
      reason: "suggestion",
      pair: [memberKeys.has(first) ? first : second, other],
      because: suggestion.reasons,
    });
  }
  for (const duplicate of duplicates) {
    if (!duplicate.spools.some((member) => spoolKey(member) === key)) continue;
    for (const peer of duplicate.spools) {
      add(peer, { reason: "duplicate", pair: [key, spoolKey(peer)], because: duplicate.reasons });
    }
  }
  // Records that sit in this group only because the visitor said so can be taken back.
  const confirmed = new Set(decisions.confirmed);
  for (const other of columns) {
    const otherKey = spoolKey(other);
    if (otherKey !== key && confirmed.has(pairKey(key, otherKey)))
      candidates.push({
        spool: other,
        reason: "confirmed",
        pair: [key, otherKey],
        because: ["You confirmed these are the same spool."],
      });
  }
  return {
    key,
    spool,
    columns,
    candidates,
    groupId: group?.id ?? null,
    canStageWeight: group ? editReachesGroup(group, { remainingWeight: 0 }) : false,
  };
}

/** The decisions after saying two records are different spools; replaces an earlier "same". */
export function markDifferent(decisions: MatchDecisions, a: string, b: string): MatchDecisions {
  const pair = pairKey(a, b);
  return {
    confirmed: decisions.confirmed.filter((existing) => existing !== pair),
    rejected: decisions.rejected.includes(pair)
      ? [...decisions.rejected]
      : [...decisions.rejected, pair],
  };
}

const FIELDS: Array<{
  id: string;
  label: string;
  kind: DetailKind;
  value: (s: CommonSpool) => DetailRow["values"][number];
}> = [
  { id: "sourceId", label: "ID", kind: "text", value: (s) => s.sourceId },
  { id: "vendor", label: "Brand", kind: "text", value: (s) => s.vendor },
  { id: "material", label: "Material", kind: "text", value: (s) => s.material },
  { id: "name", label: "Name", kind: "text", value: (s) => s.name },
  { id: "colors", label: "Color", kind: "colors", value: (s) => s.colors },
  { id: "diameter", label: "Diameter (mm)", kind: "text", value: (s) => s.diameter },
  { id: "density", label: "Density (g/cm³)", kind: "text", value: (s) => s.density },
  { id: "nozzleTempMin", label: "Nozzle min (°C)", kind: "text", value: (s) => s.nozzleTempMin },
  { id: "nozzleTempMax", label: "Nozzle max (°C)", kind: "text", value: (s) => s.nozzleTempMax },
  { id: "bedTempMin", label: "Bed min (°C)", kind: "text", value: (s) => s.bedTempMin },
  { id: "bedTempMax", label: "Bed max (°C)", kind: "text", value: (s) => s.bedTempMax },
  { id: "upc", label: "Barcode", kind: "text", value: (s) => s.upc },
  { id: "initialWeight", label: "Full weight", kind: "weight", value: (s) => s.initialWeight },
  { id: "remainingWeight", label: "Remaining", kind: "weight", value: (s) => s.remainingWeight },
  {
    id: "emptySpoolWeight",
    label: "Empty spool",
    kind: "weight",
    value: (s) => s.emptySpoolWeight,
  },
  { id: "location", label: "Location", kind: "text", value: (s) => s.location },
  { id: "price", label: "Price", kind: "money", value: (s) => s.price },
  { id: "purchasedOn", label: "Purchased", kind: "text", value: (s) => s.purchasedOn },
  { id: "lotNr", label: "Lot", kind: "text", value: (s) => s.lotNr },
  { id: "comment", label: "Notes", kind: "text", value: (s) => s.comment },
  { id: "archived", label: "Archived", kind: "flag", value: (s) => s.archived },
];

const isEmpty = (value: DetailRow["values"][number]): boolean =>
  value === null || value === "" || (Array.isArray(value) && value.length === 0);

/** Every comparable field as a row of per-service values, flagging rows where services disagree. */
export function detailRows(columns: readonly CommonSpool[]): DetailRow[] {
  return FIELDS.map(({ id, label, kind, value }) => {
    const values = columns.map(value);
    // The id always differs between services and is shown for reference, not as a conflict.
    const distinct = new Set(values.map((v) => (isEmpty(v) ? "" : JSON.stringify(v))));
    return { id, label, kind, values, differs: id !== "sourceId" && distinct.size > 1 };
  });
}

/** Cross-service ids a record holds, as label and value pairs in a stable order. */
export function linkedIds(spool: CommonSpool): Array<{ label: string; value: string }> {
  return (Object.keys(CROSS_ID_LABELS) as Array<keyof CrossIds>).flatMap((field) => {
    const value = spool.crossIds[field];
    return value === undefined || value === ""
      ? []
      : [{ label: CROSS_ID_LABELS[field], value: String(value) }];
  });
}

export interface SpoolHistory {
  /** Weight change since the previous load of this service's file, when there was one. */
  change: WeightChange | null;
  /** The last few totals recorded for the service this record came from, newest last. */
  serviceTrail: StockPoint[];
}

/** How many of the service's recent loads the drawer lists. */
export const TRAIL_LENGTH = 5;

/** What is remembered about a record: its latest weight change and its service's recent totals. */
export function spoolHistory(
  spool: CommonSpool,
  changes: ReadonlyMap<string, WeightChange>,
  history: StockHistory,
): SpoolHistory {
  const key = spoolKey(spool);
  return {
    change: changes.get(key) ?? null,
    serviceTrail: (history[spool.source] ?? []).slice(-TRAIL_LENGTH),
  };
}

/** A heading such as `Spoolman #12`. */
export function recordTitle(spool: CommonSpool): string {
  return `${SOURCE_LABELS[spool.source]} ${spool.sourceId}`;
}
