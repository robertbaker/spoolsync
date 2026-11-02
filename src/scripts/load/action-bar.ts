import type { LoadState } from "./state";

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
    bar.hidden = sources === 0;
    summary.textContent =
      sources === 0
        ? "Nothing loaded yet. Drop export files above or open a service below."
        : `${sources} ${sources === 1 ? "service" : "services"} loaded · ${spools} ${spools === 1 ? "spool" : "spools"}${ready ? "" : ". Load one more to compare."}`;
    link.setAttribute("aria-disabled", String(!ready));
    link.classList.toggle("opacity-50", !ready);
    link.classList.toggle("pointer-events-none", !ready);
    link.tabIndex = ready ? 0 : -1;
  }
  return { update };
}
