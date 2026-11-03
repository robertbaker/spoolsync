import { colorFamily } from "../core/color";
import type { MatchDecisions } from "../core/match";
import { SOURCE_IDS, type CommonSpool, type LoadResult } from "../core/model";
import { findMatches } from "../planner";

export type BreakdownField = "material" | "vendor" | "color" | "location";

export interface MaterialShare {
  /** Display name; `Other` folds the tail and `Unknown ...` covers spools without a value. */
  material: string;
  grams: number;
  spools: number;
}

export interface MaterialBreakdown {
  rows: MaterialShare[];
  /** Spools that are listed in more than one service and were counted once. */
  duplicatesRemoved: number;
  totalGrams: number;
}

const UNKNOWN: Record<BreakdownField, string> = {
  material: "Unknown material",
  vendor: "Unknown brand",
  color: "Unknown color",
  location: "No location",
};

/** The value a spool is grouped under, or `undefined` when it has none. */
function valueOf(spool: CommonSpool, field: BreakdownField): string | undefined {
  if (field === "color") return spool.colors[0] ? colorFamily(spool.colors[0]) : undefined;
  return spool[field]?.trim() || undefined;
}

/** The record that stands for a linked spool: the first with a known weight, else the first. */
function representative(members: Partial<Record<(typeof SOURCE_IDS)[number], CommonSpool>>) {
  const ordered = SOURCE_IDS.flatMap((source) => members[source] ?? []);
  return ordered.find((spool) => spool.remainingWeight !== null) ?? ordered[0]!;
}

/**
 * Remaining filament grouped by material or brand, with a spool linked across services counted once
 * (by the same matching the Sync page uses, honouring saved answers). The largest `limit` materials
 * are listed and the rest folded into `Other`, so the result stays readable.
 */
export function remainingBy(
  field: BreakdownField,
  results: readonly LoadResult[],
  decisions: MatchDecisions,
  limit = 6,
): MaterialBreakdown {
  const spools = results.flatMap((result) => result.spools);
  const { groups } = findMatches(spools, decisions);
  const totals = new Map<string, MaterialShare>();
  let duplicatesRemoved = 0;
  for (const group of groups) {
    const members = SOURCE_IDS.flatMap((source) => group.members[source] ?? []);
    duplicatesRemoved += members.length - 1;
    const spool = representative(group.members);
    const material =
      members.map((candidate) => valueOf(candidate, field)).find(Boolean) ?? UNKNOWN[field];
    const key = material.toLowerCase();
    const entry = totals.get(key) ?? { material, grams: 0, spools: 0 };
    entry.grams += spool.remainingWeight ?? 0;
    entry.spools += 1;
    totals.set(key, entry);
  }
  const ranked = [...totals.values()]
    .map((entry) => ({ ...entry, grams: Math.round(entry.grams) }))
    .sort((a, b) => b.grams - a.grams || a.material.localeCompare(b.material));
  const rows = ranked.slice(0, limit);
  const tail = ranked.slice(limit);
  if (tail.length)
    rows.push({
      material: "Other",
      grams: tail.reduce((sum, entry) => sum + entry.grams, 0),
      spools: tail.reduce((sum, entry) => sum + entry.spools, 0),
    });
  return {
    rows,
    duplicatesRemoved,
    totalGrams: ranked.reduce((sum, entry) => sum + entry.grams, 0),
  };
}

/** Remaining filament grouped by material. */
export function remainingByMaterial(
  results: readonly LoadResult[],
  decisions: MatchDecisions,
  limit = 6,
): MaterialBreakdown {
  return remainingBy("material", results, decisions, limit);
}

export interface UniqueSpool {
  /** The record that stands for the spool: the first with a known weight, else the first. */
  spool: CommonSpool;
  /** Every loaded record of this spool, across services. */
  members: CommonSpool[];
}

/** One entry per physical spool, with a spool linked across services appearing once. */
export function uniqueSpools(
  results: readonly LoadResult[],
  decisions: MatchDecisions,
): UniqueSpool[] {
  const { groups } = findMatches(
    results.flatMap((result) => result.spools),
    decisions,
  );
  return groups.map((group) => ({
    spool: representative(group.members),
    members: SOURCE_IDS.flatMap((source) => group.members[source] ?? []),
  }));
}
