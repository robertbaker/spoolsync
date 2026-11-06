import { local, read, write } from "~/lib/browser/storage/access";
import { readStockHistory, type StockPoint } from "~/lib/browser/storage/stock-history";
import { combinedTrend, trendChange } from "~/lib/stock-trend";
import { formatWeight, gramsToUnit, readDisplaySettings } from "~/lib/units";

import { h } from "../dom";
import { plural } from "./presentation";

const TABLE_KEY = "spoolsync:trend-table-open";
const SVG_NS = "http://www.w3.org/2000/svg";

const WIDTH = 600;
const HEIGHT = 210;
const PAD = { left: 56, right: 14, top: 14, bottom: 30 };

const grams = (value: number) => formatWeight(value);
const day = (at: string, withYear = false) =>
  new Date(at).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(withYear ? { year: "numeric" } : {}),
  });
const dayTime = (at: string) =>
  new Date(at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

function svg(tag: string, attrs: Record<string, string> = {}, ...children: Node[]): SVGElement {
  const element = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, value);
  element.append(...children);
  return element;
}

/** "Down 300 g since Nov 1", or the plain total when there is nothing to compare. */
export function describeTrend(points: readonly StockPoint[]): string {
  const last = points.at(-1);
  if (!last) return "";
  const change = trendChange(points);
  if (change === null) return `${grams(last.totalGrams)} remaining when last loaded.`;
  const since = day(points[0]!.at);
  const direction =
    change === 0 ? "Unchanged" : `${change < 0 ? "Down" : "Up"} ${grams(Math.abs(change))}`;
  return `${grams(last.totalGrams)} remaining now. ${direction} since ${since}.`;
}

/**
 * Total remaining filament at each load, drawn as one line in the chart hue. The points come from
 * the totals SpoolSync keeps in this browser (never the spools themselves), so a trend builds up
 * over visits. One series, so no legend; the table view lists every point, and the line is drawn as
 * a system color in forced-colors mode. Hidden until something is loaded and recorded.
 */
export function renderTrendChart(container: HTMLElement, hasLoaded: boolean): void {
  const points = combinedTrend(readStockHistory());
  container.hidden = !hasLoaded || points.length === 0;
  if (container.hidden) return container.replaceChildren();

  const title = h(
    "p",
    { id: "loaded-trend-title", class: "text-sm font-semibold" },
    "Remaining filament over time",
  );
  if (points.length < 2) {
    container.replaceChildren(
      h(
        "figure",
        { "aria-labelledby": "loaded-trend-title" },
        h("figcaption", {}, title),
        h(
          "p",
          { class: "mt-1 text-xs text-muted-foreground" },
          `${describeTrend(points)} A trend appears after your next load changes the total. Only totals are kept in this browser; Saved settings can forget them.`,
        ),
      ),
    );
    return;
  }

  const times = points.map((point) => Date.parse(point.at));
  const t0 = Math.min(...times);
  const t1 = Math.max(...times);
  const top = Math.max(...points.map((point) => point.totalGrams), 1);
  const plotWidth = WIDTH - PAD.left - PAD.right;
  const plotHeight = HEIGHT - PAD.top - PAD.bottom;
  const x = (time: number) =>
    PAD.left + (t1 === t0 ? plotWidth / 2 : ((time - t0) / (t1 - t0)) * plotWidth);
  const y = (value: number) => PAD.top + plotHeight - (value / top) * plotHeight;
  const spansYears = new Date(t0).getFullYear() !== new Date(t1).getFullYear();

  const coords = points.map((point) => [x(Date.parse(point.at)), y(point.totalGrams)] as const);
  const line = coords.map(
    ([px, py], index) => `${index ? "L" : "M"}${px.toFixed(1)} ${py.toFixed(1)}`,
  );
  const ticks = [0, top / 2, top];
  const unit = readDisplaySettings().weightUnit;
  const axisLabel = "fill-muted-foreground text-[10px]";

  const chart = svg(
    "svg",
    {
      viewBox: `0 0 ${WIDTH} ${HEIGHT}`,
      class: "block h-auto w-full max-w-3xl",
      role: "img",
      "aria-label": `Line chart of remaining filament over time. ${describeTrend(points)} ${plural(points.length, "load")} recorded between ${day(points[0]!.at, spansYears)} and ${day(points.at(-1)!.at, spansYears)}.`,
    },
    ...ticks.flatMap((tick) => [
      svg("line", {
        x1: String(PAD.left),
        x2: String(WIDTH - PAD.right),
        y1: String(y(tick)),
        y2: String(y(tick)),
        style: "stroke:var(--border);stroke-width:1",
      }),
      svg(
        "text",
        { x: String(PAD.left - 6), y: String(y(tick) + 3), "text-anchor": "end", class: axisLabel },
        document.createTextNode(Math.round(gramsToUnit(tick, unit)).toLocaleString()),
      ),
    ]),
    svg(
      "text",
      { x: String(PAD.left), y: String(HEIGHT - 8), "text-anchor": "start", class: axisLabel },
      document.createTextNode(day(points[0]!.at, spansYears)),
    ),
    svg(
      "text",
      {
        x: String(WIDTH - PAD.right),
        y: String(HEIGHT - 8),
        "text-anchor": "end",
        class: axisLabel,
      },
      document.createTextNode(day(points.at(-1)!.at, spansYears)),
    ),
    svg("path", {
      d: line.join(""),
      class: "chart-line",
      fill: "none",
      style: "stroke:var(--chart-mark)",
      "stroke-width": "2.5",
      "stroke-linejoin": "round",
      "stroke-linecap": "round",
    }),
    ...coords.map(([px, py], index) =>
      svg(
        "circle",
        {
          cx: px.toFixed(1),
          cy: py.toFixed(1),
          r: "3.5",
          class: "chart-point",
          style: "fill:var(--chart-mark)",
          "aria-hidden": "true",
        },
        svg(
          "title",
          {},
          document.createTextNode(
            `${dayTime(points[index]!.at)}: ${grams(points[index]!.totalGrams)}`,
          ),
        ),
      ),
    ),
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
        ...["Loaded", "Spools", `Remaining (${unit})`].map((heading) =>
          h("th", { scope: "col", class: "py-1 pr-3 font-medium" }, heading),
        ),
      ),
    ),
    h(
      "tbody",
      {},
      ...points.toReversed().map((point) =>
        h(
          "tr",
          { class: "border-t" },
          h("th", { scope: "row", class: "py-1 pr-3 font-medium" }, dayTime(point.at)),
          h("td", { class: "py-1 pr-3 tabular-nums" }, point.spoolCount.toLocaleString()),
          h(
            "td",
            { class: "py-1 pr-3 tabular-nums" },
            gramsToUnit(point.totalGrams, unit).toLocaleString(undefined, {
              maximumFractionDigits: unit === "oz" ? 1 : 0,
            }),
          ),
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
      "View trend as table",
    ),
    table,
  );
  details.open = read(local, TABLE_KEY) === "1";
  details.addEventListener("toggle", () => write(local, TABLE_KEY, details.open ? "1" : "0"));

  container.replaceChildren(
    h(
      "figure",
      { "aria-labelledby": "loaded-trend-title" },
      h(
        "figcaption",
        { class: "mb-2" },
        title,
        h(
          "p",
          { class: "text-xs text-muted-foreground" },
          `${describeTrend(points)} Services join the total when first loaded; a spool listed in several services counts in each. Only totals are kept in this browser.`,
        ),
      ),
      chart,
      details,
    ),
  );
}
