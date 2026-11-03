import {
  SOURCE_IDS,
  SOURCE_LABELS,
  type LoadResult,
  type SourceId,
} from "@spoolsync/core/core/model";
import { remainingBy, summarizeInventory } from "@spoolsync/core/workflow";

import { loadMatchDecisions } from "~/lib/browser/storage";
import { local, read, write } from "~/lib/browser/storage/access";
import { formatWeight, gramsToUnit, readDisplaySettings } from "~/lib/units";

import { h } from "../dom";
import { barRow, viewSwitcher } from "./chart-parts";
import { plural } from "./presentation";

type View = "service" | "material" | "brand" | "color" | "location";

interface Datum {
  label: string;
  grams: number;
  spools: number;
  /** Extra clause for the accessible description, such as spools without a weight. */
  note?: string;
}

const VIEW_KEY = "spoolsync:chart-view";
const TABLE_KEY = "spoolsync:chart-table-open";
const VIEW_LABELS: Record<View, string> = {
  service: "By service",
  material: "By material",
  brand: "By brand",
  color: "By color",
  location: "By location",
};
/** The word for what each bar is, used in the title and the table heading. */
const VIEW_NOUNS: Record<View, string> = {
  service: "service",
  material: "material",
  brand: "brand",
  color: "color",
  location: "location",
};

const grams = (value: number) => formatWeight(value);

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
  const decisions = loadMatchDecisions();
  const grouped = (field: "material" | "vendor" | "color" | "location") => {
    const breakdown = remainingBy(field, [...results.values()], decisions);
    return {
      duplicatesRemoved: breakdown.duplicatesRemoved,
      data: breakdown.rows.map((row) => ({
        label: row.material,
        grams: row.grams,
        spools: row.spools,
      })),
    };
  };
  const views: Record<View, { data: Datum[]; duplicatesRemoved: number }> = {
    service: { data: services, duplicatesRemoved: 0 },
    material: grouped("material"),
    brand: grouped("vendor"),
    color: grouped("color"),
    location: grouped("location"),
  };
  const available = (["service", "material", "brand", "color", "location"] as const).filter(
    (candidate) => comparable(views[candidate].data),
  );
  container.hidden = available.length === 0;
  if (!available.length) return container.replaceChildren();

  const stored = read(local, VIEW_KEY);
  const view: View = available.find((candidate) => candidate === stored) ?? (available[0] as View);
  const { data, duplicatesRemoved } = views[view];
  const total = data.reduce((sum, datum) => sum + datum.grams, 0);
  const max = Math.max(...data.map((datum) => datum.grams), 0);
  const share = (datum: Datum) => (total ? Math.round((datum.grams / total) * 100) : 0);
  const description = (datum: Datum) =>
    `${datum.label}: ${grams(datum.grams)} remaining across ${plural(datum.spools, "spool")}, ${share(datum)}% of the total` +
    (datum.note ? `; ${datum.note}` : "");

  const subtitle =
    view === "service"
      ? `${grams(total)} across the loaded services. A spool listed in several services counts in each.`
      : `${grams(total)} in total${duplicatesRemoved ? `. ${plural(duplicatesRemoved, "linked spool")} counted once.` : "."}`;

  const bars = data.map((datum) =>
    barRow({
      label: datum.label,
      widthPercent: max ? Math.max((datum.grams / max) * 100, datum.grams > 0 ? 1.5 : 0) : 0,
      valueText: grams(datum.grams),
      description: description(datum),
      tooltip: `${datum.label}: ${grams(datum.grams)} (${share(datum)}%)`,
    }),
  );

  const table = h(
    "table",
    { class: "mt-2 w-full text-left text-xs" },
    h(
      "thead",
      { class: "text-muted-foreground" },
      h(
        "tr",
        {},
        ...[
          VIEW_NOUNS[view].replace(/^./, (c) => c.toUpperCase()),
          "Spools",
          `Remaining (${readDisplaySettings().weightUnit})`,
          "Share",
        ].map((heading) => h("th", { scope: "col", class: "py-1 pr-3 font-medium" }, heading)),
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
          h("td", { class: "py-1 pr-3 tabular-nums" }, gramsToUnit(datum.grams, readDisplaySettings().weightUnit).toLocaleString(undefined, {
              maximumFractionDigits: readDisplaySettings().weightUnit === "oz" ? 1 : 0,
            })),
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
      ? viewSwitcher(
          available.map((id) => ({ id, label: VIEW_LABELS[id] })),
          view,
          "Group the chart",
          choose,
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
          `Remaining filament by ${VIEW_NOUNS[view]}`,
        ),
        h("p", { class: "text-xs text-muted-foreground" }, subtitle),
      ),
      h("div", { class: "space-y-0.5" }, ...bars),
      details,
    ),
  );
}
