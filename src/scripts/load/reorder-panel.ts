import type { LoadResult, SourceId } from "@spoolsync/core/core/model";
import { isRunningLow } from "@spoolsync/core/core/stock";
import { reorderItems } from "@spoolsync/core/workflow";

import { programsOf, type BuyLink } from "~/lib/affiliates";
import { loadMatchDecisions } from "~/lib/browser/storage";
import { local, write } from "~/lib/browser/storage/access";
import { currentLowStockRule } from "~/lib/low-stock";
import {
  groupByBrand,
  itemLabel,
  reorderCsv,
  reorderFilename,
  spoolBuyLinks,
  type BrandGroup,
} from "~/lib/reorder-list";
import { DISPLAY_CHANGED, formatWeight } from "~/lib/units";

import { h, showToast } from "../dom";
import { copyText } from "../sync/clipboard";
import { download } from "../sync/presentation";

const BUTTON =
  "rounded-md border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary";
const LINK =
  "font-medium text-primary-text underline underline-offset-2 hover:no-underline focus-visible:outline-2 focus-visible:outline-primary";

const left = (grams: number | null, fraction: number | null): string =>
  grams === null
    ? "weight unknown"
    : `${formatWeight(grams)} left${fraction === null ? "" : ` (${Math.round(fraction * 100)}%)`}`;

/**
 * A shop link that opens in a new tab without handing the page to the shop. Every link is marked
 * `sponsored` because the shops are affiliate programs. A shop's coupon, if it gives one, follows.
 */
function shopLink(link: BuyLink, text: string, label: string): HTMLElement {
  const code = link.couponCode;
  const copy = code
    ? h(
        "button",
        {
          type: "button",
          class:
            "rounded border px-1.5 font-mono text-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary",
          title: "Copy the coupon code",
          "aria-label": `Copy coupon code ${code}`,
          "data-coupon": code,
        },
        code,
      )
    : null;
  copy?.addEventListener("click", () => {
    void copyText(code!).then((ok) => {
      showToast(
        ok ? `Copied coupon code ${code}` : "Could not copy. Select the code and copy it.",
        ok ? "success" : "error",
      );
    });
  });
  return h(
    "span",
    { class: "inline-flex flex-wrap items-baseline gap-x-2" },
    h(
      "a",
      {
        href: link.url,
        target: "_blank",
        rel: "noopener noreferrer sponsored",
        class: LINK,
        "aria-label": label,
        "data-shop": link.programId,
      },
      text,
    ),
    link.couponCode
      ? h(
          "span",
          { class: "text-xs text-muted-foreground" },
          "Coupon code ",
          copy,
          link.couponOffer ? ` (${link.couponOffer})` : "",
        )
      : null,
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
 * The smart reorder list: low spools grouped by brand with shop search links, a CSV download of the
 * shopping list, and a printable view. Content is built only while the panel is open.
 */
export function wireReorderPanel(
  root: HTMLElement,
  results: ReadonlyMap<SourceId, LoadResult>,
): { update(): void } {
  // The custom shop address this panel once offered is gone; forget what an earlier visit saved.
  write(local, "spoolsync:shop-template", null);
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
      const items = reorderItems(
        [...results.values()],
        loadMatchDecisions(),
        currentLowStockRule(),
      );
      groups = groupByBrand(items);
      total = items.length;
    } catch {
      content.replaceChildren(
        h(
          "p",
          { class: "text-sm text-error-text", role: "alert" },
          "Could not build the reorder list.",
        ),
      );
      return;
    }
    summary.textContent = `Reorder list (${total} ${total === 1 ? "spool" : "spools"} running low)`;
    if (!total) {
      content.replaceChildren(
        h(
          "div",
          { class: "empty-state" },
          h("strong", {}, "Nothing is running low"),
          h("p", {}, "Spools under your low-stock threshold appear here, grouped by brand."),
        ),
      );
      return;
    }
    // Each program's disclosure appears once, and only when one of its links is on the page.
    const disclosures = programsOf([
      ...groups.flatMap((group) => group.links),
      ...groups.flatMap((group) => group.items.flatMap(({ spool }) => spoolBuyLinks(spool))),
    ]).map((program) => program.disclosure);
    const csvButton = h(
      "button",
      { type: "button", class: BUTTON },
      "Download shopping list (CSV)",
    );
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
        window.removeEventListener("afterprint", finish);
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
        "Low spools by brand, once each even when several services list them. Shop links open in a new tab; only the brand, material and color are in a link, and SpoolSync does not send your inventory anywhere.",
      ),
      ...disclosures.map((text) =>
        h("p", { class: "mt-1 text-xs text-muted-foreground", "data-disclosure": "" }, text),
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
            h(
              "h3",
              { id: headingId, class: "font-semibold" },
              `${group.brand} (${group.items.length})`,
            ),
            group.links.length
              ? h(
                  "span",
                  { class: "flex flex-wrap items-baseline gap-x-4" },
                  ...group.links.map((link) =>
                    shopLink(
                      link,
                      group.links.length > 1
                        ? `Search this brand at ${link.shop}`
                        : "Search this brand",
                      `Search ${link.shop} for ${group.brand} filament`,
                    ),
                  ),
                )
              : null,
          ),
          h(
            "ul",
            { class: "mt-1 divide-y text-sm" },
            ...group.items.map(({ spool, fraction }) => {
              const links = spoolBuyLinks(spool);
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
                links.length
                  ? h(
                      "span",
                      { class: "flex flex-wrap items-baseline gap-x-4" },
                      ...links.map((link) =>
                        shopLink(
                          link,
                          links.length > 1 ? `Find at ${link.shop}` : "Find to buy",
                          `Search ${link.shop} for ${itemLabel(spool)} from ${group.brand}`,
                        ),
                      ),
                    )
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
