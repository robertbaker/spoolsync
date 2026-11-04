import {
  groupDrying,
  spoolsToDry,
  type CatalogDrying,
  type DryingEntry,
} from "@spoolsync/core/core/drying";
import type { CommonSpool, LoadResult, SourceId } from "@spoolsync/core/core/model";
import { spoolKey } from "@spoolsync/core/workflow";

import { DISPLAY_CHANGED, formatWeight } from "~/lib/units";

import { h } from "../dom";
import { plural } from "./presentation";

const label = (spool: CommonSpool) =>
  [spool.vendor, spool.material, spool.name].filter(Boolean).join(" ") || `Spool ${spool.sourceId}`;

const hours = (value: number) => `${Number.isInteger(value) ? value : value.toFixed(1)} h`;

function settingsText(entry: DryingEntry["advice"]): string {
  const parts = [`${entry.tempC} °C`, hours(entry.hours)];
  return `${parts.join(" for ")}${entry.origin === "catalog" ? " (from the catalog)" : " (typical)"}`;
}

/**
 * The drying guide: spools of materials that take up moisture, grouped so several can go in the
 * dryer together, with the usual temperature and time. Where a spool is tied to a reference record
 * that gives drying settings, those are used instead.
 */
export function wireDryingPanel(
  root: HTMLElement,
  results: ReadonlyMap<SourceId, LoadResult>,
  catalogFor: (spool: CommonSpool) => CatalogDrying | null = () => null,
): { update(): void; count(): number } {
  const details = h("details", { class: "rounded-xl border", id: "drying-details" });
  const summary = h(
    "summary",
    {
      class:
        "cursor-pointer rounded-xl p-4 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-primary",
    },
    "Drying guide",
  );
  const content = h("div", { class: "px-4 pb-4" });
  details.append(summary, content);
  root.replaceChildren(details);
  let includeLow = false;

  const entries = () =>
    spoolsToDry(
      [...results.values()].flatMap((result) => result.spools),
      { includeLow, catalogFor: (spool) => catalogFor(spool) },
    );

  function build(list: DryingEntry[]): void {
    const toggle = h("input", {
      type: "checkbox",
      id: "drying-include-low",
      class: "mr-2 align-middle",
    });
    toggle.checked = includeLow;
    toggle.addEventListener("change", () => {
      includeLow = toggle.checked;
      build(entries());
      update();
    });
    const groups = groupDrying(list);
    content.replaceChildren(
      h(
        "p",
        { class: "text-sm text-muted-foreground" },
        "Spools of materials that absorb moisture, with the usual drying settings. Check the manufacturer's advice for the exact filament; settings come from the reference catalog when a spool is tied to a record that has them.",
      ),
      h(
        "label",
        { class: "mt-2 block text-xs", for: "drying-include-low" },
        toggle,
        "Also show materials that rarely need drying (PLA, ABS, ASA)",
      ),
      groups.length
        ? h(
            "div",
            { class: "mt-3 grid gap-3" },
            ...groups.map((group) =>
              h(
                "section",
                { class: "rounded-lg border p-3", "aria-label": group.material },
                h(
                  "h3",
                  { class: "text-sm font-semibold" },
                  `${group.material}: ${settingsText(group.advice)}`,
                ),
                h(
                  "ul",
                  { class: "mt-2 grid gap-1 text-xs" },
                  ...group.entries
                    .slice(0, 30)
                    .map(({ spool, advice }) =>
                      h(
                        "li",
                        { "data-spool": spoolKey(spool) },
                        `${label(spool)}${
                          spool.remainingWeight === null
                            ? ""
                            : `, ${formatWeight(spool.remainingWeight)} left`
                        }`,
                        advice.origin === "catalog" && advice !== group.advice
                          ? h(
                              "span",
                              { class: "text-muted-foreground" },
                              ` (${settingsText(advice)})`,
                            )
                          : "",
                      ),
                    ),
                  group.entries.length > 30
                    ? h(
                        "li",
                        { class: "text-muted-foreground" },
                        `and ${group.entries.length - 30} more`,
                      )
                    : "",
                ),
              ),
            ),
          )
        : h(
            "div",
            { class: "empty-state mt-3" },
            h("strong", {}, "Nothing to dry"),
            h("p", {}, "No loaded spool is made of a material that usually needs drying."),
          ),
    );
  }

  function update(): void {
    const list = entries();
    root.hidden = results.size === 0 || (list.length === 0 && !includeLow);
    if (root.hidden) {
      details.open = false;
      return;
    }
    summary.textContent = `Drying guide (${plural(list.length, "spool")} worth drying)`;
    if (details.open) build(list);
  }

  details.addEventListener("toggle", () => {
    if (details.open) build(entries());
  });
  // Weights are shown in the chosen unit, which can change while the panel is open.
  document.addEventListener(DISPLAY_CHANGED, () => {
    if (details.open) build(entries());
  });

  return { update, count: () => entries().length };
}
