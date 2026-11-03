import { SOURCE_LABELS, type LoadResult, type SourceId } from "@spoolsync/core/core/model";

import {
  currentVisits,
  readVisits,
  summarizeVisit,
  visitHasChanges,
  visitText,
  visitTotals,
  writeVisits,
  type VisitSummary,
} from "~/lib/since-visit";
import { OPEN_SPOOL_EVENT } from "~/lib/spool-detail";
import { formatWeight } from "~/lib/units";

import { h, showToast } from "../dom";
import type { LoadInsights } from "./insights";
import { button } from "../sync/presentation";

const MOVERS_SHOWN = 5;

const dateOf = (iso: string): string => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString();
};

const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

function spoolButton(source: SourceId, id: string, name: string | null): HTMLElement {
  const link = h(
    "button",
    {
      type: "button",
      class:
        "text-left font-medium text-primary-text underline underline-offset-2 hover:no-underline focus-visible:outline-2 focus-visible:outline-primary",
      "aria-label": `Open details for ${name ?? `ID ${id}`}`,
    },
    name ?? `ID ${id}`,
  );
  link.addEventListener("click", () =>
    document.dispatchEvent(new CustomEvent(OPEN_SPOOL_EVENT, { detail: { key: `${source}:${id}` } })),
  );
  return link;
}

function serviceBlock(visit: VisitSummary): HTMLElement {
  const label = SOURCE_LABELS[visit.source];
  if (!visitHasChanges(visit))
    return h(
      "div",
      { class: "rounded-lg border p-3 text-sm" },
      h("p", { class: "font-medium" }, `${label} since ${dateOf(visit.since)}`),
      h("p", { class: "mt-1 text-muted-foreground" }, `No changes (${plural(visit.unchanged, "spool")} the same).`),
    );
  const movers = [...visit.drops, ...visit.gains]
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || a.id.localeCompare(b.id, undefined, { numeric: true }))
    .slice(0, MOVERS_SHOWN);
  const more = visit.counts.drops + visit.counts.gains - movers.length;
  const row = (kind: string, name: HTMLElement, detail: string) =>
    h("li", { class: "flex flex-wrap items-baseline gap-x-2" }, h("span", { class: "text-xs font-semibold uppercase tracking-wide text-muted-foreground" }, kind), name, h("span", { class: "text-muted-foreground tabular-nums" }, detail));
  return h(
    "div",
    { class: "rounded-lg border p-3 text-sm" },
    h("p", { class: "font-medium" }, `${label} since ${dateOf(visit.since)}`),
    h(
      "p",
      { class: "mt-1 text-muted-foreground" },
      [
        visit.counts.drops ? `${plural(visit.counts.drops, "spool")} used` : null,
        visit.counts.gains ? `${plural(visit.counts.gains, "spool")} gained weight` : null,
        visit.counts.added ? `${visit.counts.added} added` : null,
        visit.counts.removed ? `${visit.counts.removed} removed` : null,
      ]
        .filter(Boolean)
        .join(", ") + ".",
    ),
    h(
      "ul",
      { class: "mt-2 grid gap-1" },
      ...movers.map((change) =>
        row(
          change.delta < 0 ? "Used" : "Gained",
          spoolButton(visit.source, change.id, change.name),
          `${formatWeight(Math.abs(change.delta))} (${formatWeight(change.before)} to ${formatWeight(change.after)})`,
        ),
      ),
      more > 0 ? h("li", { class: "text-xs text-muted-foreground" }, `and ${more} more weight changes`) : null,
      ...visit.added
        .slice(0, MOVERS_SHOWN)
        .map((item) => row("Added", spoolButton(visit.source, item.id, item.name), "")),
      visit.counts.added > MOVERS_SHOWN
        ? h("li", { class: "text-xs text-muted-foreground" }, `and ${visit.counts.added - MOVERS_SHOWN} more added`)
        : null,
      ...visit.removed.slice(0, MOVERS_SHOWN).map((item) =>
        row("Removed", h("span", { class: "font-medium" }, item.name ?? `ID ${item.id}`), ""),
      ),
      visit.counts.removed > MOVERS_SHOWN
        ? h("li", { class: "text-xs text-muted-foreground" }, `and ${visit.counts.removed - MOVERS_SHOWN} more removed`)
        : null,
    ),
  );
}

/**
 * The "Since your last visit" panel above the insights: for every service whose file was loaded
 * again, how much filament was used, which spools moved, and what was added or removed. The
 * comparison comes from the snapshot kept when the previous file was loaded; a compact copy is kept
 * so the panel survives a page reload.
 */
export function wireSinceVisit(
  results: ReadonlyMap<SourceId, LoadResult>,
  insights: LoadInsights,
): { update(): void } {
  const root = h("section", {
    id: "since-visit",
    class: "mt-5 rounded-xl border p-4",
    "aria-labelledby": "since-visit-heading",
    hidden: "",
  });
  document.getElementById("loaded-insights")?.before(root);
  let dismissedFor = "";
  let written = "";

  function visits(): VisitSummary[] {
    const fresh = [...insights.changes.values()].flatMap((entry) => summarizeVisit(entry) ?? []);
    const loadedAt = new Map([...results].map(([source, result]) => [source, result.loadedAt] as const));
    const current = currentVisits(readVisits(), fresh, loadedAt);
    // Remember what is shown so a reload still has it; skip the write when nothing changed.
    const serialized = JSON.stringify(current);
    if (serialized !== written) {
      writeVisits(current);
      written = serialized;
    }
    return current;
  }

  function update(): void {
    if (results.size === 0) {
      root.hidden = true;
      return;
    }
    const shown = visits();
    const signature = shown.map((visit) => `${visit.source}:${visit.loadedAt}`).join("|");
    if (signature && signature === dismissedFor) {
      root.hidden = true;
      return;
    }
    root.hidden = false;
    const heading = h("h3", { id: "since-visit-heading", class: "text-base font-semibold" }, "Since your last visit");
    if (!shown.length) {
      root.replaceChildren(
        heading,
        h(
          "div",
          { class: "empty-state mt-2" },
          h("strong", {}, "Nothing to compare yet"),
          h(
            "p",
            {},
            "When you load a file again, SpoolSync shows which spools were used, added or removed since the last one. Only each spool's id, name and weight are remembered, in this browser.",
          ),
        ),
      );
      return;
    }
    const totals = visitTotals(shown);
    const copy = button("Copy summary", () => {
      const text = visitText(shown, (grams) => formatWeight(grams), dateOf);
      navigator.clipboard.writeText(text).then(
        () => showToast("Summary copied", "success"),
        () => showToast("Could not copy the summary", "error"),
      );
    });
    const dismiss = button("Dismiss", () => {
      dismissedFor = signature;
      root.hidden = true;
    });
    root.replaceChildren(
      h(
        "div",
        { class: "flex flex-wrap items-start justify-between gap-2" },
        heading,
        h("div", { class: "flex gap-2" }, copy, dismiss),
      ),
      h(
        "p",
        { class: "mt-1 text-sm text-muted-foreground" },
        totals.spoolsChanged
          ? `${formatWeight(totals.usedGrams)} used${totals.refilledGrams ? ` and ${formatWeight(totals.refilledGrams)} added back` : ""} across ${plural(totals.spoolsChanged, "spool")}.`
          : "No spool changed weight.",
      ),
      h("div", { class: "mt-3 grid gap-2 lg:grid-cols-2" }, ...shown.map(serviceBlock)),
    );
  }

  return { update };
}
