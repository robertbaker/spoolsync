import {
  SOURCE_IDS,
  SOURCE_LABELS,
  type LoadResult,
  type SourceId,
} from "@spoolsync/core/core/model";
import { summarizeInventory } from "@spoolsync/core/workflow";

import { currentLowStockRule } from "~/lib/low-stock";
import { formatWeight } from "~/lib/units";

import { h } from "../dom";
import { plural } from "./presentation";

/** A card per loaded service with its headline numbers, shown above the table of spools. */
export function renderLoadedStats(
  container: HTMLElement,
  results: ReadonlyMap<SourceId, LoadResult>,
): void {
  const rule = currentLowStockRule();
  const cards = SOURCE_IDS.flatMap((source) => {
    const result = results.get(source);
    if (!result) return [];
    const summary = summarizeInventory(result, rule);
    const details = [
      plural(summary.brands, "brand"),
      plural(summary.materials, "material"),
      summary.archived ? `${summary.archived} archived` : null,
    ].filter(Boolean);
    return [
      h(
        "div",
        { class: "rounded-xl border bg-muted/20 p-3" },
        h(
          "p",
          { class: "text-xs font-medium uppercase tracking-wide text-muted-foreground" },
          SOURCE_LABELS[source],
        ),
        h(
          "p",
          { class: "mt-1 text-2xl font-bold tabular-nums" },
          summary.spools.toLocaleString(),
          " ",
          h(
            "span",
            { class: "text-sm font-normal text-muted-foreground" },
            summary.spools === 1 ? "spool" : "spools",
          ),
        ),
        h("p", { class: "mt-0.5 text-xs text-muted-foreground" }, details.join(" · ")),
        h(
          "p",
          { class: "mt-0.5 text-xs text-muted-foreground" },
          `${formatWeight(summary.remainingGrams)} remaining`,
          summary.unknownWeights
            ? ` (${summary.unknownWeights.toLocaleString()} without a weight)`
            : "",
        ),
        summary.runningLow
          ? h(
              "p",
              { class: "mt-1 text-xs font-medium text-warning-text" },
              `${summary.runningLow.toLocaleString()} running low`,
            )
          : null,
      ),
    ];
  });
  container.hidden = cards.length === 0;
  container.replaceChildren(...cards);
}
