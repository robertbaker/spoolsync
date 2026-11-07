import { type CommonSpool } from "@spoolsync/core/core/model";
import { correctionReport, referenceCsv } from "@spoolsync/core/core/reference";

import { t, type MessageKey } from "~/lib/i18n";

import { h, showToast } from "../dom";
import { download } from "../sync/presentation";
import { plural } from "./presentation";
import { card } from "./reference-card";
import { colorFinder } from "./reference-colors";
import type { PanelContext } from "./reference-context";
import { FILTERS, type ReferenceFilter } from "./reference-controller";
import { BUTTON, PAGE, PRESSED, spoolLabel } from "./reference-widgets";

const spoolIndex = (ctx: PanelContext): Map<string, CommonSpool> => {
  const spools = new Map<string, CommonSpool>();
  for (const loaded of ctx.results.values())
    for (const spool of loaded.spools) spools.set(`${spool.source}:${spool.sourceId}`, spool);
  return spools;
};

export function resultsSection(ctx: PanelContext): HTMLElement {
  const counts = ctx.controller.counts();
  const filterCounts = ctx.controller.filterCounts();
  const chips = FILTERS.map(([filter]) => {
    const chip = h(
      "button",
      {
        type: "button",
        class: `${BUTTON} ${ctx.controller.filter === filter ? PRESSED : ""}`,
        "aria-pressed": String(ctx.controller.filter === filter),
        "data-key": `filter-${filter}`,
      },
      `${t(`reference.filter.${filter}` as MessageKey)} (${filterCounts[filter]})`,
    );
    chip.addEventListener("click", () => {
      ctx.controller.setFilter(filter as ReferenceFilter);
      ctx.state.limit = PAGE;
      ctx.draw();
      ctx.focusKey(`filter-${filter}`);
    });
    return chip;
  });
  const fill = h(
    "button",
    { type: "button", class: BUTTON, "data-key": "fill-missing" },
    t("reference.action.fillAll"),
  );
  const fillable = ctx.controller
    .visible()
    .flatMap((item) => item.proposals)
    .filter((p) => p.kind === "fill" && p.applicable && ctx.controller.status(p) === "pending");
  fill.disabled = fillable.length === 0;
  fill.addEventListener("click", () =>
    ctx.act(
      () => ctx.controller.fillAllMissing(),
      (count) => t("reference.toast.acceptedMissing", { count }),
    ),
  );
  const overwritable = ctx.controller
    .visible()
    .flatMap((item) => item.proposals)
    .filter(
      (p) => p.kind === "overwrite" && p.applicable && ctx.controller.status(p) === "pending",
    );
  const overwrite = h(
    "button",
    { type: "button", class: BUTTON, "data-key": "overwrite-selected" },
    t("reference.action.overwrite"),
  );
  overwrite.disabled = overwritable.length === 0;
  overwrite.title = t("reference.action.overwrite.title");
  overwrite.addEventListener("click", () =>
    ctx.act(
      () => ctx.controller.overwriteSelected(),
      (count) => t("reference.toast.acceptedOverwrites", { count }),
    ),
  );
  const clear = h(
    "button",
    { type: "button", class: BUTTON, "data-key": "clear-choices" },
    t("reference.action.clear"),
  );
  clear.disabled = counts.accepted + counts.rejected === 0;
  clear.addEventListener("click", () =>
    ctx.act(
      () => ctx.controller.clearChoices(),
      (count) => t("reference.toast.cleared", { count }),
    ),
  );
  const undo = h(
    "button",
    { type: "button", class: BUTTON, "data-key": "undo" },
    t("reference.action.undo"),
  );
  const undoLabel = ctx.controller.undoLabel();
  undo.disabled = !undoLabel;
  if (undoLabel) undo.setAttribute("aria-label", `${t("reference.action.undo")} ${undoLabel}`);
  undo.addEventListener("click", () =>
    ctx.act(
      () => (ctx.controller.undo() ? 1 : 0),
      () => t("reference.action.undone"),
    ),
  );

  const items = ctx.controller.visible();
  const spools = spoolIndex(ctx);
  const exportCsv = h(
    "button",
    { type: "button", class: BUTTON, "data-key": "export-csv" },
    t("reference.action.exportCsv"),
  );
  exportCsv.disabled = items.length === 0;
  exportCsv.addEventListener("click", () => {
    const labels = spoolIndex(ctx);
    download(
      `spoolsync-reference-${new Date().toISOString().slice(0, 10)}.csv`,
      // A byte-order mark makes Excel read the file as UTF-8, so accented names survive.
      `\uFEFF${referenceCsv(items, (key) => spoolLabel(labels.get(key), key))}`,
      "text/csv",
    );
  });
  const corrections = correctionReport(ctx.controller.analysis.items);
  const copyCorrections = h(
    "button",
    {
      type: "button",
      class: BUTTON,
      "data-key": "copy-corrections",
      title: t("reference.action.copyCorrections.title"),
    },
    corrections.records
      ? t("reference.action.copyCorrections.count", { count: corrections.records })
      : t("reference.action.copyCorrections"),
  );
  copyCorrections.disabled = corrections.records === 0;
  copyCorrections.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(corrections.markdown);
      showToast(
        t("reference.toast.copied", { points: corrections.points, records: corrections.records }),
        "success",
      );
    } catch {
      // No clipboard access (an insecure page, or permission refused): offer the text as a file.
      download(
        `spoolsync-catalog-corrections-${new Date().toISOString().slice(0, 10)}.md`,
        corrections.markdown,
        "text/markdown",
      );
      showToast(t("reference.toast.copyFailed"), "info");
    }
  });
  const finderKey = `${spools.size}`;
  if (
    !ctx.state.finder ||
    ctx.state.finder.catalog !== ctx.controller.catalog ||
    ctx.state.finder.key !== finderKey
  )
    ctx.state.finder = {
      catalog: ctx.controller.catalog,
      key: finderKey,
      element: colorFinder(ctx.controller, spools),
    };
  const shown = items.slice(0, ctx.state.limit);
  const more = h(
    "button",
    { type: "button", class: `${BUTTON} mt-3`, "data-key": "show-more" },
    t("reference.action.more", {
      shown: Math.min(PAGE, items.length - ctx.state.limit),
      rest: items.length - ctx.state.limit,
    }),
  );
  more.addEventListener("click", () => {
    ctx.state.limit += PAGE;
    ctx.draw();
  });

  return h(
    "section",
    { class: "mt-4" },
    h(
      "p",
      { class: "text-sm", "aria-live": "polite" },
      [
        t("reference.summary", {
          spools: counts.spools,
          matched: counts.matched,
          needChoice: counts.ambiguous + counts.suggested,
          unmatched: counts.unmatched,
          proposals: counts.proposals,
          safe: counts.safe,
          review: counts.review,
          accepted: counts.accepted,
          rejected: counts.rejected,
          pending: counts.pending,
        }),
        counts.notApplicable
          ? t("reference.summary.notApplicable", { count: counts.notApplicable })
          : "",
        counts.colorMismatches
          ? t("reference.summary.colors", { count: counts.colorMismatches })
          : "",
      ]
        .filter(Boolean)
        .join(" "),
    ),
    ctx.controller.dropped
      ? h(
          "p",
          { class: "mt-1 text-xs text-muted-foreground" },
          `${plural(ctx.controller.dropped, "earlier choice")} no longer matched the loaded data and was dropped.`,
        )
      : null,
    h(
      "div",
      {
        class: "mt-3 flex flex-wrap items-center gap-2",
        role: "group",
        "aria-label": t("reference.filter.label"),
      },
      ...chips,
    ),
    h(
      "div",
      { class: "mt-3 flex flex-wrap items-center gap-2" },
      fill,
      overwrite,
      clear,
      undo,
      exportCsv,
      copyCorrections,
    ),
    ctx.state.finder.element,
    items.length
      ? h("p", { class: "mt-2 text-xs text-muted-foreground" }, t("reference.keyboard"))
      : null,
    items.length
      ? h("ul", { class: "mt-3 grid gap-3" }, ...shown.map((item) => card(ctx, item, spools)))
      : h(
          "p",
          { class: "mt-3 text-sm text-muted-foreground" },
          counts.spools
            ? ctx.controller.filter === "all"
              ? t("reference.empty.clean")
              : t("reference.empty.filter")
            : t("reference.empty.load"),
        ),
    items.length > ctx.state.limit ? h("div", {}, more) : null,
    counts.accepted
      ? h(
          "p",
          { class: "mt-4 text-sm" },
          `${plural(counts.accepted, "accepted change")} will appear in the plan on the Sync page. `,
          h(
            "a",
            {
              href: "/sync",
              class:
                "font-medium text-primary-text underline underline-offset-2 hover:no-underline focus-visible:outline-2 focus-visible:outline-primary",
            },
            "Go to Sync",
          ),
        )
      : null,
  );
}
