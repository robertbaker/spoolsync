import {
  compareGroup,
  openConflicts,
  type FieldComparison,
  type FieldValue,
} from "@spoolsync/core/core/compare";
import type { SpoolGroup } from "@spoolsync/core/core/match";
import { SOURCE_IDS, SOURCE_LABELS, type CommonSpool } from "@spoolsync/core/core/model";

import { byId, h } from "../dom";
import { comparisonRow } from "./comparison-row";
import { sourceTag, spoolTitle, swatches } from "./presentation";
import type { SyncSession } from "./session";

export function createGroupsView(state: SyncSession, onChanged: () => void) {
  function groupTitle(group: SpoolGroup): CommonSpool {
    return SOURCE_IDS.map((source) => group.members[source]).find(Boolean)!;
  }

  function setValue(
    group: SpoolGroup,
    field: FieldComparison["field"],
    value: FieldValue | undefined,
  ): void {
    const resolution = state.resolutionFor(group);
    if (value === undefined) delete resolution.values[field];
    else resolution.values[field] = value;
    state.persist();

    onChanged();
    updateGroupStatus(group);
  }

  function updateGroupStatus(group: SpoolGroup): void {
    const status = document.querySelector<HTMLElement>(
      `[data-status-for="${CSS.escape(group.id)}"]`,
    );
    if (!status) return;
    const open = openConflicts(group, state.resolutionFor(group)).length;
    status.textContent = open ? `${open} to resolve` : "Ready";
    status.className = `rounded-full px-2 py-0.5 text-xs font-medium ${open ? "bg-warning/15 text-warning-text" : "bg-success/15 text-success-text"}`;
  }

  function groupCard(group: SpoolGroup): HTMLElement | null {
    const comparisons = compareGroup(group);
    const missing = state.missingSources(group);
    if (!comparisons.length && !missing.length) return null;
    const sources = state.loadedSources().filter((source) => group.members[source]);
    const first = groupTitle(group);
    const resolution = state.resolutionFor(group);

    const card = h(
      "article",
      {
        class:
          "modern-card rounded-2xl border bg-card shadow-xs transition-colors hover:border-primary/40 overflow-hidden",
        "data-group": group.id,
      },
      h(
        "header",
        { class: "flex flex-wrap items-center justify-between gap-2 p-4 sm:p-5" },
        h(
          "div",
          {},
          h("h3", { class: "text-lg" }, spoolTitle(first), " ", swatches(first.colors)),
          h(
            "div",
            { class: "mt-1 flex flex-wrap gap-1" },
            ...sources.map((s) => sourceTag(s, group.members[s]!.sourceId)),
          ),
        ),
        h("span", { "data-status-for": group.id }),
      ),
    );

    if (comparisons.length) {
      card.append(
        h(
          "div",
          { class: "overflow-x-auto border-t" },
          h(
            "table",
            { class: "w-full text-sm" },
            h(
              "thead",
              { class: "text-muted-foreground" },
              h(
                "tr",
                {},
                h("th", { class: "px-3 py-2 text-left font-medium", scope: "col" }, "Field"),
                ...sources.map((s) =>
                  h(
                    "th",
                    { class: "px-3 py-2 text-left font-medium", scope: "col" },
                    SOURCE_LABELS[s],
                  ),
                ),
                h(
                  "th",
                  { class: "px-3 py-2", scope: "col" },
                  h("span", { class: "sr-only" }, "No change"),
                ),
              ),
            ),
            h(
              "tbody",
              {},
              ...comparisons.map((comparison) =>
                comparisonRow(group, comparison, sources, resolution, setValue),
              ),
            ),
          ),
        ),
      );
    }

    if (missing.length) {
      const pending = state.pendingGroupIds().has(group.id);
      card.append(
        h(
          "div",
          { class: "flex flex-wrap items-center gap-4 border-t p-4 text-sm" },
          pending
            ? h(
                "p",
                { class: "w-full text-xs text-muted-foreground" },
                "Answer the possible match above before adding this spool elsewhere.",
              )
            : null,
          ...missing.map((source) => {
            const id = `${group.id}::create::${source}`;
            const input = h("input", { type: "checkbox", id, class: "size-4" });
            input.checked = resolution.createIn.includes(source);
            input.disabled = pending;
            input.addEventListener("change", () => {
              resolution.createIn = input.checked
                ? [...new Set([...resolution.createIn, source])]
                : resolution.createIn.filter((s) => s !== source);
              state.persist();

              onChanged();
            });
            return h(
              "label",
              {
                for: id,
                class:
                  "flex cursor-pointer items-center gap-2 select-none rounded-lg border border-transparent px-2.5 py-1 text-sm transition-colors has-[:checked]:border-primary/40 has-[:checked]:bg-primary/10 has-[:checked]:text-primary hover:bg-muted/60",
              },
              input,
              `Add to ${SOURCE_LABELS[source]}`,
            );
          }),
        ),
      );
    }
    return card;
  }

  function renderGroups(): void {
    const cards = state
      .visibleGroups()
      .map(groupCard)
      .filter((card): card is HTMLElement => card !== null);
    byId("groups").replaceChildren(
      ...(cards.length
        ? cards
        : [
            h(
              "p",
              { class: "rounded-lg border border-dashed p-8 text-center text-muted-foreground" },
              state.filter === "all" ? "Everything matches. Nothing to do." : "Nothing here.",
            ),
          ]),
    );
    for (const group of state.visibleGroups()) updateGroupStatus(group);
  }

  return renderGroups;
}
