import type { MatchDecisions } from "../core/match";
import { SOURCE_IDS, SOURCE_LABELS, type CommonSpool, type LoadResult } from "../core/model";
import { uniqueSpools } from "./breakdown";

export type CostGrouping = "service" | "material" | "vendor";

export interface CostShare {
  label: string;
  /** Weighted: the total price divided by the total full weight, in kilograms. */
  costPerKg: number;
  /** Spools that contribute: priced and with a known full weight. */
  spools: number;
  totalPrice: number;
  kilograms: number;
}

export interface CostBreakdown {
  rows: CostShare[];
  /** Spools that could not be priced per kilogram: no price, or no full weight to divide by. */
  unpriced: number;
  totalSpools: number;
}

const usable = (spool: CommonSpool) =>
  spool.price !== null &&
  Number.isFinite(spool.price) &&
  spool.price >= 0 &&
  spool.initialWeight !== null &&
  spool.initialWeight > 0;

const UNKNOWN = { material: "Unknown material", vendor: "Unknown brand" } as const;

/**
 * Cost per kilogram where a price was recorded. A group's figure is its total price over its total
 * full weight, so a large cheap spool outweighs a small dear one. Prices are the purchase price of
 * a whole spool in whatever currency the service stores; SpoolSync does not convert. Spools linked
 * across services count once for material and brand, taking the first record that has a price.
 * Returns no rows when nothing carries a price.
 */
export function costPerKg(
  grouping: CostGrouping,
  results: readonly LoadResult[],
  decisions: MatchDecisions,
  limit = 8,
): CostBreakdown {
  const totals = new Map<string, { label: string; price: number; grams: number; spools: number }>();
  const add = (label: string, spool: CommonSpool) => {
    const key = label.toLowerCase();
    const entry = totals.get(key) ?? { label, price: 0, grams: 0, spools: 0 };
    entry.price += spool.price!;
    entry.grams += spool.initialWeight!;
    entry.spools += 1;
    totals.set(key, entry);
  };
  let unpriced = 0;
  let totalSpools = 0;

  if (grouping === "service") {
    for (const source of SOURCE_IDS) {
      const result = results.find((candidate) => candidate.source === source);
      if (!result) continue;
      for (const spool of result.spools) {
        totalSpools++;
        if (usable(spool)) add(SOURCE_LABELS[source], spool);
        else unpriced++;
      }
    }
  } else {
    for (const { spool, members } of uniqueSpools(results, decisions)) {
      totalSpools++;
      const priced = usable(spool) ? spool : members.find(usable);
      if (!priced) {
        unpriced++;
        continue;
      }
      let label = spool[grouping]?.trim();
      if (!label) {
        for (const m of members) {
          const val = m[grouping]?.trim();
          if (val) {
            label = val;
            break;
          }
        }
      }
      add(label || UNKNOWN[grouping], priced);
    }
  }

  const toShare = (entry: { label: string; price: number; grams: number; spools: number }) => ({
    label: entry.label,
    costPerKg: entry.price / (entry.grams / 1000),
    spools: entry.spools,
    totalPrice: entry.price,
    kilograms: entry.grams / 1000,
  });
  const ranked = [...totals.values()]
    .map(toShare)
    .sort((a, b) => b.costPerKg - a.costPerKg || a.label.localeCompare(b.label));
  let rows = ranked;
  if (grouping !== "service" && ranked.length > limit) {
    const tail = ranked.slice(limit - 1);
    const price = tail.reduce((sum, row) => sum + row.totalPrice, 0);
    const kilograms = tail.reduce((sum, row) => sum + row.kilograms, 0);
    rows = [
      ...ranked.slice(0, limit - 1),
      {
        label: "Other",
        costPerKg: price / kilograms,
        spools: tail.reduce((sum, row) => sum + row.spools, 0),
        totalPrice: price,
        kilograms,
      },
    ].sort((a, b) => b.costPerKg - a.costPerKg || a.label.localeCompare(b.label));
  }
  return { rows, unpriced, totalSpools };
}
