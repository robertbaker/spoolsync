import type { LoadResult, SourceId } from "@spoolsync/core/core/model";
import { isRunningLow } from "@spoolsync/core/core/stock";
import { reorderItems } from "@spoolsync/core/workflow";

import { loadMatchDecisions } from "~/lib/browser/storage";
import { currentLowStockRule } from "~/lib/low-stock";
import {
  groupByBrand,
  itemLabel,
  reorderCsv,
  reorderFilename,
  spoolSearchUrl,
  type BrandGroup,
} from "~/lib/reorder-list";
import { DISPLAY_CHANGED, formatWeight } from "~/lib/units";

import { h, showToast } from "../dom";
import { download } from "../sync/presentation";

const BUTTON =
  "rounded-md border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary";
const LINK =
  "font-medium text-primary-text underline underline-offset-2 hover:no-underline focus-visible:outline-2 focus-visible:outline-primary";

const left = (grams: number | null, fraction: number | null): string =>
  grams === null
    ? "weight unknown"
    : `${formatWeight(grams)} left${fraction === null ? "" : ` (${Math.round(fraction * 100)}%)`}`;

/** A link that opens a shop search in a new tab without handing the page to the shop. */
function shopLink(url: string, text: string, label: string): HTMLElement {
  return h(
    "a",
    { href: url, target: "_blank", rel: "noopener noreferrer", class: LINK, "aria-label": label },
    text,
  );
}

/** The printable shopping list: tick boxes, no controls, and no links (paper cannot click). */
function printSheet(groups: readonly BrandGroup[], count: number): HTMLElement {
  return h(
    "section",
    { id: "reorder-sheet", "aria-label": "Shopping list" },
    h("h1", {}, "SpoolSync shopping list"),
    h(
      "p",
      {},
      `${count} ${count === 1 ? "spool" : "spools"} running low, ${new Date().toLocaleDateString()}`,
    ),
    ...groups.map((group) =>
      h(
        "section",
        { class: "reorder-brand" },
        h("h2", {}, `${group.brand} (${group.items.length})`),
        h(
          "ul",
          {},
          ...group.items.map(({ spool, fraction }) =>
            h(
              "li",
              {},
              `☐ ${itemLabel(spool)}: ${left(spool.remainingWeight, fraction)}`,
              spool.location ? `, in ${spool.location}` : "",
            ),
          ),
        ),
      ),
    ),
  );
}

/**
 * The smart reorder list: low spools grouped by brand with shop search links, a CSV download of
 * the shopping list, and a printable view. Content is built only while the panel is open.
 */
export function wireReorderPanel(
  root: HTMLElement,
  results: ReadonlyMap<SourceId, LoadResult>,
): { update(): void } {
  const details = h("details", { class: "rounded-xl border" });
  const summary = h(
    "summary",
    {
      class:
        "cursor-pointer rounded-xl p-4 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-primary",
    },
    "Reorder list",
  );
  const content = h("div", { class: "px-4 pb-4" });
  details.append(summary, content);
  root.replaceChildren(details);

  const lowRecordCount = (): number => {
    const rule = currentLowStockRule();
    let count = 0;
    for (const result of results.values())
      for (const spool of result.spools) if (isRunningLow(spool, rule)) count += 1;
    return count;
  };

  function build(): void {
    let groups: BrandGroup[];
    let total: number;
    try {
      const items = reorderItems([...results.values()], loadMatchDecisions(), currentLowStockRule());
      groups = groupByBrand(items);
      total = items.length;
    } catch {
      content.replaceChildren(
        h("p", { class: "text-sm text-error-text", role: "alert" }, "Could not build the reorder list."),
      );
      return;
    }
    summary.textContent = `Reorder list (${total} ${total === 1 ? "spool" : "spools"} running low)`;
    if (!total) {
      content.replaceChildren(
        h("p", { class: "text-sm text-muted-foreground" }, "Nothing is running low."),
      );
      return;
    }
    const csvButton = h("button", { type: "button", class: BUTTON }, "Download shopping list (CSV)");
    csvButton.addEventListener("click", () => {
      try {
        // A byte-order mark makes Excel read the file as UTF-8, so accented names survive.
        download(reorderFilename(new Date()), `﻿${reorderCsv(groups)}`, "text/csv");
      } catch {
        showToast("Could not create the CSV", "error");
      }
    });
    const printButton = h("button", { type: "button", class: BUTTON }, "Print list");
    printButton.addEventListener("click", () => {
      document.getElementById("reorder-sheet")?.remove();
      const sheet = printSheet(groups, total);
      document.body.append(sheet);
      document.body.classList.add("printing-reorder");
      const finish = () => {
        document.body.classList.remove("printing-reorder");
        sheet.remove();
      };
      window.addEventListener("afterprint", finish, { once: true });
      try {
        window.print();
      } catch {
        finish();
        showToast("Could not open the print dialog", "error");
      }
    });

    content.replaceChildren(
      h(
        "p",
        { class: "text-sm text-muted-foreground" },
        "Low spools by brand, once each even when several services list them. Shop links open a web search in a new tab; SpoolSync does not send your inventory anywhere.",
      ),
      h("div", { class: "mt-3 flex flex-wrap gap-2" }, csvButton, printButton),
      ...groups.map((group, index) => {
        const headingId = `reorder-brand-${index}`;
        return h(
          "section",
          { class: "mt-4", "aria-labelledby": headingId },
          h(
            "div",
            { class: "flex flex-wrap items-baseline justify-between gap-2" },
            h("h3", { id: headingId, class: "font-semibold" }, `${group.brand} (${group.items.length})`),
            group.searchUrl
              ? shopLink(group.searchUrl, "Search this brand", `Search shops for ${group.brand} filament`)
              : null,
          ),
          h(
            "ul",
            { class: "mt-1 divide-y text-sm" },
            ...group.items.map(({ spool, fraction }) => {
              const url = spoolSearchUrl(spool);
              return h(
                "li",
                { class: "flex flex-wrap items-center justify-between gap-2 py-1.5" },
                h(
                  "span",
                  {},
                  itemLabel(spool),
                  h(
                    "span",
                    { class: "ml-2 text-xs text-muted-foreground" },
                    left(spool.remainingWeight, fraction),
                  ),
                ),
                url
                  ? shopLink(url, "Find to buy", `Search shops for ${itemLabel(spool)} from ${group.brand}`)
                  : null,
              );
            }),
          ),
        );
      }),
    );
  }

  details.addEventListener("toggle", () => {
    if (details.open) build();
  });
  // Weights follow the display unit chosen elsewhere on the page.
  document.addEventListener(DISPLAY_CHANGED, () => {
    if (details.open) build();
  });

  return {
    update() {
      const low = lowRecordCount();
      root.hidden = low === 0;
      if (low === 0) {
        details.open = false;
        summary.textContent = "Reorder list";
        return;
      }
      if (details.open) build();
      else summary.textContent = "Reorder list";
    },
  };
}
