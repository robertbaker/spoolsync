import { SOURCE_LABELS } from "@spoolsync/core/core/model";
import type { WeightChange } from "@spoolsync/core/workflow";

import { readStockHistory } from "~/lib/browser/storage/stock-history";
import {
  detailRows,
  linkedIds,
  recordTitle,
  spoolHistory,
  type DetailRow,
  type SpoolDetail,
} from "~/lib/spool-detail";
import { formatMoney, formatWeight } from "~/lib/units";

import { h } from "../dom";
import type { LoadInsights } from "./insights";

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString();
}

function cellContent(row: DetailRow, value: DetailRow["values"][number]): Node | string {
  if (value === null || value === "" || (Array.isArray(value) && value.length === 0)) return "—";
  switch (row.kind) {
    case "weight":
      return formatWeight(typeof value === "number" ? value : null);
    case "money":
      return typeof value === "number" ? formatMoney(value) : String(value);
    case "flag":
      return value === true ? "Yes" : "No";
    case "colors":
      return h(
        "span",
        { class: "flex flex-wrap items-center gap-1" },
        ...(value as string[]).map((color) => {
          const swatch = h("span", {
            class: "filament-swatch inline-block size-4 rounded-full border",
            "aria-hidden": "true",
          });
          swatch.style.backgroundColor = `#${color}`;
          return h(
            "span",
            { class: "inline-flex items-center gap-1 text-xs" },
            swatch,
            `#${color}`,
          );
        }),
      );
    default:
      return String(value);
  }
}

/** The weight changes seen since the previous load, by `source:id`. */
export function changesByKey(changes: LoadInsights["changes"]): Map<string, WeightChange> {
  const map = new Map<string, WeightChange>();
  for (const [source, entry] of changes) {
    for (const change of [...(entry.changes?.gains ?? []), ...(entry.changes?.drops ?? [])])
      map.set(`${source}:${change.id}`, change);
  }
  return map;
}

export function section(title: string, id: string, ...children: Array<Node | null>): HTMLElement {
  return h(
    "section",
    { class: "mt-6", "aria-labelledby": id },
    h(
      "h3",
      { id, class: "text-sm font-semibold uppercase tracking-wide text-muted-foreground" },
      title,
    ),
    ...children,
  );
}

export function fieldTable(detail: SpoolDetail): HTMLElement {
  const rows = detailRows(detail.columns);
  return h(
    "div",
    {
      class: "mt-2 overflow-x-auto rounded-lg border",
      tabindex: "0",
      role: "region",
      "aria-label": "Fields by service (scrollable)",
    },
    h(
      "table",
      { class: "w-full text-sm" },
      h("caption", { class: "sr-only" }, "Every field of this spool in each loaded service"),
      h(
        "thead",
        {},
        h(
          "tr",
          {},
          h("th", { scope: "col", class: "text-left" }, "Field"),
          ...detail.columns.map((column) =>
            h("th", { scope: "col", class: "text-left" }, SOURCE_LABELS[column.source]),
          ),
        ),
      ),
      h(
        "tbody",
        {},
        ...rows.map((row) =>
          h(
            "tr",
            { class: row.differs ? "bg-warning/10" : "" },
            h(
              "th",
              { scope: "row", class: "whitespace-nowrap text-left font-medium" },
              row.label,
              row.differs
                ? h("span", { class: "ml-2 text-xs text-warning-text" }, "differs")
                : null,
            ),
            ...row.values.map((value) =>
              h("td", { class: "align-top break-words" }, cellContent(row, value)),
            ),
          ),
        ),
      ),
    ),
  );
}

export function idsList(detail: SpoolDetail): HTMLElement {
  return h(
    "ul",
    { class: "mt-2 grid gap-2 text-sm sm:grid-cols-2" },
    ...detail.columns.map((column) => {
      const ids = linkedIds(column);
      return h(
        "li",
        { class: "rounded-lg border p-3" },
        h("p", { class: "font-medium" }, recordTitle(column)),
        ids.length
          ? h(
              "ul",
              { class: "mt-1 text-xs text-muted-foreground" },
              ...ids.map(({ label, value }) =>
                h(
                  "li",
                  { class: "break-all" },
                  `${label}: `,
                  h("span", { class: "font-mono" }, value),
                ),
              ),
            )
          : h("p", { class: "mt-1 text-xs text-muted-foreground" }, "No ids from other services."),
      );
    }),
  );
}

export function historyList(detail: SpoolDetail, changes: Map<string, WeightChange>): HTMLElement {
  const stockHistory = readStockHistory();
  return h(
    "div",
    { class: "mt-2 grid gap-2 text-sm" },
    ...detail.columns.map((column) => {
      const { change, serviceTrail } = spoolHistory(column, changes, stockHistory);
      return h(
        "div",
        { class: "rounded-lg border p-3" },
        h("p", { class: "font-medium" }, recordTitle(column)),
        h(
          "p",
          { class: "mt-1 text-xs" },
          change
            ? `${change.delta < 0 ? "Dropped" : "Gained"} ${formatWeight(Math.abs(change.delta))} since the previous load (${formatWeight(change.before)} to ${formatWeight(change.after)}).`
            : "No weight change recorded since the previous load of this file.",
        ),
        serviceTrail.length
          ? h(
              "div",
              { class: "mt-2" },
              h(
                "p",
                { class: "text-xs text-muted-foreground" },
                `${SOURCE_LABELS[column.source]} totals at recent loads (SpoolSync keeps totals per service, not per spool):`,
              ),
              h(
                "ul",
                { class: "mt-1 text-xs" },
                ...serviceTrail.map((point) =>
                  h(
                    "li",
                    {},
                    `${formatDate(point.at)}: ${formatWeight(point.totalGrams)} across ${point.spoolCount} ${point.spoolCount === 1 ? "spool" : "spools"}`,
                  ),
                ),
              ),
            )
          : null,
      );
    }),
  );
}
