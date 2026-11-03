import {
  SOURCE_IDS,
  SOURCE_LABELS,
  type LoadResult,
  type SourceId,
} from "@spoolsync/core/core/model";
import { summarizeInventory } from "@spoolsync/core/workflow";

import { h } from "../dom";
import { plural } from "./presentation";

interface Row {
  source: SourceId;
  label: string;
  grams: number;
  spools: number;
  unknownWeights: number;
}

const grams = (value: number) => `${value.toLocaleString()} g`;

/**
 * Remaining filament per service as ranked horizontal bars. One measure, one hue, so there is no
 * legend; the value sits at each bar's tip, and every bar has a tooltip, an accessible name, and a
 * row in the table view. Shown only when at least two services have weights to compare, because a
 * lone bar is better as the stat card already above it.
 */
export function renderLoadedChart(
  container: HTMLElement,
  results: ReadonlyMap<SourceId, LoadResult>,
): void {
  const rows: Row[] = SOURCE_IDS.flatMap((source) => {
    const result = results.get(source);
    if (!result) return [];
    const summary = summarizeInventory(result);
    return [
      {
        source,
        label: SOURCE_LABELS[source],
        grams: summary.remainingGrams,
        spools: summary.spools,
        unknownWeights: summary.unknownWeights,
      },
    ];
  }).sort((a, b) => b.grams - a.grams || a.label.localeCompare(b.label));
  const total = rows.reduce((sum, row) => sum + row.grams, 0);
  const comparable = rows.filter((row) => row.grams > 0).length >= 2;
  container.hidden = !comparable;
  if (!comparable) return container.replaceChildren();

  const max = rows[0]!.grams;
  const share = (row: Row) => (total ? Math.round((row.grams / total) * 100) : 0);
  const description = (row: Row) =>
    `${row.label}: ${grams(row.grams)} remaining across ${plural(row.spools, "spool")}, ${share(row)}% of the total` +
    (row.unknownWeights
      ? `; ${plural(row.unknownWeights, "spool")} without a weight are not counted`
      : "");

  const bars = rows.map((row) => {
    const width = max ? Math.max((row.grams / max) * 100, row.grams > 0 ? 1.5 : 0) : 0;
    const bar = h("div", {
      class: "chart-bar h-4 rounded-r-[4px]",
      style: `width:${width}%;background:var(--chart-mark)`,
    });
    const mark = h(
      "div",
      {
        class: "chart-hit group relative flex min-w-0 flex-1 items-center gap-2 py-1 outline-none",
        tabindex: "0",
        role: "img",
        "aria-label": description(row),
      },
      h(
        "div",
        { class: "flex min-w-0 flex-1 items-center border-l border-border", "aria-hidden": "true" },
        bar,
        h(
          "span",
          { class: "ml-2 shrink-0 text-xs font-medium tabular-nums text-foreground" },
          grams(row.grams),
        ),
      ),
      h(
        "span",
        {
          class:
            "pointer-events-none absolute left-0 top-full z-10 mt-0.5 hidden whitespace-nowrap rounded-md border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md group-hover:block group-focus:block",
          "aria-hidden": "true",
        },
        `${row.label}: ${grams(row.grams)} (${share(row)}%)`,
      ),
    );
    return h(
      "div",
      { class: "flex items-center gap-3" },
      h(
        "span",
        { class: "w-28 shrink-0 truncate text-right text-xs text-muted-foreground sm:w-36" },
        row.label,
      ),
      mark,
    );
  });

  const table = h(
    "table",
    { class: "mt-2 w-full text-left text-xs" },
    h(
      "thead",
      { class: "text-muted-foreground" },
      h(
        "tr",
        {},
        ...["Service", "Spools", "Remaining (g)", "Share"].map((heading) =>
          h("th", { scope: "col", class: "py-1 pr-3 font-medium" }, heading),
        ),
      ),
    ),
    h(
      "tbody",
      {},
      ...rows.map((row) =>
        h(
          "tr",
          { class: "border-t" },
          h("th", { scope: "row", class: "py-1 pr-3 font-medium" }, row.label),
          h("td", { class: "py-1 pr-3 tabular-nums" }, row.spools.toLocaleString()),
          h("td", { class: "py-1 pr-3 tabular-nums" }, row.grams.toLocaleString()),
          h("td", { class: "py-1 tabular-nums" }, `${share(row)}%`),
        ),
      ),
    ),
  );

  container.replaceChildren(
    h(
      "figure",
      { "aria-labelledby": "loaded-chart-title" },
      h(
        "figcaption",
        { class: "mb-2" },
        h(
          "p",
          { id: "loaded-chart-title", class: "text-sm font-semibold" },
          "Remaining filament by service",
        ),
        h("p", { class: "text-xs text-muted-foreground" }, `${grams(total)} in total, in grams`),
      ),
      h("div", { class: "space-y-0.5" }, ...bars),
      h(
        "details",
        { class: "mt-3 text-xs" },
        h(
          "summary",
          {
            class:
              "cursor-pointer font-medium text-muted-foreground focus-visible:outline-2 focus-visible:outline-primary",
          },
          "View as table",
        ),
        table,
      ),
    ),
  );
}
