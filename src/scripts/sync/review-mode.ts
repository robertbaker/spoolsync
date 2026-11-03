import type { MatchSuggestion, SpoolGroup } from "@spoolsync/core/core/match";

import { byId, h } from "../dom";
import { isTypingTarget } from "../shortcuts";
import { button } from "./presentation";
import { pairAnnouncement, resultAnnouncement, ReviewQueue, suggestionId } from "./review-queue";
import type { SyncSession } from "./session";
import { attachSwipe } from "./swipe";
import { describePair, suggestionCard, suggestionRecords } from "./suggestion-card";

export interface ReviewDependencies {
  state: SyncSession;
  /** Records an answer, then redraws the page. */
  decide(suggestion: MatchSuggestion, same: boolean): void;
  /** Undoes the last change, then redraws the page; false when there was nothing to undo. */
  undo(): boolean;
  /** Redraws the possible-matches list. */
  rerender(): void;
}

type Action = "same" | "different" | "skip" | "undo" | "none";

/**
 * A mode of the "Possible matches" section that shows one suggestion at a time and answers it from
 * the keyboard: S same spool, D different spools, N skip for now, Z undo. Skipping keeps the pair
 * pending. Keys are ignored while typing in a field or while a dialog is open.
 */
export function createReviewMode(dependencies: ReviewDependencies) {
  const { state } = dependencies;
  let queue: ReviewQueue | null = null;
  let lastAction: Action = "none";
  let wantFocus = false;

  const active = () => queue !== null;

  function announce(message: string): void {
    const live = document.getElementById("review-live");
    if (live) live.textContent = message;
  }

  function currentSuggestion(): MatchSuggestion | undefined {
    const id = queue?.view().current;
    return id ? state.match.suggestions.find((item) => suggestionId(item) === id) : undefined;
  }

  function renderControls(visible: boolean): void {
    const container = byId("review-controls");
    container.replaceChildren(
      ...(visible
        ? [
            button("Review one at a time", start, "outline", {
              id: "review-start",
              "aria-describedby": "review-start-hint",
            }),
            h(
              "span",
              { id: "review-start-hint", class: "text-xs text-muted-foreground" },
              "Step through the pairs with the keyboard: S same, D different, N skip, Z undo.",
            ),
          ]
        : []),
    );
  }

  function start(): void {
    if (state.match.suggestions.length === 0) return;
    if (!queue) queue = new ReviewQueue();
    lastAction = "none";
    wantFocus = true;
    dependencies.rerender();
  }

  function exit(): void {
    if (!queue) return;
    queue = null;
    dependencies.rerender();
    document.getElementById("review-start")?.focus();
    announce("Left match review.");
  }

  function act(action: Exclude<Action, "none">): void {
    const suggestion = currentSuggestion();
    if (action === "undo") {
      lastAction = "undo";
      wantFocus = true;
      if (!dependencies.undo()) {
        lastAction = "none";
        announce("Nothing to undo.");
      }
      return;
    }
    if (!suggestion || !queue) return;
    lastAction = action;
    wantFocus = true;
    if (action === "skip") {
      queue.skip(suggestionId(suggestion));
      dependencies.rerender();
      return;
    }
    dependencies.decide(suggestion, action === "same");
  }

  /** Draws the review in place of the list. Returns false when the normal list should be drawn. */
  function render(groupsById: ReadonlyMap<string, SpoolGroup>): boolean {
    const suggestions = state.match.suggestions;
    renderControls(suggestions.length > 0 && !queue);
    if (!queue) return false;
    queue.sync(suggestions.map(suggestionId));
    const view = queue.view();
    const result = resultAnnouncement(lastAction, view);
    lastAction = "none";
    if (view.pending === 0) {
      queue = null;
      announce(result);
      return false;
    }

    const suggestion = view.current
      ? suggestions.find((item) => suggestionId(item) === view.current)
      : undefined;
    const heading = h(
      "h3",
      { id: "review-heading", tabindex: "-1", class: "text-lg font-semibold outline-offset-4" },
      suggestion ? `Match ${view.position} of ${view.total}` : "No matches left to look at",
      view.skipped > 0
        ? h(
            "span",
            { class: "ml-2 text-sm font-normal text-muted-foreground" },
            `${view.skipped} skipped`,
          )
        : null,
    );
    const panel = h(
      "div",
      { class: "rounded-xl border bg-muted/30 p-4", id: "review-panel" },
      h(
        "div",
        { class: "flex flex-wrap items-center justify-between gap-3" },
        heading,
        button("Exit review", exit, "outline", { "aria-keyshortcuts": "Escape" }),
      ),
      h(
        "p",
        { class: "mt-2 text-xs text-muted-foreground" },
        "Shortcuts: S same spool, D different spools, N skip for now (it stays pending), Z undo, Esc exit. They are off while you type in a field.",
      ),
      h(
        "p",
        { class: "swipe-hint mt-1 text-xs text-muted-foreground" },
        "On a touch screen you can also swipe the card: right for same spool, left to skip for now. The buttons do the same.",
      ),
      suggestion
        ? null
        : h(
            "div",
            { class: "mt-3 flex flex-wrap items-center gap-3" },
            h(
              "p",
              { class: "text-sm" },
              `You skipped the remaining ${view.skipped} ${view.skipped === 1 ? "match" : "matches"}. They are still pending.`,
            ),
            button(
              "Review skipped again",
              () => {
                queue?.reviewSkipped();
                wantFocus = true;
                dependencies.rerender();
              },
              "primary",
            ),
          ),
    );
    const card = suggestion
      ? suggestionCard(suggestion, groupsById, {
          same: () => act("same"),
          different: () => act("different"),
          skip: () => act("skip"),
          undo: () => act("undo"),
          canUndo: state.undoLabel() !== null,
        })
      : null;
    // Touch shortcut for the same answers the buttons and keys give: right is "same", left skips.
    if (card)
      attachSwipe(card, {
        onSwipe: (direction) => act(direction === "right" ? "same" : "skip"),
      });
    byId("suggestions").replaceChildren(panel, ...(card ? [card] : []));
    if (suggestion) {
      const description = describePair(suggestionRecords(suggestion, groupsById).members);
      announce(`${result} ${pairAnnouncement(view, description)}`.trim());
    } else announce(result);
    if (wantFocus) {
      wantFocus = false;
      heading.focus({ preventScroll: true });
    }
    return true;
  }

  function wireKeys(): void {
    document.addEventListener("keydown", (event) => {
      if (!queue || event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
      if (event.defaultPrevented || isTypingTarget(document.activeElement)) return;
      if (document.querySelector("dialog[open]")) return;
      const key = event.key.toLowerCase();
      if (key === "escape") {
        event.preventDefault();
        return exit();
      }
      const action = ({ s: "same", d: "different", n: "skip", z: "undo" } as const)[
        key as "s" | "d" | "n" | "z"
      ];
      if (!action) return;
      event.preventDefault();
      act(action);
    });
  }

  return { active, start, exit, render, wireKeys };
}
