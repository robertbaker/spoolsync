import { SOURCE_IDS, type SourceId } from "@spoolsync/core/core/model";

import { local, read, write } from "~/lib/browser/storage/access";
import { readPreferences, updatePreferences } from "~/lib/preferences";

import { wireSlashFocus } from "../shortcuts";
import type { LoadState } from "./state";

const OPEN_KEY = "spoolsync:open-panels";
const RECENT_KEY = "spoolsync:recent-sources";
const MAX_RECENT = 4;

/** Services the visitor loaded most recently, newest first. */
function readRecent(): SourceId[] {
  try {
    const parsed: unknown = JSON.parse(read(local, RECENT_KEY) ?? "[]");
    return Array.isArray(parsed)
      ? parsed.filter((value): value is SourceId => SOURCE_IDS.includes(value as SourceId))
      : [];
  } catch {
    return [];
  }
}

/** Which panels the visitor left open, remembered per browser. `null` means no choice yet. */
function readOpenPanels(): Set<string> | null {
  const raw = read(local, OPEN_KEY);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? new Set(parsed.filter((value): value is string => typeof value === "string"))
      : null;
  } catch {
    return null;
  }
}

type Filter = "all" | "loaded" | "api" | "readonly";

/**
 * Makes the long list of services manageable: each is a native disclosure that opens itself when it
 * has something to say, with search and filter chips on top. Everything degrades to plain
 * open/closed details when this script does not run.
 */
export function wireSourcePanels(state: LoadState): {
  refresh(): void;
  markUsed(source: SourceId): void;
} {
  const panels = SOURCE_IDS.flatMap((source) => {
    const element = document.querySelector(`[data-panel="${source}"]`);
    const tile = document.querySelector<HTMLButtonElement>(`[data-tile="${source}"]`);
    return element instanceof HTMLDetailsElement && tile ? [{ source, element, tile }] : [];
  });
  const search = document.getElementById("source-search") as HTMLInputElement | null;
  const chips = [...document.querySelectorAll<HTMLButtonElement>("[data-source-filter]")];
  const empty = document.getElementById("source-empty");
  const count = document.getElementById("source-count");
  const stage = document.getElementById("source-stage");
  let filter: Filter = readPreferences().sourceFilter ?? "all";

  // Put the services used last time first. This runs once at startup so the picker never shifts
  // while the visitor is working with it.
  const recent = readRecent().slice(0, MAX_RECENT);
  for (const source of recent.toReversed()) {
    const tile = panels.find((panel) => panel.source === source)?.tile;
    tile?.parentElement?.prepend(tile);
  }

  // One service is shown at a time, in the stage under the picker. Other scripts (the palette,
  // connection links, load errors) open panels by setting `open`, so the rule lives on the panels.
  const remembered = readOpenPanels();
  if (remembered) {
    const keep = panels.find((panel) => remembered.has(panel.source));
    for (const panel of panels) panel.element.open = panel === keep;
  } else {
    const first = panels.find((panel) => panel.element.open);
    for (const panel of panels) panel.element.open = panel === first;
  }
  // Panels that open themselves to show a message are not a choice, so they are not remembered.
  const selfOpened = new Set<HTMLDetailsElement>();
  function syncTile(panel: (typeof panels)[number]): void {
    panel.tile.setAttribute("aria-expanded", String(panel.element.open));
  }
  for (const panel of panels) {
    const { source, element, tile } = panel;
    syncTile(panel);
    tile.addEventListener("click", () => {
      if (element.open) {
        element.open = false;
        return;
      }
      element.open = true;
      requestAnimationFrame(() =>
        (stage ?? element).scrollIntoView({
          block: "nearest",
          behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        }),
      );
    });
    // Keep the tile's status badge in step with the one in the panel header.
    const status = document.getElementById(`${source}-status`);
    const tileStatus = tile.querySelector("[data-tile-status]");
    if (status && tileStatus) {
      // The tile is small, so it carries a compact copy of the badge (no "from file" suffix).
      const mirror = () =>
        tileStatus.replaceChildren(
          ...[...status.children]
            .filter((child) => child.tagName !== "BUTTON")
            .filter(
              (child) =>
                // A pill for an unloaded service says nothing the name does not.
                tile.dataset["compact"] !== "true" || child.textContent !== "Not loaded",
            )
            .map((child) => {
              const copy = child.cloneNode(true) as HTMLElement;
              copy.className = copy.className.replace(
                "px-2.5 py-1 text-xs",
                "px-2 py-0.5 text-[0.68rem]",
              );
              const text = copy.lastChild;
              if (text?.nodeType === Node.TEXT_NODE)
                text.textContent = (text.textContent ?? "").replace(/ from (file|cloud|API)$/, "");
              return copy;
            }),
        );
      new MutationObserver(mirror).observe(status, {
        childList: true,
        subtree: true,
      });
      mirror();
    }
    element.addEventListener("toggle", () => {
      syncTile(panel);
      if (element.open)
        for (const other of panels)
          if (other.element !== element && other.element.open) {
            // Closed on the visitor's behalf, so it is not a choice to remember.
            selfOpened.add(other.element);
            other.element.open = false;
          }
      if (selfOpened.delete(element)) return;
      write(
        local,
        OPEN_KEY,
        JSON.stringify(panels.filter((entry) => entry.element.open).map((entry) => entry.source)),
      );
    });
    const message = document.getElementById(`${source}-message`);
    if (message)
      new MutationObserver(() => {
        if (message.childElementCount > 0 && !element.open) {
          selfOpened.add(element);
          element.open = true;
        }
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
    for (const { source, element, tile } of panels) {
      const show = matches(source, element);
      element.hidden = !show;
      tile.hidden = !show;
      if (show) visible++;
    }
    for (const section of document.querySelectorAll<HTMLElement>("[data-tile-section]"))
      section.hidden = ![...section.querySelectorAll<HTMLElement>("[data-tile]")].some(
        (tile) => !tile.hidden,
      );
    if (empty) empty.hidden = visible > 0 || panels.length === 0;
    if (count) count.textContent = `${visible} of ${panels.length} services`;
    for (const chip of chips)
      chip.setAttribute("aria-pressed", String(chip.dataset["sourceFilter"] === filter));
  }

  search?.addEventListener("input", refresh);
  wireSlashFocus(search);
  for (const chip of chips)
    chip.addEventListener("click", () => {
      filter = (chip.dataset["sourceFilter"] as Filter | undefined) ?? "all";
      updatePreferences({
        sourceFilter: filter === "all" ? undefined : filter,
      });
      refresh();
    });
  refresh();
  function markUsed(source: SourceId): void {
    write(
      local,
      RECENT_KEY,
      JSON.stringify(
        [source, ...readRecent().filter((entry) => entry !== source)].slice(0, MAX_RECENT),
      ),
    );
  }

  return { refresh, markUsed };
}
