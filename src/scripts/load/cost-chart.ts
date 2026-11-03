import type { LoadResult, SourceId } from "@spoolsync/core/core/model";
import { costPerKg, type CostBreakdown, type CostGrouping } from "@spoolsync/core/workflow";

import { loadMatchDecisions } from "~/lib/browser/storage";
import { local, read, write } from "~/lib/browser/storage/access";
import { formatMoney } from "~/lib/units";

import { h } from "../dom";
import { barRow, viewSwitcher } from "./chart-parts";
import { plural } from "./presentation";

const VIEW_KEY = "spoolsync:cost-view";
const TABLE_KEY = "spoolsync:cost-table-open";
const VIEWS: ReadonlyArray<{ id: CostGrouping; label: string; noun: string }> = [
  { id: "service", label: "By service", noun: "service" },
  { id: "material", label: "By material", noun: "material" },
  { id: "vendor", label: "By brand", noun: "brand" },
];

const money = (value: number) => formatMoney(value);

/**
 * What a kilogram of filament cost, for the spools whose service records a price. Prices are shown
 * as stored, in the service's own currency, without conversion. One measure and one hue, so no
 * legend; every bar has a tooltip, a name for assistive technology, and a row in the table view.
 * When nothing carries a price the chart says so instead of staying silent.
 */
export function renderCostChart(
  container: HTMLElement,
  results: ReadonlyMap<SourceId, LoadResult>,
): void {
  container.hidden = results.size === 0;
  if (container.hidden) return container.replaceChildren();
  const loaded = [...results.values()];
  const decisions = loadMatchDecisions();
  const breakdowns = new Map<CostGrouping, CostBreakdown>(
    VIEWS.map((view) => [view.id, costPerKg(view.id, loaded, decisions)]),
  );
  const available = VIEWS.filter((view) => breakdowns.get(view.id)!.rows.length > 0);

  if (!available.length) {
    container.replaceChildren(
      h(
        "figure",
        { "aria-labelledby": "loaded-cost-title" },
        h("p", { id: "loaded-cost-title", class: "text-sm font-semibold" }, "Cost per kilogram"),
        h(
          "p",
          { class: "mt-1 text-xs text-muted-foreground" },
          "No loaded spool has both a price and a full weight, so there is nothing to show yet. Cost per kilogram appears for services that record what a spool cost.",
        ),
      ),
    );
    return;
  }

  const stored = read(local, VIEW_KEY);
  const current = available.find((view) => view.id === stored) ?? available[0]!;
  const { rows, unpriced, totalSpools } = breakdowns.get(current.id)!;
  const max = Math.max(...rows.map((row) => row.costPerKg), 0);
  const description = (row: (typeof rows)[number]) =>
    `${row.label}: ${money(row.costPerKg)} per kilogram across ${plural(row.spools, "priced spool")}, ${money(row.totalPrice)} for ${row.kilograms.toLocaleString(undefined, { maximumFractionDigits: 2 })} kg`;

  const bars = rows.map((row) =>
    barRow({
      label: row.label,
      widthPercent: max ? Math.max((row.costPerKg / max) * 100, row.costPerKg > 0 ? 1.5 : 0) : 0,
      valueText: money(row.costPerKg),
      description: description(row),
      tooltip: `${row.label}: ${money(row.costPerKg)} per kg (${plural(row.spools, "spool")})`,
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
          current.noun.replace(/^./, (c) => c.toUpperCase()),
          "Priced spools",
          "Total price",
          "Full weight (kg)",
          "Cost per kg",
        ].map((heading) => h("th", { scope: "col", class: "py-1 pr-3 font-medium" }, heading)),
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
          h("td", { class: "py-1 pr-3 tabular-nums" }, money(row.totalPrice)),
          h(
            "td",
            { class: "py-1 pr-3 tabular-nums" },
            row.kilograms.toLocaleString(undefined, { maximumFractionDigits: 2 }),
          ),
          h("td", { class: "py-1 tabular-nums" }, money(row.costPerKg)),
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
      "View cost as table",
    ),
    table,
  );
  details.open = read(local, TABLE_KEY) === "1";
  details.addEventListener("toggle", () => write(local, TABLE_KEY, details.open ? "1" : "0"));

  const choose = (next: CostGrouping) => {
    write(local, VIEW_KEY, next);
    renderCostChart(container, results);
    container.querySelector<HTMLElement>(`[data-view="${next}"]`)?.focus();
  };

  container.replaceChildren(
    h(
      "figure",
      { "aria-labelledby": "loaded-cost-title" },
      available.length > 1
        ? viewSwitcher(
            available.map(({ id, label }) => ({ id, label })),
            current.id,
            "Group the cost chart",
            choose,
          )
        : null,
      h(
        "figcaption",
        { class: "mb-2" },
        h(
          "p",
          { id: "loaded-cost-title", class: "text-sm font-semibold" },
          `Cost per kilogram by ${current.noun}`,
        ),
        h(
          "p",
          { class: "text-xs text-muted-foreground" },
          `Total price over full weight, as recorded (no currency conversion; the symbol is only how amounts are displayed). ${unpriced ? `${plural(unpriced, "spool")} of ${totalSpools} without a price or full weight ${unpriced === 1 ? "is" : "are"} left out.` : "Every spool is included."}`,
        ),
      ),
      h("div", { class: "space-y-0.5" }, ...bars),
      details,
    ),
  );
}
