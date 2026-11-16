import { openConflicts } from "@spoolsync/core/core/compare";
import { SOURCE_LABELS } from "@spoolsync/core/core/model";

import { byId, h, notice } from "../dom";
import type { SyncSession } from "./session";

export function createSummaryView(state: SyncSession) {
  function renderSummary(): void {
    const groups = state.match.groups;
    const suggested = state.match.suggestions.length;
    const unresolved = groups.filter((g) => openConflicts(g, state.resolutionFor(g)).length).length;
    const steps = [
      {
        href: "#suggestions-section",
        number: "1",
        title: "Confirm matches",
        detail: suggested ? `${suggested} to review` : "No matches to review",
        complete: suggested === 0,
        current: suggested > 0,
      },
      {
        href: "#tour-differences",
        number: "2",
        title: "Resolve differences",
        detail: unresolved
          ? `${unresolved} spool${unresolved === 1 ? "" : "s"} to review`
          : "Ready",
        complete: unresolved === 0,
        current: suggested === 0 && unresolved > 0,
      },
      {
        href: "#tour-apply",
        number: "3",
        title: "Apply or export",
        detail: "Review the plan",
        complete: false,
        current: suggested === 0 && unresolved === 0,
      },
    ];
    const sourceSummary = state
      .loadedSources()
      .map((source) => `${SOURCE_LABELS[source]} ${state.loaded.get(source)!.spools.length}`)
      .join(" · ");
    byId("sync-summary").replaceChildren(
      ...steps.map((step) =>
        h(
          "a",
          {
            class: "sync-workflow__step",
            href: step.href,
            ...(step.current ? { "aria-current": "step" } : {}),
            "data-complete": String(step.complete),
          },
          h(
            "span",
            { class: "sync-workflow__number", "aria-hidden": "true" },
            step.complete ? "✓" : step.number,
          ),
          h(
            "span",
            { class: "sync-workflow__copy" },
            h("span", { class: "sync-workflow__title" }, step.title),
            h("span", { class: "sync-workflow__detail" }, step.detail),
          ),
          h("span", { class: "sync-workflow__arrow", "aria-hidden": "true" }, "→"),
        ),
      ),
      h(
        "p",
        { class: "sync-workflow__inventory" },
        `${groups.length} spool groups · ${sourceSummary}`,
      ),
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
