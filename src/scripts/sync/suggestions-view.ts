import type { MatchSuggestion } from "@spoolsync/core/core/match";

import { byId, h } from "../dom";
import { button } from "./presentation";
import type { createReviewMode } from "./review-mode";
import type { SyncSession } from "./session";
import { suggestionCard } from "./suggestion-card";

export function createSuggestionsView(
  state: SyncSession,
  decide: (suggestion: MatchSuggestion, same: boolean) => void,
  decideAll: (same: boolean) => void,
  resetAnswers: () => void,
  review: Pick<ReturnType<typeof createReviewMode>, "render" | "active">,
) {
  const CONFIRM_WINDOW_MS = 5000;

  /** A bulk answer cannot be undone from the page, so it takes a second click to confirm. */
  function bulkButton(
    label: string,
    same: boolean,
    count: number,
    primary: boolean,
  ): HTMLButtonElement {
    const control = button(
      label,
      () => {
        if (control.dataset["armed"] !== "true") {
          control.dataset["armed"] = "true";
          control.textContent = `Click again to ${same ? "confirm" : "reject"} ${count} pairs`;
          setTimeout(() => {
            if (!control.isConnected) return;
            delete control.dataset["armed"];
            control.textContent = label;
          }, CONFIRM_WINDOW_MS);
          return;
        }
        decideAll(same);
      },
      primary ? "primary" : "outline",
    );
    return control;
  }

  /** Saved answers outlive the tab, so show them and let the visitor take them back. */
  function renderAnswers(): void {
    const { same, different } = state.decisionCounts();
    const container = byId("match-answers");
    container.hidden = same + different === 0;
    if (container.hidden) return container.replaceChildren();
    container.replaceChildren(
      h(
        "div",
        {
          class:
            "flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/30 p-4",
        },
        h(
          "p",
          { class: "text-sm text-muted-foreground" },
          `You have answered ${same + different} possible ${same + different === 1 ? "match" : "matches"} (${same} same, ${different} different). Answers are remembered in this browser.`,
        ),
        button("Reset my match answers", resetAnswers),
      ),
    );
  }

  /** Where keyboard focus sits in the list before it is redrawn: the pair's position, or -1. */
  function focusedPosition(): number {
    const active = document.activeElement;
    if (!active) return -1;
    const cards = [...byId("suggestions").children];
    const index = cards.findIndex((card) => card.contains(active));
    if (index >= 0) return index;
    return byId("suggestions-bulk").contains(active) || byId("match-answers").contains(active)
      ? 0
      : -1;
  }

  /**
   * Redrawing removes the button that was pressed, so hand focus to the next pair, or on to the
   * list below.
   */
  function restoreFocus(position: number): void {
    if (position < 0) return;
    const cards = [...byId("suggestions").children];
    const next = cards[Math.min(position, cards.length - 1)]?.querySelector("button");
    if (next) return next.focus();
    const heading = byId("differences-heading");
    heading.tabIndex = -1;
    heading.focus({ preventScroll: false });
  }

  function renderSuggestions(): void {
    renderAnswers();
    byId("suggestions-section").hidden = state.match.suggestions.length === 0;
    const count = state.match.suggestions.length;
    const groupsById = new Map(state.match.groups.map((group) => [group.id, group]));
    if (review.render(groupsById)) {
      byId("suggestions-bulk").replaceChildren();
      return;
    }
    byId("suggestions-bulk").replaceChildren(
      ...(count > 1
        ? [
            bulkButton(`All ${count} are the same spool`, true, count, false),
            bulkButton(`All ${count} are different`, false, count, false),
          ]
        : []),
    );
    byId("suggestions").replaceChildren(
      ...state.match.suggestions.map((suggestion) =>
        suggestionCard(suggestion, groupsById, {
          same: () => decide(suggestion, true),
          different: () => decide(suggestion, false),
        }),
      ),
    );
  }

  return () => {
    const position = focusedPosition();
    renderSuggestions();
    // The review moves focus itself; the plain list hands it to the next pair.
    if (!review.active()) restoreFocus(position);
  };
}
