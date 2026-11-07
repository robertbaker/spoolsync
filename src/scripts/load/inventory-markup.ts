import { t } from "~/lib/i18n";
import type { SortKey } from "~/lib/preferences";
import { WINDOW_STEP, type WindowedRows } from "~/lib/table-window";

import { buttonClass, h } from "../dom";

export interface TableHeader {
  label: string;
  /** Present when the column can be sorted. */
  key?: SortKey;
}

const WINDOW_BUTTON =
  "rounded-md border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary";

/** The two ways forward when nothing is loaded, instead of a dead end. */
export function emptyState(): HTMLElement {
  const choose = h(
    "button",
    { type: "button", class: buttonClass({ variant: "solid", color: "primary" }) },
    "Choose files",
  );
  choose.addEventListener("click", () => document.getElementById("smart-file")?.click());
  const sample = h("button", { type: "button", class: buttonClass() }, "Try sample data");
  sample.addEventListener("click", () => document.getElementById("try-sample")?.click());
  return h(
    "div",
    { class: "empty-state" },
    h("p", { class: "font-medium text-foreground" }, "Nothing loaded yet."),
    h(
      "p",
      { class: "text-sm text-muted-foreground" },
      "Pick export files or connect a service above to see your spools here.",
    ),
    h("div", { class: "mt-3 flex flex-wrap justify-center gap-2" }, choose, sample),
  );
}

/** Why a filtered table is empty, in the order the filters are most likely to be the cause. */
export function noMatchMessage(filters: {
  searchQuery: string;
  rangeActive: boolean;
  /** The label of the active insight chip, if one is on. */
  insightLabel: string | null;
}): HTMLElement {
  const { searchQuery, rangeActive, insightLabel } = filters;
  return h(
    "p",
    { class: "rounded-lg border border-dashed p-8 text-center text-muted-foreground" },
    searchQuery
      ? `No spools matching "${searchQuery}".`
      : rangeActive
        ? "No spools match the material and weight filters."
        : insightLabel
          ? `No spools match "${insightLabel}".`
          : "No spools are running low.",
  );
}

/** The heading row that introduces a group of spools. */
export function groupRow(label: string, total: number, columnCount: number): HTMLElement {
  return h(
    "tr",
    { class: "spool-group-row" },
    h(
      "th",
      {
        scope: "colgroup",
        colspan: String(columnCount),
        class: "bg-muted/40 text-left text-sm font-semibold",
      },
      `${label} (${total})`,
    ),
  );
}

/** "Showing N of M" with the buttons that draw more rows; `null` when everything is drawn. */
export function windowControls(
  windowed: Pick<WindowedRows<unknown>, "shown" | "total">,
  onMore: () => void,
  onAll: () => void,
): HTMLElement | null {
  const hiddenRows = windowed.total - windowed.shown;
  if (hiddenRows <= 0) return null;
  const showMore = h(
    "button",
    { type: "button", class: WINDOW_BUTTON },
    t("table.window.more", { count: Math.min(WINDOW_STEP, hiddenRows) }),
  );
  showMore.addEventListener("click", onMore);
  const showAll = h("button", { type: "button", class: WINDOW_BUTTON }, t("table.window.all"));
  showAll.addEventListener("click", onAll);
  return h(
    "div",
    { class: "table-window" },
    h(
      "p",
      { class: "text-muted-foreground" },
      t("table.window.status", { shown: windowed.shown, total: windowed.total }),
    ),
    showMore,
    hiddenRows > WINDOW_STEP ? showAll : null,
  );
}

/** The table head: sortable columns are buttons that report the key and heading that was clicked. */
export function headerRow(
  headers: readonly TableHeader[],
  sort: { key: SortKey; direction: "asc" | "desc" } | null,
  onSort: (key: SortKey, label: string) => void,
): HTMLElement {
  return h(
    "thead",
    {},
    h(
      "tr",
      {},
      ...headers.map((header) => {
        const key = header.key;
        if (!key) return h("th", { scope: "col" }, header.label);
        const active = sort?.key === key ? sort.direction : null;
        const button = h(
          "button",
          {
            type: "button",
            class:
              "inline-flex items-center gap-1 font-inherit uppercase hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary",
          },
          header.label,
          h(
            "span",
            { "aria-hidden": "true", class: "text-[0.7em]" },
            active === "asc" ? "▲" : active === "desc" ? "▼" : "↕",
          ),
        );
        button.addEventListener("click", () => onSort(key, header.label));
        return h(
          "th",
          {
            scope: "col",
            "aria-sort": active === "asc" ? "ascending" : active === "desc" ? "descending" : "none",
          },
          button,
        );
      }),
    ),
  );
}

/** The scrollable table wrapper around a head and body, followed by the window controls. */
export function tableShell(
  head: HTMLElement,
  bodyRows: ReadonlyArray<HTMLElement | null>,
): HTMLElement {
  return h(
    "div",
    {
      class: "spool-table-wrapper",
      tabindex: "0",
      role: "region",
      "aria-label": "Loaded spools table (scrollable)",
    },
    h("table", {}, head, h("tbody", {}, ...bodyRows)),
  );
}
