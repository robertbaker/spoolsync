import { loadMatchDecisions, saveMatchDecisions } from "~/lib/browser/storage";
import { markDifferent, recordTitle, type Candidate, type SpoolDetail } from "~/lib/spool-detail";

import { h, showToast } from "../dom";
import type { LoadInsights } from "./insights";
import { printLabelSheet } from "./label-sheet";

export const BUTTON =
  "rounded-md border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50";

/** What the drawer's controls need from the drawer itself. */
export interface DrawerHooks {
  insights: LoadInsights;
  /** Called after an action changed what the page shows (watching, a new answer). */
  onChange: () => void;
  /** Redraws the open drawer. */
  rerender: () => void;
  /** Moves focus to the first element in the drawer matching the selector. */
  focus: (selector: string) => void;
}

const REASON_TEXT: Record<Candidate["reason"], string> = {
  suggestion: "Looks like the same spool",
  duplicate: "Possible duplicate in the same service",
  confirmed: "Linked by your answer",
};

export function candidateList(detail: SpoolDetail, hooks: DrawerHooks): HTMLElement | null {
  if (!detail.candidates.length) return null;
  return h(
    "ul",
    { class: "mt-2 grid gap-2 text-sm" },
    ...detail.candidates.map((candidate) => {
      const button = h(
        "button",
        {
          type: "button",
          class: BUTTON,
          "data-action": "different",
          "aria-label": `Mark ${recordTitle(candidate.spool)} as a different spool`,
        },
        "Mark as different",
      );
      button.addEventListener("click", () => {
        try {
          const [a, b] = candidate.pair;
          saveMatchDecisions(markDifferent(loadMatchDecisions(), a, b));
        } catch {
          showToast("Could not save that answer", "error");
          return;
        }
        showToast("Saved: not the same spool", "success");
        hooks.onChange();
        hooks.rerender();
        hooks.focus("[data-drawer-title]");
      });
      return h(
        "li",
        { class: "flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3" },
        h(
          "div",
          { class: "min-w-0" },
          h("p", { class: "font-medium" }, recordTitle(candidate.spool)),
          h(
            "p",
            { class: "text-xs text-muted-foreground" },
            [
              REASON_TEXT[candidate.reason],
              [candidate.spool.vendor, candidate.spool.material, candidate.spool.name]
                .filter(Boolean)
                .join(" "),
              ...candidate.because,
            ]
              .filter(Boolean)
              .join(" · "),
          ),
        ),
        button,
      );
    }),
  );
}

export function actions(detail: SpoolDetail, hooks: DrawerHooks): HTMLElement {
  const watching = hooks.insights.watched.has(detail.key);
  const watch = h(
    "button",
    { type: "button", class: BUTTON, "aria-pressed": String(watching), "data-action": "watch" },
    watching ? "Unwatch" : "Watch",
  );
  watch.addEventListener("click", () => {
    hooks.insights.toggleWatch(detail.key);
    hooks.onChange();
    hooks.rerender();
    hooks.focus('[data-action="watch"]');
  });
  const print = h(
    "button",
    { type: "button", class: BUTTON, "data-action": "label" },
    "Print label",
  );
  print.addEventListener("click", () => {
    try {
      printLabelSheet([detail.spool]);
    } catch {
      showToast("Could not prepare the label", "error");
    }
  });
  return h("div", { class: "mt-4 flex flex-wrap gap-2" }, watch, print);
}
