import {
  SOURCE_IDS,
  SOURCE_LABELS,
  type LoadResult,
  type SourceId,
} from "@spoolsync/core/core/model";
import { remainingByMaterial, summarizeInventory } from "@spoolsync/core/workflow";

import { loadMatchDecisions } from "~/lib/browser/storage";
import { local, read, write } from "~/lib/browser/storage/access";

import { h } from "../dom";
import { plural } from "./presentation";

type View = "service" | "material";

interface Datum {
  label: string;
  grams: number;
  spools: number;
  /** Extra clause for the accessible description, such as spools without a weight. */
  note?: string;
}

const VIEW_KEY = "spoolsync:chart-view";
const TABLE_KEY = "spoolsync:chart-table-open";
const VIEW_LABELS: Record<View, string> = { service: "By service", material: "By material" };

const grams = (value: number) => `${value.toLocaleString()} g`;

function byService(results: ReadonlyMap<SourceId, LoadResult>): Datum[] {
  return SOURCE_IDS.flatMap((source) => {
    const result = results.get(source);
    if (!result) return [];
    const summary = summarizeInventory(result);
    return [
      {
        label: SOURCE_LABELS[source],
        grams: summary.remainingGrams,
        spools: summary.spools,
        ...(summary.unknownWeights
          ? { note: `${plural(summary.unknownWeights, "spool")} without a weight are not counted` }
          : {}),
      },
    ];
  }).sort((a, b) => b.grams - a.grams || a.label.localeCompare(b.label));
}

const comparable = (data: Datum[]) => data.filter((datum) => datum.grams > 0).length >= 2;

/**
 * Remaining filament as ranked horizontal bars, by service or by material. One measure and one hue,
 * so there is no legend; the value sits at each bar's tip, and every bar has a tooltip, an
 * accessible name, and a row in the table view. A view is offered only when it has at least two
 * things to compare. The material view counts a spool linked across services once; the service view
 * cannot, so it says so.
 */
export function renderLoadedChart(
  container: HTMLElement,
  results: ReadonlyMap<SourceId, LoadResult>,
): void {
  const services = byService(results);
  const breakdown = remainingByMaterial([...results.values()], loadMatchDecisions());
  const materials: Datum[] = breakdown.rows.map((row) => ({
    label: row.material,
    grams: row.grams,
    spools: row.spools,
  }));
  const available: View[] = [
    ...(comparable(services) ? (["service"] as const) : []),
    ...(comparable(materials) ? (["material"] as const) : []),
  ];
  container.hidden = available.length === 0;
  if (!available.length) return container.replaceChildren();

  const stored = read(local, VIEW_KEY);
  const view: View = available.find((candidate) => candidate === stored) ?? (available[0] as View);
  const data = view === "service" ? services : materials;
  const total = data.reduce((sum, datum) => sum + datum.grams, 0);
  const max = Math.max(...data.map((datum) => datum.grams), 0);
  const share = (datum: Datum) => (total ? Math.round((datum.grams / total) * 100) : 0);
  const description = (datum: Datum) =>
    `${datum.label}: ${grams(datum.grams)} remaining across ${plural(datum.spools, "spool")}, ${share(datum)}% of the total` +
    (datum.note ? `; ${datum.note}` : "");

  const subtitle =
    view === "service"
      ? `${grams(total)} across the loaded services, in grams. A spool listed in several services counts in each.`
      : `${grams(total)} in total, in grams${breakdown.duplicatesRemoved ? `. ${plural(breakdown.duplicatesRemoved, "linked spool")} counted once.` : "."}`;

  const bars = data.map((datum) => {
    const width = max ? Math.max((datum.grams / max) * 100, datum.grams > 0 ? 1.5 : 0) : 0;
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
        "aria-label": description(datum),
      },
      h(
        "div",
        { class: "flex min-w-0 flex-1 items-center border-l border-border", "aria-hidden": "true" },
        bar,
        h(
          "span",
          { class: "ml-2 shrink-0 text-xs font-medium tabular-nums text-foreground" },
          grams(datum.grams),
        ),
      ),
      h(
        "span",
        {
          class:
            "pointer-events-none absolute left-0 top-full z-10 mt-0.5 hidden whitespace-nowrap rounded-md border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md group-hover:block group-focus:block",
          "aria-hidden": "true",
        },
        `${datum.label}: ${grams(datum.grams)} (${share(datum)}%)`,
      ),
    );
    return h(
      "div",
      { class: "flex items-center gap-3" },
      h(
        "span",
        { class: "w-28 shrink-0 truncate text-right text-xs text-muted-foreground sm:w-36" },
        datum.label,
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
        ...[view === "service" ? "Service" : "Material", "Spools", "Remaining (g)", "Share"].map(
          (heading) => h("th", { scope: "col", class: "py-1 pr-3 font-medium" }, heading),
        ),
      ),
    ),
    h(
      "tbody",
      {},
      ...data.map((datum) =>
        h(
          "tr",
          { class: "border-t" },
          h("th", { scope: "row", class: "py-1 pr-3 font-medium" }, datum.label),
          h("td", { class: "py-1 pr-3 tabular-nums" }, datum.spools.toLocaleString()),
          h("td", { class: "py-1 pr-3 tabular-nums" }, datum.grams.toLocaleString()),
          h("td", { class: "py-1 tabular-nums" }, `${share(datum)}%`),
        ),
      ),
    ),
  );

  const details = h(
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
  );
  // The chart redraws whenever inventories change, so remember whether the table was open.
  details.open = read(local, TABLE_KEY) === "1";
  details.addEventListener("toggle", () => write(local, TABLE_KEY, details.open ? "1" : "0"));

  const choose = (next: View) => {
    write(local, VIEW_KEY, next);
    renderLoadedChart(container, results);
    // Redrawing replaces the buttons, so hand keyboard focus to the new one.
    container.querySelector<HTMLElement>(`[data-view="${next}"]`)?.focus();
  };
  const switcher =
    available.length > 1
      ? h(
          "div",
          {
            class: "mb-3 inline-flex rounded-lg border p-0.5",
            role: "group",
            "aria-label": "Group the chart",
          },
          ...available.map((option) => {
            const button = h(
              "button",
              {
                type: "button",
                "data-view": option,
                "aria-pressed": String(option === view),
                class:
                  "rounded-md px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground aria-pressed:bg-primary/15 aria-pressed:text-primary-text focus-visible:outline-2 focus-visible:outline-primary",
              },
              VIEW_LABELS[option],
            );
            button.addEventListener("click", () => choose(option));
            return button;
          }),
        )
      : null;

  container.replaceChildren(
    h(
      "figure",
      { "aria-labelledby": "loaded-chart-title" },
      switcher,
      h(
        "figcaption",
        { class: "mb-2" },
        h(
          "p",
          { id: "loaded-chart-title", class: "text-sm font-semibold" },
          `Remaining filament ${view === "service" ? "by service" : "by material"}`,
        ),
        h("p", { class: "text-xs text-muted-foreground" }, subtitle),
      ),
      h("div", { class: "space-y-0.5" }, ...bars),
      details,
    ),
  );
}
