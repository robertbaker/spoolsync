import { compareGroup, openConflicts, type GroupResolution } from "@spoolsync/core/core/compare";
import type { SpoolGroup } from "@spoolsync/core/core/match";
import { SOURCE_LABELS } from "@spoolsync/core/core/model";

import { updatePreferences } from "~/lib/preferences";

import { byId, h, showToast } from "../dom";
import { button } from "./presentation";
import type { SyncSession } from "./session";

export function createControlsView(
  state: SyncSession,
  renderAll: () => void,
  renderGroups: () => void,
) {
  function renderFilters(): void {
    const groups = state.match.groups;
    const openCount = groups.filter(
      (g) => openConflicts(g, state.resolutionFor(g)).length > 0,
    ).length;
    const missingCount = groups.filter((g) => state.missingSources(g).length > 0).length;

    const options: Array<[typeof state.filter, string, number]> = [
      ["all", "All", groups.length],
      ["open", "Open conflicts", openCount],
      ["missing", "Missing somewhere", missingCount],
    ];
    byId("filters").replaceChildren(
      ...options.map(([value, label, count]) => {
        const active = state.filter === value;
        const countPill = h(
          "span",
          {
            class: `ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] ${
              active
                ? "bg-primary text-primary-foreground font-bold"
                : "bg-muted text-muted-foreground"
            }`,
          },
          String(count),
        );
        const element = button(
          label,
          () => {
            state.filter = value;
            updatePreferences({ syncFilter: value === "all" ? undefined : value });
            renderFilters();
            renderGroups();
          },
          "outline",
          {
            class: `inline-flex items-center rounded-full px-3 py-1.5 text-xs font-medium border transition-all ${
              active
                ? "border-primary/60 bg-primary/10 text-primary-text font-semibold shadow-xs"
                : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"
            }`,
          },
        );
        element.append(countPill);
        element.setAttribute("aria-pressed", String(active));
        return element;
      }),
    );
  }

  function bulk(
    label: string,
    action: (group: SpoolGroup, resolution: GroupResolution) => void,
  ): void {
    state.checkpoint(label);
    for (const group of state.match.groups) {
      state.updateResolution(group, (draft) => action(group, draft));
    }
    state.persist();
    renderAll();
  }

  /** Undoes or redoes the last change to the plan, then redraws and says what happened. */
  function undoOrRedo(direction: "undo" | "redo"): boolean {
    const label = direction === "undo" ? state.undo() : state.redo();
    if (label === null) return false;
    renderAll();
    showToast(`${direction === "undo" ? "Undid" : "Redid"} ${label}`, "info");
    return true;
  }

  function renderBulk(): void {
    const sources = state.loadedSources();
    const writeTargets = state.writableLoadedSources();
    const controls: HTMLElement[] = sources.map((source) =>
      button(`Take ${SOURCE_LABELS[source]}'s values`, () => {
        bulk(`taking ${SOURCE_LABELS[source]}'s values`, (group, resolution) => {
          const member = group.members[source];
          if (!member) return;
          for (const comparison of compareGroup(group)) {
            if (
              comparison.kind === "conflict" &&
              comparison.options.some((o) => o.sources.includes(source))
            ) {
              resolution.values[comparison.field] = member[comparison.field];
            }
          }
        });
        showToast(`Applied ${SOURCE_LABELS[source]}'s values across conflicts`, "info");
      }),
    );
    controls.push(
      button("Take lowest remaining weight", () => {
        bulk("taking the lowest remaining weights", (group, resolution) => {
          const comparison = compareGroup(group).find(
            (c) => c.field === "remainingWeight" && c.kind === "conflict",
          );
          if (!comparison) return;
          resolution.values.remainingWeight = Math.min(
            ...comparison.options.map((o) => o.value as number),
          );
        });
        showToast("Selected lowest remaining weights across conflicts", "info");
      }),
    );
    for (const source of writeTargets) {
      controls.push(
        button(`Add all missing to ${SOURCE_LABELS[source]}`, () => {
          bulk(`adding all missing spools to ${SOURCE_LABELS[source]}`, (group, resolution) => {
            if (state.pendingGroupIds().has(group.id)) return;
            if (!group.members[source] && !resolution.createIn.includes(source))
              resolution.createIn.push(source);
          });
          showToast(`Marked all missing spools to add in ${SOURCE_LABELS[source]}`, "info");
        }),
      );
    }
    controls.push(
      button("Reset choices", () => {
        state.checkpoint("resetting all choices");
        state.resolutions.clear();
        state.clearExclusions();
        state.persist();
        renderAll();
        showToast("Reset all resolution choices", "info");
      }),
    );
    const undo = button(
      state.undoLabel() ? `Undo ${state.undoLabel()}` : "Undo",
      () => undoOrRedo("undo"),
      "outline",
      { id: "undo-choice", title: "Undo the last change (Ctrl+Z)" },
    );
    undo.disabled = state.undoLabel() === null;
    const redo = button(
      state.redoLabel() ? `Redo ${state.redoLabel()}` : "Redo",
      () => undoOrRedo("redo"),
      "outline",
      { id: "redo-choice", title: "Redo (Ctrl+Shift+Z)" },
    );
    redo.disabled = state.redoLabel() === null;
    byId("bulk").replaceChildren(undo, redo, ...controls);
  }

  return { renderFilters, renderBulk, undoOrRedo };
}
