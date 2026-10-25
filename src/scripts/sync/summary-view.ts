import { openConflicts } from "@spoolsync/core/core/compare";
import { SOURCE_LABELS } from "@spoolsync/core/core/model";

import { byId, h, notice } from "../dom";
import type { SyncSession } from "./session";

export function createSummaryView(state: SyncSession) {
  function renderSummary(): void {
    const groups = state.match.groups;
    const linked = groups.filter((g) => g.status === "linked").length;
    const suggested = state.match.suggestions.length;
    const open = groups.filter((g) => openConflicts(g, state.resolutionFor(g)).length).length;
    const missing = groups.filter((g) => state.missingSources(g).length).length;
    const stat = (label: string, value: number, hint: string) =>
      h(
        "div",
        { class: "modern-card rounded-2xl border bg-card p-5 shadow-xs" },
        h(
          "p",
          { class: "text-xs font-semibold uppercase tracking-wider text-muted-foreground" },
          label,
        ),
        h("p", { class: "mt-2 text-3xl font-extrabold tracking-tight" }, String(value)),
        h("p", { class: "mt-1.5 text-xs text-muted-foreground" }, hint),
      );
    byId("sync-summary").replaceChildren(
      stat(
        "Spools",
        groups.length,
        state
          .loadedSources()
          .map((s) => `${SOURCE_LABELS[s]} ${state.loaded.get(s)!.spools.length}`)
          .join(" · "),
      ),
      stat("Linked across services", linked, "Matched by IDs or your confirmation"),
      stat(
        "Open conflicts",
        open,
        suggested
          ? `${suggested} possible match${suggested === 1 ? "" : "es"} to review`
          : "Spools where services disagree",
      ),
      stat("Missing in writable services", missing, "Can be added where imports are supported"),
    );
    byId("sync-problems").replaceChildren(
      ...(state.match.problems.length
        ? [
            notice(
              "warning",
              "Conflicting IDs",
              ...state.match.problems.map((p) => h("p", { class: "mt-1" }, p)),
            ),
          ]
        : []),
    );
  }

  return renderSummary;
}
