import type { MatchDecisions } from "../core/match";
import type { CommonSpool, LoadResult } from "../core/model";
import { DEFAULT_LOW_STOCK, isRunningLow, type LowStockRule } from "../core/stock";
import { uniqueSpools } from "./breakdown";

export interface ReorderItem {
  spool: CommonSpool;
  /** Share of the full weight left, 0 to 1, or `null` when the full weight is unknown. */
  fraction: number | null;
}

/** Spools that are running low, once each, emptiest first. */
export function reorderItems(
  results: readonly LoadResult[],
  decisions: MatchDecisions,
  rule: LowStockRule = DEFAULT_LOW_STOCK,
): ReorderItem[] {
  const items: ReorderItem[] = [];
  for (const { spool, members } of uniqueSpools(results, decisions)) {
    if (members.some((member) => isRunningLow(member, rule))) {
      items.push({
        spool,
        fraction:
          spool.remainingWeight !== null && spool.initialWeight
            ? spool.remainingWeight / spool.initialWeight
            : null,
      });
    }
  }
  return items.sort(
    (a, b) =>
      (a.fraction ?? 1) - (b.fraction ?? 1) ||
      (a.spool.remainingWeight ?? 0) - (b.spool.remainingWeight ?? 0) ||
      (a.spool.vendor ?? "").localeCompare(b.spool.vendor ?? "") ||
      (a.spool.source < b.spool.source ? -1 : a.spool.source > b.spool.source ? 1 : 0) ||
      (a.spool.sourceId < b.spool.sourceId ? -1 : a.spool.sourceId > b.spool.sourceId ? 1 : 0),
  );
}

/** A plain-text shopping list: one line per low spool, with what is left. */
export function formatReorderList(items: readonly ReorderItem[]): string {
  if (!items.length) return "Nothing is running low.";
  const lines = items.map(({ spool, fraction }) => {
    const label =
      [spool.vendor, spool.material, spool.name].filter(Boolean).join(" ") || spool.sourceId;
    const left =
      spool.remainingWeight === null
        ? "weight unknown"
        : `${Math.round(spool.remainingWeight)} g left`;
    const share = fraction === null ? "" : ` (${Math.round(fraction * 100)}%)`;
    return `- ${label}: ${left}${share}`;
  });
  return [`Running low (${items.length}):`, ...lines].join("\n");
}
