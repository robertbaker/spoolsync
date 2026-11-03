import { SOURCE_LABELS, type CommonSpool, type LoadResult, type SourceId } from "@spoolsync/core/core/model";
import { spoolKey, type WeightChange } from "@spoolsync/core/workflow";

import { loadMatchDecisions, saveMatchDecisions } from "~/lib/browser/storage";
import { readStockHistory } from "~/lib/browser/storage/stock-history";
import {
  OPEN_SPOOL_EVENT,
  detailRows,
  findSpoolDetail,
  linkedIds,
  markDifferent,
  recordTitle,
  spoolHistory,
  type Candidate,
  type DetailRow,
  type SpoolDetail,
} from "~/lib/spool-detail";
import { DISPLAY_CHANGED, formatMoney, formatWeight } from "~/lib/units";

import { h, showToast } from "../dom";
import type { LoadInsights } from "./insights";
import { printLabelSheet } from "./label-sheet";
import { createWeighInSection, type WeighInMemory } from "./weigh-in-panel";

const BUTTON =
  "rounded-md border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50";

interface Inputs {
  results: ReadonlyMap<SourceId, LoadResult>;
  insights: LoadInsights;
  /** Called after an action changed what the page shows (watching, a new answer). */
  onChange: () => void;
}

const REASON_TEXT: Record<Candidate["reason"], string> = {
  suggestion: "Looks like the same spool",
  duplicate: "Possible duplicate in the same service",
  confirmed: "Linked by your answer",
};

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
          return h("span", { class: "inline-flex items-center gap-1 text-xs" }, swatch, `#${color}`);
        }),
      );
    default:
      return String(value);
  }
}

/**
 * The spool detail drawer: a native modal `<dialog>` docked to the right, so focus stays inside,
 * Esc closes it, and the page behind is inert. It shows the spool as every loaded service sees it,
 * its linked ids, what is remembered about its weight, and quick actions.
 */
export function wireSpoolDrawer({ results, insights, onChange }: Inputs): {
  open(key: string): boolean;
  update(): void;
} {
  let dialog: HTMLDialogElement | undefined;
  let body: HTMLElement;
  let currentKey: string | null = null;
  let opener: HTMLElement | null = null;
  const weighMemory: WeighInMemory = new Map();

  const allSpools = (): CommonSpool[] => [...results.values()].flatMap((result) => result.spools);

  function changesByKey(): Map<string, WeightChange> {
    const map = new Map<string, WeightChange>();
    for (const [source, entry] of insights.changes) {
      for (const change of [...(entry.changes?.gains ?? []), ...(entry.changes?.drops ?? [])])
        map.set(`${source}:${change.id}`, change);
    }
    return map;
  }

  function section(title: string, id: string, ...children: Array<Node | null>): HTMLElement {
    return h(
      "section",
      { class: "mt-6", "aria-labelledby": id },
      h("h3", { id, class: "text-sm font-semibold uppercase tracking-wide text-muted-foreground" }, title),
      ...children,
    );
  }

  function fieldTable(detail: SpoolDetail): HTMLElement {
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
                row.differs ? h("span", { class: "ml-2 text-xs text-warning-text" }, "differs") : null,
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

  function idsList(detail: SpoolDetail): HTMLElement {
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
                  h("li", { class: "break-all" }, `${label}: `, h("span", { class: "font-mono" }, value)),
                ),
              )
            : h("p", { class: "mt-1 text-xs text-muted-foreground" }, "No ids from other services."),
        );
      }),
    );
  }

  function historyList(detail: SpoolDetail): HTMLElement {
    const changes = changesByKey();
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

  function candidateList(detail: SpoolDetail): HTMLElement | null {
    if (!detail.candidates.length) return null;
    return h(
      "ul",
      { class: "mt-2 grid gap-2 text-sm" },
      ...detail.candidates.map((candidate) => {
        const button = h(
          "button",
          {
            type: "button",
            class: BUTTON,
            "data-action": "different",
            "aria-label": `Mark ${recordTitle(candidate.spool)} as a different spool`,
          },
          "Mark as different",
        );
        button.addEventListener("click", () => {
          try {
            const [a, b] = candidate.pair;
            saveMatchDecisions(markDifferent(loadMatchDecisions(), a, b));
          } catch {
            showToast("Could not save that answer", "error");
            return;
          }
          showToast("Saved: not the same spool", "success");
          onChange();
          render();
          dialog?.querySelector<HTMLElement>("[data-drawer-title]")?.focus();
        });
        return h(
          "li",
          { class: "flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3" },
          h(
            "div",
            { class: "min-w-0" },
            h("p", { class: "font-medium" }, recordTitle(candidate.spool)),
            h(
              "p",
              { class: "text-xs text-muted-foreground" },
              [
                REASON_TEXT[candidate.reason],
                [candidate.spool.vendor, candidate.spool.material, candidate.spool.name]
                  .filter(Boolean)
                  .join(" "),
                ...candidate.because,
              ]
                .filter(Boolean)
                .join(" · "),
            ),
          ),
          button,
        );
      }),
    );
  }

  function actions(detail: SpoolDetail): HTMLElement {
    const watching = insights.watched.has(detail.key);
    const watch = h(
      "button",
      { type: "button", class: BUTTON, "aria-pressed": String(watching), "data-action": "watch" },
      watching ? "Unwatch" : "Watch",
    );
    watch.addEventListener("click", () => {
      insights.toggleWatch(detail.key);
      onChange();
      render();
      dialog?.querySelector<HTMLElement>('[data-action="watch"]')?.focus();
    });
    const print = h("button", { type: "button", class: BUTTON, "data-action": "label" }, "Print label");
    print.addEventListener("click", () => {
      try {
        printLabelSheet([detail.spool]);
      } catch {
        showToast("Could not prepare the label", "error");
      }
    });
    return h("div", { class: "mt-4 flex flex-wrap gap-2" }, watch, print);
  }

  function render(): void {
    if (!dialog || !currentKey) return;
    const detail = findSpoolDetail(
      allSpools(),
      currentKey,
      loadMatchDecisions(),
      insights.duplicates,
    );
    if (!detail) {
      // The spool was unloaded while the drawer was open.
      dialog.close();
      return;
    }
    const { spool } = detail;
    const title = [spool.vendor, spool.material, spool.name].filter(Boolean).join(" ") || spool.sourceId;
    const candidates = candidateList(detail);
    body.replaceChildren(
      h(
        "div",
        { class: "flex items-start justify-between gap-3" },
        h(
          "div",
          { class: "min-w-0" },
          h(
            "h2",
            { id: "spool-drawer-title", class: "break-words text-xl font-bold tracking-tight", tabindex: "-1", "data-drawer-title": "" },
            title,
          ),
          h(
            "p",
            { class: "mt-1 text-sm text-muted-foreground" },
            detail.columns.length > 1
              ? `Listed in ${detail.columns.length} services: ${detail.columns.map((c) => SOURCE_LABELS[c.source]).join(", ")}.`
              : `Listed in ${SOURCE_LABELS[spool.source]} only.`,
            spool.archived ? " Archived." : "",
          ),
        ),
        (() => {
          const close = h(
            "button",
            { type: "button", class: BUTTON, "aria-label": "Close spool details" },
            "Close",
          );
          close.addEventListener("click", () => dialog?.close());
          return close;
        })(),
      ),
      actions(detail),
      section("Weigh in", "drawer-weigh-heading", createWeighInSection(detail, weighMemory)),
      section("Fields by service", "drawer-fields-heading", fieldTable(detail)),
      section("Linked ids", "drawer-ids-heading", idsList(detail)),
      section("History", "drawer-history-heading", historyList(detail)),
      section(
        "Same spool or not",
        "drawer-different-heading",
        candidates ??
          h(
            "p",
            { class: "mt-2 text-sm text-muted-foreground" },
            "No other records look like this spool.",
          ),
        candidates
          ? h(
              "p",
              { class: "mt-2 text-xs text-muted-foreground" },
              "A \"different\" answer is saved in this browser. The Sync page will not suggest that pair again.",
            )
          : null,
      ),
    );
  }

  function build(): HTMLDialogElement {
    body = h("div", { class: "p-6" });
    const element = h(
      "dialog",
      {
        id: "spool-drawer",
        closedby: "any",
        "aria-labelledby": "spool-drawer-title",
        class:
          "my-0 ml-auto mr-0 h-dvh max-h-none w-full max-w-3xl overflow-y-auto rounded-none border-l bg-background p-0 text-foreground shadow-layered backdrop:bg-black/25 backdrop:backdrop-blur-xs",
      },
      body,
    );
    element.addEventListener("click", (event) => {
      if (event.target === element) element.close();
    });
    element.addEventListener("close", () => {
      const key = currentKey;
      currentKey = null;
      // The table is redrawn while the drawer is open, so look the opener up again.
      const target =
        opener?.isConnected && opener
          ? opener
          : key
            ? document.querySelector<HTMLElement>(`[data-open-spool="${CSS.escape(key)}"]`)
            : null;
      target?.focus();
      opener = null;
    });
    document.body.append(element);
    return element;
  }

  function open(key: string): boolean {
    if (!allSpools().some((spool) => spoolKey(spool) === key)) return false;
    dialog ??= build();
    if (!dialog.open) {
      const active = document.activeElement;
      opener = active instanceof HTMLElement && active !== document.body ? active : null;
      currentKey = key;
      render();
      dialog.showModal();
    } else {
      currentKey = key;
      render();
    }
    dialog.querySelector<HTMLElement>("[data-drawer-title]")?.focus();
    return true;
  }

  document.addEventListener(OPEN_SPOOL_EVENT, (event) => {
    const key = (event as CustomEvent<{ key?: unknown } | null>).detail?.key;
    if (typeof key !== "string" || !key) return;
    if (!open(key)) showToast("That spool is not loaded.", "warning");
  });
  // Weights follow the display unit chosen elsewhere on the page.
  document.addEventListener(DISPLAY_CHANGED, () => {
    if (dialog?.open) render();
  });

  return {
    open,
    update() {
      if (dialog?.open) render();
    },
  };
}
