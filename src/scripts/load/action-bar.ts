import { allSpools } from "@spoolsync/core/core/model";
import { findMatchesCached as findMatches } from "@spoolsync/core/planner";

import { loadMatchDecisions } from "~/lib/browser/storage";

import type { LoadState } from "./state";

/** Possible matches still unanswered across what is loaded; zero when there is nothing to compare. */
function pendingMatches(state: LoadState): number {
  if (state.results.size < 2) return 0;
  try {
    return findMatches(allSpools(state.results.values()), loadMatchDecisions()).suggestions.length;
  } catch {
    return 0;
  }
}

/** Keeps the sticky "Continue" bar in step with what is loaded. */
export function createActionBar(state: LoadState): { update(): void } {
  const bar = document.getElementById("load-bar");
  const summary = document.getElementById("load-bar-summary");
  const link = document.getElementById("continue-sync");
  link?.addEventListener("click", (event) => {
    if (link.getAttribute("aria-disabled") === "true") event.preventDefault();
  });

  function update(): void {
    if (!bar || !summary || !link) return;
    const sources = state.results.size;
    const spools = [...state.results.values()].reduce(
      (total, result) => total + result.spools.length,
      0,
    );
    const ready = sources >= 2;
    const pending = pendingMatches(state);
    bar.hidden = sources === 0;
    summary.textContent =
      sources === 0
        ? "Nothing loaded yet. Drop export files above or open a service below."
        : `${sources} ${sources === 1 ? "service" : "services"} loaded · ${spools} ${spools === 1 ? "spool" : "spools"}${ready ? "" : ". Load one more to compare."}${pending ? ` · ${pending} possible ${pending === 1 ? "match" : "matches"} to review` : ""}`;
    link.setAttribute("aria-disabled", String(!ready));
    link.classList.toggle("opacity-50", !ready);
    // Stay focusable while blocked so keyboard and screen-reader users can find the link and hear
    // why (via aria-describedby on the summary); the click handler above stops the navigation.
  }
  return { update };
}
