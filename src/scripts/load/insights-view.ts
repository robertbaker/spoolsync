import {
  SOURCE_IDS,
  SOURCE_LABELS,
  type CommonSpool,
  type LoadResult,
  type SourceId,
} from "@spoolsync/core/core/model";
import {
  HEALTH_ISSUES,
  HEALTH_LABELS,
  spoolKey,
  type WeightChange,
} from "@spoolsync/core/workflow";

import { h } from "../dom";
import type { LoadInsights, ServiceChanges } from "./insights";
import { plural } from "./presentation";

const MAX_GROUPS = 8;
const MAX_ROWS = 10;
const grams = (value: number) => `${Math.round(value).toLocaleString()} g`;

const spoolLabel = (spool: CommonSpool) =>
  [spool.vendor, spool.material, spool.name].filter(Boolean).join(" ") || `Spool ${spool.sourceId}`;

/**
 * A scrollable, labelled table, so every panel reads the same way for keyboard and screen reader
 * users.
 */
function table(label: string, headers: string[], rows: HTMLElement[]): HTMLElement {
  return h(
    "div",
    { class: "spool-table-wrapper mt-2", tabindex: "0", role: "region", "aria-label": label },
    h(
      "table",
      {},
      h("caption", { class: "sr-only" }, label),
      h("thead", {}, h("tr", {}, ...headers.map((header) => h("th", { scope: "col" }, header)))),
      h("tbody", {}, ...rows),
    ),
  );
}

const more = (total: number, shown: number, noun: string): Node | string =>
  total > shown
    ? h("p", { class: "mt-1 text-xs text-muted-foreground" }, `and ${total - shown} more ${noun}`)
    : "";

function showButton(label: string, ariaLabel: string, onClick: () => void): HTMLElement {
  const button = h(
    "button",
    {
      type: "button",
      class:
        "rounded-md border px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
      "aria-label": ariaLabel,
    },
    label,
  );
  button.addEventListener("click", onClick);
  return button;
}

function renderHealth(container: HTMLElement, insights: LoadInsights): void {
  const { health } = insights;
  const rows = HEALTH_ISSUES.filter((issue) => health.counts[issue] > 0).map((issue) =>
    h(
      "tr",
      {},
      h("th", { scope: "row", class: "text-left font-medium" }, HEALTH_LABELS[issue]),
      h("td", { class: "tabular-nums" }, health.counts[issue].toLocaleString()),
      h(
        "td",
        {},
        showButton("Show", `Show spools with: ${HEALTH_LABELS[issue]}`, () =>
          insights.setFilter(issue),
        ),
      ),
    ),
  );
  container.replaceChildren(
    h("h3", { id: "insight-health-heading", class: "text-base font-semibold" }, "Inventory health"),
    rows.length
      ? h(
          "p",
          { class: "mt-1 text-sm text-muted-foreground" },
          `${plural(health.affected, "spool")} of ${health.spools.toLocaleString()} need a look. Nothing is changed.`,
        )
      : h(
          "p",
          { class: "mt-1 text-sm text-success-text" },
          `All ${plural(health.spools, "spool")} have a weight, color, brand, material, and location.`,
        ),
    rows.length ? table("Inventory health counts", ["Check", "Spools", "Table"], rows) : "",
  );
}

function renderDuplicates(container: HTMLElement, insights: LoadInsights): void {
  const { duplicates } = insights;
  const heading = h(
    "h3",
    { id: "insight-duplicates-heading", class: "text-base font-semibold" },
    "Possible duplicates",
  );
  if (!duplicates.length) {
    container.replaceChildren(
      heading,
      h(
        "p",
        { class: "mt-1 text-sm text-muted-foreground" },
        "No likely duplicates within a service.",
      ),
    );
    return;
  }
  const items = duplicates
    .slice(0, MAX_GROUPS)
    .map((group) =>
      h(
        "li",
        { class: "rounded-lg border p-3 text-sm" },
        h(
          "p",
          { class: "font-medium" },
          `${SOURCE_LABELS[group.source]}: ${spoolLabel(group.spools[0]!)} (${group.spools.length} spools)`,
        ),
        h(
          "ul",
          { class: "mt-1 list-disc pl-5 text-muted-foreground" },
          ...group.spools.map((spool) =>
            h(
              "li",
              {},
              `ID ${spool.sourceId}`,
              spool.remainingWeight === null ? "" : `, ${grams(spool.remainingWeight)} left`,
              spool.purchasedOn ? `, bought ${spool.purchasedOn}` : "",
            ),
          ),
        ),
        h(
          "p",
          { class: "mt-1 text-xs text-muted-foreground" },
          `Why: ${group.reasons.join("; ")}.`,
        ),
      ),
    );
  container.replaceChildren(
    heading,
    h(
      "p",
      { class: "mt-1 text-sm text-muted-foreground" },
      `${plural(duplicates.length, "group")} of likely duplicates (${plural(insights.duplicateSpoolKeys.size, "spool")}). Nothing is merged; check them in your service.`,
    ),
    h(
      "div",
      { class: "mt-2" },
      showButton("Show in table", "Show possible duplicates in the table", () =>
        insights.setFilter("duplicates"),
      ),
    ),
    h(
      "ul",
      { class: "mt-2 grid gap-2", "aria-labelledby": "insight-duplicates-heading" },
      ...items,
    ),
    more(duplicates.length, MAX_GROUPS, "groups"),
  );
}

const dateOf = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

function describe(entry: ServiceChanges): HTMLElement {
  const label = SOURCE_LABELS[entry.source];
  const wrapper = h("div", { class: "rounded-lg border p-3 text-sm" });
  const { changes } = entry;
  if (!changes) {
    wrapper.append(
      h("p", { class: "font-medium" }, label),
      h(
        "p",
        { class: "mt-1 text-muted-foreground" },
        entry.remembered
          ? "First file for this service in this browser. Load it again later to see what changed."
          : "This inventory is too large to remember, so later loads cannot be compared.",
      ),
    );
    return wrapper;
  }
  const parts = [
    changes.added.length ? `${changes.added.length} added` : null,
    changes.removed.length ? `${changes.removed.length} removed` : null,
    changes.drops.length ? plural(changes.drops.length, "weight drop") : null,
    changes.gains.length ? plural(changes.gains.length, "weight increase") : null,
  ].filter(Boolean);
  wrapper.append(
    h("p", { class: "font-medium" }, `${label} since ${dateOf(entry.since!)}`),
    h(
      "p",
      { class: "mt-1 text-muted-foreground" },
      parts.length
        ? `${parts.join(", ")}.`
        : `No changes (${plural(changes.unchanged, "spool")} the same).`,
    ),
  );
  const name = (item: { id: string; name: string | null }) =>
    item.name ? `${item.name} (ID ${item.id})` : `ID ${item.id}`;
  if (changes.drops.length)
    wrapper.append(
      table(
        `${label} weight drops`,
        ["Spool", "Before", "Now", "Change"],
        changes.drops
          .slice(0, MAX_ROWS)
          .map((drop: WeightChange) =>
            h(
              "tr",
              {},
              h("th", { scope: "row", class: "text-left font-medium" }, name(drop)),
              h("td", { class: "tabular-nums" }, grams(drop.before)),
              h("td", { class: "tabular-nums" }, grams(drop.after)),
              h(
                "td",
                { class: "tabular-nums font-medium text-warning-text" },
                `${grams(drop.delta)} (down)`,
              ),
            ),
          ),
      ),
      more(changes.drops.length, MAX_ROWS, "drops"),
    );
  for (const [title, list] of [
    ["Added", changes.added],
    ["Removed", changes.removed],
  ] as const)
    if (list.length)
      wrapper.append(
        h("p", { class: "mt-2 font-medium" }, `${title}:`),
        h(
          "ul",
          { class: "list-disc pl-5 text-muted-foreground" },
          ...list.slice(0, MAX_ROWS).map((item) => h("li", {}, name(item))),
        ),
        more(list.length, MAX_ROWS, title.toLowerCase()),
      );
  return wrapper;
}

function renderChanges(container: HTMLElement, insights: LoadInsights): void {
  const entries = SOURCE_IDS.flatMap((source) => insights.changes.get(source) ?? []);
  container.replaceChildren(
    h(
      "h3",
      { id: "insight-changes-heading", class: "text-base font-semibold" },
      "What changed since last time",
    ),
    entries.length
      ? h("div", { class: "mt-2 grid gap-2" }, ...entries.map(describe))
      : h(
          "p",
          { class: "mt-1 text-sm text-muted-foreground" },
          "Load a file again to compare it with the one you used last time. Only each spool's id, name, and remaining weight are remembered, in this browser.",
        ),
  );
}

function renderWatchlist(
  container: HTMLElement,
  insights: LoadInsights,
  results: ReadonlyMap<SourceId, LoadResult>,
): void {
  const all = new Map(
    [...results.values()].flatMap((result) =>
      result.spools.map((spool) => [spoolKey(spool), spool] as const),
    ),
  );
  const keys = insights.loadedWatchedKeys();
  const dropped = insights.droppedWatched();
  const absent = insights.watched.size - keys.length;
  container.replaceChildren(
    h("h3", { id: "insight-watchlist-heading", class: "text-base font-semibold" }, "Watchlist"),
    keys.length
      ? h(
          "p",
          { class: "mt-1 text-sm text-muted-foreground" },
          dropped.size
            ? `${plural(dropped.size, "watched spool")} lost weight since the last load.`
            : "No watched spool has lost weight since the last load.",
        )
      : h(
          "p",
          { class: "mt-1 text-sm text-muted-foreground" },
          "Use Watch in the table to pin spools. Pinned spools that lose weight are highlighted after you reload a file.",
        ),
    keys.length
      ? table(
          "Watched spools",
          ["Spool", "Service", "Remaining", "Since last load"],
          keys.map((key) => {
            const spool = all.get(key)!;
            const drop = dropped.get(key);
            return h(
              "tr",
              { class: drop ? "bg-warning/10" : "" },
              h("th", { scope: "row", class: "text-left font-medium" }, spoolLabel(spool)),
              h("td", {}, SOURCE_LABELS[spool.source]),
              h(
                "td",
                { class: "tabular-nums" },
                spool.remainingWeight === null ? "Unknown" : grams(spool.remainingWeight),
              ),
              h(
                "td",
                { class: drop ? "font-medium text-warning-text" : "text-muted-foreground" },
                drop ? `Dropped ${grams(-drop.delta)}` : "No drop",
              ),
            );
          }),
        )
      : "",
    absent > 0
      ? h(
          "p",
          { class: "mt-1 text-xs text-muted-foreground" },
          `${plural(absent, "pinned spool")} not loaded right now.`,
        )
      : "",
  );
}

/** Fills the four insight panels on the Load page. They are hidden until something is loaded. */
export function renderInsights(
  root: HTMLElement,
  insights: LoadInsights,
  results: ReadonlyMap<SourceId, LoadResult>,
): void {
  root.hidden = results.size === 0;
  if (root.hidden) return;
  const panels: Array<[string, (container: HTMLElement) => void]> = [
    ["insight-health", (c) => renderHealth(c, insights)],
    ["insight-duplicates", (c) => renderDuplicates(c, insights)],
    ["insight-changes", (c) => renderChanges(c, insights)],
    ["insight-watchlist", (c) => renderWatchlist(c, insights, results)],
  ];
  for (const [id, render] of panels) {
    const container = document.getElementById(id);
    if (container) render(container);
  }
}
