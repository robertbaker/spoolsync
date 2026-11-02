import { SOURCE_IDS, type SourceId } from "@spoolsync/core/core/model";

import type { LoadState } from "./state";

type Filter = "all" | "loaded" | "api" | "readonly";

/**
 * Makes the long list of services manageable: each is a native disclosure that opens itself when it
 * has something to say, with search and filter chips on top. Everything degrades to plain
 * open/closed details when this script does not run.
 */
export function wireSourcePanels(state: LoadState): { refresh(): void } {
  const panels = SOURCE_IDS.flatMap((source) => {
    const element = document.querySelector(`[data-panel="${source}"]`);
    return element instanceof HTMLDetailsElement ? [{ source, element }] : [];
  });
  const search = document.getElementById("source-search") as HTMLInputElement | null;
  const chips = [...document.querySelectorAll<HTMLButtonElement>("[data-source-filter]")];
  const empty = document.getElementById("source-empty");
  const count = document.getElementById("source-count");
  let filter: Filter = "all";

  for (const { source, element } of panels) {
    const message = document.getElementById(`${source}-message`);
    if (message)
      new MutationObserver(() => {
        if (message.childElementCount > 0) element.open = true;
      }).observe(message, { childList: true });
  }

  function matches(source: SourceId, element: HTMLElement): boolean {
    const query = search?.value.trim().toLowerCase() ?? "";
    if (query && !(element.dataset["search"] ?? "").includes(query)) return false;
    switch (filter) {
      case "loaded":
        return state.results.has(source);
      case "api":
        return element.dataset["api"] === "true";
      case "readonly":
        return element.dataset["readonly"] === "true";
      default:
        return true;
    }
  }

  function refresh(): void {
    let visible = 0;
    for (const { source, element } of panels) {
      const show = matches(source, element);
      element.hidden = !show;
      if (show) visible++;
    }
    if (empty) empty.hidden = visible > 0 || panels.length === 0;
    if (count) count.textContent = `${visible} of ${panels.length} services`;
    for (const chip of chips)
      chip.setAttribute("aria-pressed", String(chip.dataset["sourceFilter"] === filter));
  }

  search?.addEventListener("input", refresh);
  for (const chip of chips)
    chip.addEventListener("click", () => {
      filter = (chip.dataset["sourceFilter"] as Filter | undefined) ?? "all";
      refresh();
    });
  refresh();
  return { refresh };
}
